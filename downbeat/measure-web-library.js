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
      width: "min(840px, 94vw)", maxHeight: "92vh", padding: "34px",
      border: "1px solid rgba(187,160,242,.88)", borderRadius: "18px",
      background: "linear-gradient(135deg, #3d3656 0%, #28233c 58%, #211c31 100%)",
      boxShadow: "0 28px 90px rgba(0,0,0,.68)", boxSizing: "border-box",
    });
    const eyebrow = document.createElement("div");
    eyebrow.textContent = "OPEN-SOURCE VIDEO  /  BROWSER PREVIEW";
    Object.assign(eyebrow.style, { color: "#c7b0f4", font: "600 12px system-ui", letterSpacing: ".045em", marginBottom: "8px" });
    const heading = document.createElement("div");
    heading.textContent = "VIDEO SOURCE PREVIEW";
    Object.assign(heading.style, { color: "#f4f0f8", font: "600 27px system-ui", letterSpacing: ".015em", margin: "0 0 6px" });
    const metadata = document.createElement("div");
    metadata.textContent = [title, credit].filter(Boolean).join("  /  ") || "Open-source media";
    Object.assign(metadata.style, { color: "#d8c9f6", font: "15px system-ui", margin: "0 0 16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    const video = document.createElement("video");
    video.controls = true;
    // Browser Discovery is an attribution-preserving source preview. Starting
    // only after an explicit action is both clearer and less likely to be
    // blocked by a browser's autoplay policy.
    video.autoplay = false;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    Object.assign(video.style, { display: "block", width: "100%", aspectRatio: "16 / 9", maxHeight: "52vh", objectFit: "contain", background: "#07050e", border: "1px solid rgba(215,198,255,.28)" });
    const desktopNotice = document.createElement("p");
    desktopNotice.textContent = "This is a source preview only. Download the free desktop app to add it to your library and play its auto-charted session with video.";
    Object.assign(desktopNotice.style, { color: "#d8c9f6", font: "14px system-ui", lineHeight: "1.45", margin: "15px 0 0" });
    const footer = document.createElement("div");
    Object.assign(footer.style, { display: "flex", gap: "10px", justifyContent: "space-between", alignItems: "center", marginTop: "10px" });
    const attribution = document.createElement("span");
    attribution.textContent = credit ? `SOURCE PREVIEW  /  ${credit}` : "SOURCE PREVIEW";
    Object.assign(attribution.style, { color: "#b5abc5", font: "12px system-ui", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    const actions = document.createElement("span");
    Object.assign(actions.style, { display: "inline-flex", gap: "10px", alignItems: "center" });
    const play = document.createElement("button");
    play.textContent = "▶  PLAY SOURCE VIDEO";
    play.type = "button";
    play.setAttribute("aria-label", "Play source video and audio preview");
    play.onclick = async () => {
      try {
        await video.play();
        desktopNotice.textContent = "You are watching the original source. The browser does not add it to your playable library.";
      } catch (_) {
        desktopNotice.textContent = "Your browser needs permission to play this source preview. Download the free desktop app to experience this music as a playable session with video.";
      }
    };
    Object.assign(play.style, { color: "#171222", background: "#bba0f2", border: "0", borderRadius: "4px", padding: "10px 14px", font: "700 12px system-ui", cursor: "pointer" });
    const source = document.createElement("a");
    source.textContent = "SOURCE ↗";
    source.href = page || url;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    Object.assign(source.style, { color: "#d8c9f6", font: "600 12px system-ui" });
    const close = document.createElement("button");
    close.textContent = "CLOSE";
    close.type = "button";
    close.onclick = closePreview;
    Object.assign(close.style, { color: "#171222", background: "#bba0f2", border: "0", borderRadius: "4px", padding: "10px 14px", font: "700 12px system-ui", cursor: "pointer" });
    actions.append(play, source, close);
    footer.append(attribution, actions);
    frame.append(eyebrow, heading, metadata, video, desktopNotice, footer);
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
