// Main window preload. The app is a normal web app served from 127.0.0.1, so it
// needs no privileged bridge for its core features. We expose a tiny, read-only
// `window.desktop` flag so the renderer can feature-detect the Electron build and
// switch the in-app browser from <iframe> to a real <webview> (真实浏览器).
const { contextBridge, ipcRenderer, webUtils } = require("electron");

// 首次保存自由中转后，把对话默认模型切到「自由中转」，避免仍打到内置模型 ID。
// preload 在页面任何脚本之前同步执行：趁设置 store 尚未水合直接写 localStorage，
// 代替旧实现「did-finish-load 后 executeJavaScript 改值 + location.reload()」——
// 那次 reload 让首屏全部 SSR/水合工作白跑一遍。
try {
  if (ipcRenderer.sendSync("desktop:needs-model-bind")) {
    const key = "gailvlun-settings-v1";
    const s = JSON.parse(localStorage.getItem(key) || "{}");
    if (!s._desktopCustomBound) {
      s.selectedModelId = "custom-openai";
      s._desktopCustomBound = true;
      localStorage.setItem(key, JSON.stringify(s));
    }
  }
} catch {
  // 设置写入失败不阻塞启动；settings 水合会按原值继续。
}

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  platform: process.platform,
  localFiles: {
    register: (file, owner, id) => ipcRenderer.invoke('local-files:register', { path: webUtils.getPathForFile(file), owner, id }),
    info: (id, owner) => ipcRenderer.invoke('local-files:info', { id, owner }),
    read: (id, owner, start, end, version) => ipcRenderer.invoke('local-files:read', { id, owner, start, end,version }),
    remove: (id, owner) => ipcRenderer.invoke('local-files:remove', { id, owner }),
  },
  secrets: {
    load: () => ipcRenderer.invoke("secrets:load"),
    save: (payload) => ipcRenderer.invoke("secrets:save", payload),
  },
});
