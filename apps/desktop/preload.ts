// Runs in the page before the web app, sandboxed: the web app learns it is inside the desktop app (Task 3.1),
// so its recordings get source "desktop". Nothing else of Electron or Node reaches the page.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("voiceNotesDesktop", {
  version: ipcRenderer.sendSync("vn:version") as string,
});
