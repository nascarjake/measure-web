/*
 * MEASURE's browser-only local library bridge.
 *
 * Files selected here stay in the browser. The Godot client reads the chosen
 * file in bounded Uint8Array chunks and writes it to its user:// sandbox; this
 * script never uploads or exposes a local filesystem path. Open-source media
 * previews stream directly from their original host inside the browser.
 */
(() => {
  const maxBytes = 100 * 1024 * 1024;
  const supported = new Set(["mp3", "ogg", "wav"]);
  let selectedFile = null;
  let selectedBuffer = null;
  let state = "idle";
  let error = "";
  let storage = { quota: 0, usage: 0, persistent: false };
  let previewOverlay = null;
  let previewVideo = null;

  const extensionOf = (name) => {
    const point = name.lastIndexOf(".");
    return point >= 0 ? name.slice(point + 1).toLowerCase() : "";
  };

  const refreshStorage = async () => {
    if (!navigator.storage) return;
    try {
      const estimate = await navigator.storage.estimate();
      storage.usage = Number(estimate.usage || 0);
      storage.quota = Number(estimate.quota || 0);
      storage.persistent = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      // This is requested only after the player selected a local file. Browsers
      // may decline; MEASURE still explains that a browser cache is not a disk.
      if (!storage.persistent && navigator.storage.persist) {
        storage.persistent = await navigator.storage.persist();
      }
    } catch (_) {
      // Storage estimates are informational only. Import remains local.
    }
  };

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav";
  input.hidden = true;
  input.setAttribute("aria-hidden", "true");
  const attachInput = () => {
    if (document.body && !input.isConnected) document.body.appendChild(input);
  };
  if (document.body) attachInput();
  else document.addEventListener("DOMContentLoaded", attachInput, { once: true });

  const closePreview = () => {
    if (previewVideo) {
      previewVideo.pause();
      previewVideo.removeAttribute("src");
      previewVideo.load();
    }
    if (previewOverlay) previewOverlay.remove();
    previewOverlay = null;
    previewVideo = null;
  };

  const previewVideoFromSource = ({ url, title, credit, page }) => {
    if (!url || !/^https:\/\//.test(url)) return false;
    closePreview();
    const overlay = document.createElement("section");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", title || "Open video preview");
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", zIndex: "2147483647", display: "grid",
      placeItems: "center", padding: "24px", background: "rgba(7, 5, 14, .84)",
    });
    const frame = document.createElement("div");
    Object.assign(frame.style, {
      width: "min(960px, 94vw)", maxHeight: "92vh", padding: "14px",
      border: "1px solid rgba(187,160,242,.9)", borderRadius: "14px",
      background: "#171222", boxShadow: "0 24px 80px rgba(0,0,0,.6)",
    });
    const heading = document.createElement("div");
    heading.textContent = title || "OPEN VIDEO PREVIEW";
    Object.assign(heading.style, { color: "#f4f0f8", font: "600 16px system-ui", margin: "2px 2px 10px" });
    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    Object.assign(video.style, { display: "block", width: "100%", maxHeight: "72vh", background: "#000" });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", gap: "10px", justifyContent: "space-between", alignItems: "center", marginTop: "10px" });
    const attribution = document.createElement("span");
    attribution.textContent = credit ? `Source preview · ${credit}` : "Source preview";
    Object.assign(attribution.style, { color: "#b5abc5", font: "12px system-ui", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    const actions = document.createElement("span");
    const source = document.createElement("a");
    source.textContent = "SOURCE ↗";
    source.href = page || url;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    Object.assign(source.style, { color: "#bba0f2", font: "600 12px system-ui", marginRight: "16px" });
    const close = document.createElement("button");
    close.textContent = "CLOSE";
    close.type = "button";
    close.onclick = closePreview;
    Object.assign(close.style, { color: "#171222", background: "#bba0f2", border: "0", borderRadius: "4px", padding: "8px 13px", font: "700 12px system-ui", cursor: "pointer" });
    actions.append(source, close);
    footer.append(attribution, actions);
    frame.append(heading, video, footer);
    overlay.append(frame);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closePreview(); });
    document.body.append(overlay);
    previewOverlay = overlay;
    previewVideo = video;
    return true;
  };

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) {
      state = "idle";
      return;
    }
    const extension = extensionOf(file.name);
    if (!supported.has(extension)) {
      error = "Choose an MP3, Ogg, or WAV file.";
      state = "error";
      return;
    }
    if (file.size <= 0 || file.size > maxBytes) {
      error = "Browser imports are limited to 100 MiB per audio file.";
      state = "error";
      return;
    }
    selectedFile = file;
    state = "reading";
    error = "";
    try {
      selectedBuffer = await file.arrayBuffer();
      await refreshStorage();
      state = "ready";
    } catch (_) {
      selectedFile = null;
      selectedBuffer = null;
      error = "The browser could not read that local file.";
      state = "error";
    }
  });

  window.MeasureWebLibrary = {
    pickAudio() {
      selectedFile = null;
      selectedBuffer = null;
      error = "";
      state = "picking";
      input.value = "";
      input.click();
    },
    status() {
      return JSON.stringify({
        state,
        error,
        name: selectedFile ? selectedFile.name : "",
        size: selectedFile ? selectedFile.size : 0,
        type: selectedFile ? selectedFile.type : "",
        storage,
      });
    },
    readChunk(offset, length) {
      if (!selectedBuffer || offset < 0 || length <= 0) return new Uint8Array();
      return new Uint8Array(selectedBuffer.slice(offset, Math.min(selectedBuffer.byteLength, offset + length)));
    },
    clear() {
      selectedFile = null;
      selectedBuffer = null;
      error = "";
      state = "idle";
    },
    previewVideo: previewVideoFromSource,
    closePreview,
  };
})();
