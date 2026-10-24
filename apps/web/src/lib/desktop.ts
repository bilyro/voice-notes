// Set by the desktop app's preload (apps/desktop/preload.ts, Task 3.1); undefined in a browser.
declare global {
  interface Window {
    voiceNotesDesktop?: { version: string };
  }
}

/** Inside the Voice notes desktop app (Electron), not a browser tab. */
export const inDesktopApp = () => typeof window !== "undefined" && !!window.voiceNotesDesktop;
