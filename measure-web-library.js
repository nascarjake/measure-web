/*
 * MEASURE's browser-only local library bridge.
 *
 * Files selected here stay in the browser. The Godot client reads the chosen
 * file in bounded Uint8Array chunks and writes it to its user:// sandbox; this
 * script never uploads, fetches, or exposes a local filesystem path.
 */
(() => {
  const maxBytes = 100 * 1024 * 1024;
  const supported = new Set(["mp3", "ogg", "wav"]);
  let selectedFile = null;
  let selectedBuffer = null;
  let state = "idle";
  let error = "";
  let storage = { quota: 0, usage: 0, persistent: false };

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
  };
})();
