import { invoke } from "@tauri-apps/api/core";

export interface WidgetItem {
  id: string;
  visible: boolean;
}

export interface AppSettings {
  editor: {
    autoSave: boolean;
    fontSize: number;
  };
  widgets: {
    items: WidgetItem[];
    photoFolder?: string | null;
    photoInterval: number;
    newsKeywords: string[];
    newsInterval: number;
  };
  files: {
    showHidden: boolean;
  };
  lastOpenDir?: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  editor: {
    autoSave: false,
    fontSize: 13,
  },
  widgets: {
    items: [
      { id: "clock", visible: true },
      { id: "calendar", visible: true },
      { id: "weather", visible: true },
      { id: "photo", visible: true },
      { id: "news", visible: true },
      { id: "systemMonitor", visible: true },
      { id: "info", visible: true },
    ],
    photoFolder: null,
    photoInterval: 10,
    newsKeywords: [],
    newsInterval: 30,
  },
  files: {
    showHidden: false,
  },
};

export const WIDGET_LABELS: Record<string, string> = {
  clock: "時刻",
  calendar: "カレンダー",
  weather: "天気",
  photo: "写真",
  news: "ニュース",
  systemMonitor: "システムモニター",
  info: "ALICE について",
};

export async function loadSettings(): Promise<AppSettings> {
  const settings = await invoke<AppSettings>("load_settings");
  // 既存の settings.json に新しいウィジェットが含まれていない場合にマージ
  const existingIds = new Set(settings.widgets.items.map((w) => w.id));
  const missingWidgets = DEFAULT_SETTINGS.widgets.items.filter(
    (w) => !existingIds.has(w.id)
  );
  if (missingWidgets.length > 0) {
    settings.widgets.items = [...settings.widgets.items, ...missingWidgets];
  }
  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function openSettingsWindow(): Promise<void> {
  return invoke("open_settings_window");
}

// ─── アプリ状態 ───

export interface CursorPos {
  start: number;
  end: number;
}

export interface AppWindowState {
  windowX?: number | null;
  windowY?: number | null;
  windowWidth?: number | null;
  windowHeight?: number | null;
  leftWidth?: number | null;
  rightWidth?: number | null;
  consoleHeight?: number | null;
  expandedDirs: string[];
  openFiles: string[];
  activeFile?: string | null;
  cursorPositions: Record<string, CursorPos>;
}

export async function loadAppState(): Promise<AppWindowState> {
  return invoke<AppWindowState>("load_app_state");
}

export async function saveAppState(state: AppWindowState): Promise<void> {
  return invoke("save_app_state", { state });
}
