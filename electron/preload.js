const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,

  // ── Window controls (D1-style) ──
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  setFullscreen: (fullscreen) => ipcRenderer.invoke("window:setFullscreen", fullscreen),

  // Fullscreen state change listener (F11, OS window manager)
  onFullscreenChanged: (callback) => {
    ipcRenderer.on("window:fullscreenChanged", (_event, value) => callback(value));
    return () => {
      ipcRenderer.removeAllListeners("window:fullscreenChanged");
    };
  },

});
