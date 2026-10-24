// Voice notes for macOS (Task 3.1): the web app in its own window. The same API and the same sign-in: Electron keeps
// the session cookie, like a browser. Clients only record and display, so the app adds no logic of its own yet.
import { app, BrowserWindow, ipcMain, Menu, screen, session, shell, type Rectangle } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// dev: the Vite server; later the server's address from the app's settings (when the server is online, Task 1.16)
const WEB_URL = process.env.VOICE_NOTES_URL ?? "http://localhost:5173";
const WEB_ORIGIN = new URL(WEB_URL).origin;
const BOARD = "#E9E4DC";                       // --color-board: what shows before the page has painted

// before "ready": the menu shows this name, and settings live in ~/Library/Application Support/Voice notes
app.setName("Voice notes");

const isOurs = (url: string) => {
  try {
    return new URL(url).origin === WEB_ORIGIN;
  } catch {
    return false;
  }
};

/** Links to other sites open in the normal browser; only web and mail links, never file: or custom schemes. */
function openOutside(url: string) {
  if (!/^(https?|mailto):/i.test(url)) return;
  console.log("opening in the browser:", url);
  void shell.openExternal(url);
}

// --- window size and position, remembered between launches -----------------------------------------------------
const stateFile = () => join(app.getPath("userData"), "window-state.json");

/** The saved bounds, if they still fit on a connected screen (a monitor may have been unplugged since). */
function savedBounds(): Rectangle | undefined {
  try {
    const b = JSON.parse(readFileSync(stateFile(), "utf8")) as Rectangle;
    if (![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width < 400 || b.height < 300) return undefined;
    const area = screen.getDisplayMatching(b).workArea;
    const overlap = Math.min(b.x + b.width, area.x + area.width) - Math.max(b.x, area.x);
    const titleBarOnScreen = b.y >= area.y - 10 && b.y < area.y + area.height - 40;
    return overlap >= 100 && titleBarOnScreen ? b : undefined;
  } catch {
    return undefined;                          // first launch, or an unreadable file: the default size, centered
  }
}

function remember(win: BrowserWindow) {
  let timer: NodeJS.Timeout | undefined;
  const save = () => {
    clearTimeout(timer);
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    try {
      writeFileSync(stateFile(), JSON.stringify(win.getNormalBounds()));
    } catch (e) {
      console.error("could not save the window position:", e);
    }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(save, 500); };
  win.on("resize", later);
  win.on("move", later);
  win.on("close", save);
}

// --- the window -------------------------------------------------------------------------------------------------
let main: BrowserWindow | null = null;

function createWindow() {
  const bounds = savedBounds();
  const win = new BrowserWindow({
    ...(bounds ?? { width: 1200, height: 820 }),
    minWidth: 400,
    minHeight: 300,
    show: false,
    backgroundColor: BOARD,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  remember(win);
  win.once("ready-to-show", () => win.show());

  // target=_blank / window.open: ours stays in this window, anything else goes to the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOurs(url)) void win.loadURL(url);
    else openOutside(url);
    return { action: "deny" };
  });
  // a plain link to another site would otherwise replace the app inside the window
  win.webContents.on("will-navigate", (e, url) => {
    if (isOurs(url)) return;
    e.preventDefault();
    openOutside(url);
  });

  void win.loadURL(WEB_URL);
  win.on("closed", () => { main = null; });
  return win;
}

// --- app --------------------------------------------------------------------------------------------------------
// one app at a time: opening it again brings the window back
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (!main) return;
  if (main.isMinimized()) main.restore();
  main.focus();
});

// the preload asks once, synchronously, so `window.voiceNotesDesktop.version` is there before the page runs
ipcMain.on("vn:version", (e) => { e.returnValue = app.getVersion(); });

void app.whenReady().then(() => {
  // the microphone and the clipboard ("Copy as Markdown") for our pages; nothing for anyone else
  session.defaultSession.setPermissionRequestHandler((wc, permission, done) => {
    done(isOurs(wc.getURL()) && ["media", "clipboard-sanitized-write"].includes(permission));
  });

  // the standard macOS menu: app (About, Hide, Quit), File, Edit (copy/paste), View (reload, zoom), Window
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" }, { role: "fileMenu" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
  ]));

  main = createWindow();
  // macOS: closing the window keeps the app in the Dock; clicking the Dock icon opens it again
  app.on("activate", () => { if (!main) main = createWindow(); });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
