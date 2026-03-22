import { useState, useCallback, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import LeftPane from "./components/LeftPane";
import EditorPane, { type EditorTab } from "./components/EditorPane";
import ConsolePane from "./components/ConsolePane";
import RightPane from "./components/RightPane";
import {
  type AppSettings,
  type AppWindowState,
  type CursorPos,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  loadAppState,
  saveAppState,
  openSettingsWindow,
} from "./lib/settings";
import { invoke } from "@tauri-apps/api/core";

let tabCounter = 1;

type DragTarget = "left" | "right" | "console" | null;

export default function App() {
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [restoredExpandedDirs, setRestoredExpandedDirs] = useState<string[]>([]);

  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(220);
  const [consoleHeight, setConsoleHeight] = useState(220);

  const [activeDrag, setActiveDrag] = useState<DragTarget>(null);
  const dragRef = useRef({ target: null as DragTarget, startPos: 0, startSize: 0 });

  // editorTabs を ref で保持（openFile の useCallback 安定化用）
  const editorTabsRef = useRef(editorTabs);
  editorTabsRef.current = editorTabs;

  // タブ選択履歴の追跡
  const tabHistoryRef = useRef<string[]>([]);
  // カーソル位置の追跡
  const cursorPositionsRef = useRef<Record<string, CursorPos>>({});
  // 展開ディレクトリの追跡
  const expandedDirsRef = useRef<string[]>([]);

  // 設定読み込み（起動時 + ウィンドウフォーカス時に再読み込み）
  function reloadSettings() {
    loadSettings().then(setSettings).catch(() => {});
  }

  useEffect(() => {
    reloadSettings();
    const onFocus = () => reloadSettings();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // アプリ状態の復元（起動時）
  useEffect(() => {
    loadAppState().then(async (state) => {
      const win = getCurrentWindow();
      const dpi = await import("@tauri-apps/api/dpi");
      // ウィンドウ位置・サイズ（不可視のまま復元）
      if (state.windowWidth && state.windowHeight) {
        try {
          await win.setSize(new dpi.LogicalSize(state.windowWidth, state.windowHeight));
        } catch {}
      }
      if (state.windowX != null && state.windowY != null) {
        try {
          await win.setPosition(new dpi.LogicalPosition(state.windowX, state.windowY));
        } catch {}
      }
      // ペインサイズ
      if (state.leftWidth) setLeftWidth(state.leftWidth);
      if (state.rightWidth) setRightWidth(state.rightWidth);
      if (state.consoleHeight) setConsoleHeight(state.consoleHeight);
      // 展開されたフォルダ
      if (state.expandedDirs?.length > 0) setRestoredExpandedDirs(state.expandedDirs);
      // カーソル位置
      if (state.cursorPositions) cursorPositionsRef.current = state.cursorPositions;
      // 開いていたファイルを復元
      if (state.openFiles?.length > 0) {
        const tabs: EditorTab[] = [];
        for (const path of state.openFiles) {
          try {
            const content = await invoke<string>("read_file", { path });
            const name = path.split(/[\\/]/).pop() ?? path;
            tabs.push({ id: `tab-${tabCounter++}`, path, name, content, modified: false });
          } catch { /* ファイルがなければスキップ */ }
        }
        if (tabs.length > 0) {
          setEditorTabs(tabs);
          const activeFile = state.activeFile;
          const activeT = activeFile ? tabs.find(t => t.path === activeFile) : tabs[tabs.length - 1];
          if (activeT) setActiveTabId(activeT.id);
        }
      }
      // 復元完了後にウィンドウを表示
      await win.show();
    }).catch(async () => {
      // 復元失敗時もウィンドウを表示
      try { await getCurrentWindow().show(); } catch {}
    });
  }, []);

  // アプリ状態の保存
  const saveStateRef = useRef<() => Promise<void>>(async () => {});
  saveStateRef.current = async () => {
    try {
      const win = getCurrentWindow();
      const size = await win.outerSize();
      const pos = await win.outerPosition();
      const factor = await win.scaleFactor();
      const state: AppWindowState = {
        windowX: Math.round(pos.x / factor),
        windowY: Math.round(pos.y / factor),
        windowWidth: Math.round(size.width / factor),
        windowHeight: Math.round(size.height / factor),
        leftWidth,
        rightWidth,
        consoleHeight,
        expandedDirs: expandedDirsRef.current,
        openFiles: editorTabsRef.current.filter(t => t.path && t.type !== "browser" && t.type !== "image").map(t => t.path),
        activeFile: editorTabsRef.current.find(t => t.id === activeTabId)?.path ?? null,
        cursorPositions: cursorPositionsRef.current,
      };
      await saveAppState(state);
    } catch {}
  };

  // 定期的な状態保存（5秒ごと）+ ウィンドウ閉じ前
  useEffect(() => {
    const interval = setInterval(() => { saveStateRef.current?.(); }, 5000);
    const handler = () => { saveStateRef.current?.(); };
    window.addEventListener("beforeunload", handler);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handler);
    };
  }, []);

  const onResizeStart = useCallback(
    (target: DragTarget, e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current.target = target;
      setActiveDrag(target);
      if (target === "console") {
        dragRef.current.startPos = e.clientY;
        dragRef.current.startSize = consoleHeight;
      } else if (target === "left") {
        dragRef.current.startPos = e.clientX;
        dragRef.current.startSize = leftWidth;
      } else if (target === "right") {
        dragRef.current.startPos = e.clientX;
        dragRef.current.startSize = rightWidth;
      }
    },
    [leftWidth, rightWidth, consoleHeight]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const { target, startPos, startSize } = dragRef.current;
      if (!target) return;

      if (target === "left") {
        const delta = e.clientX - startPos;
        setLeftWidth(Math.max(120, Math.min(600, startSize + delta)));
      } else if (target === "right") {
        const delta = startPos - e.clientX;
        setRightWidth(Math.max(120, Math.min(600, startSize + delta)));
      } else if (target === "console") {
        const delta = startPos - e.clientY;
        setConsoleHeight(Math.max(80, Math.min(600, startSize + delta)));
      }
    };

    const onMouseUp = () => {
      if (dragRef.current.target) {
        dragRef.current.target = null;
        setActiveDrag(null);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const openFile = useCallback((path: string, content: string) => {
    const existing = editorTabsRef.current.find((t) => t.path === path);
    if (existing) {
      selectTab(existing.id);
      return;
    }
    const name = path.split(/[\\/]/).pop() ?? path;
    const newTab: EditorTab = {
      id: `tab-${tabCounter++}`,
      path,
      name,
      content,
      modified: false,
    };
    setEditorTabs((prev) => [...prev, newTab]);
    selectTab(newTab.id);
  }, []);

  function newTab() {
    const newT: EditorTab = {
      id: `tab-${tabCounter++}`,
      path: "",
      name: "新しいファイル",
      content: "",
      modified: false,
    };
    setEditorTabs((prev) => [...prev, newT]);
    selectTab(newT.id);
  }

  function selectTab(id: string) {
    setActiveTabId((prev) => {
      if (prev && prev !== id) {
        tabHistoryRef.current = tabHistoryRef.current.filter(h => h !== prev);
        tabHistoryRef.current.push(prev);
      }
      return id;
    });
  }

  function closeTab(id: string) {
    setEditorTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        // 履歴から前のタブを探す
        let nextTab: string | null = null;
        while (tabHistoryRef.current.length > 0) {
          const candidate = tabHistoryRef.current.pop()!;
          if (filtered.find(t => t.id === candidate)) {
            nextTab = candidate;
            break;
          }
        }
        setActiveTabId(nextTab ?? (filtered.length > 0 ? filtered[filtered.length - 1].id : null));
      }
      // 閉じたタブを履歴からも除去
      tabHistoryRef.current = tabHistoryRef.current.filter(h => h !== id);
      return filtered;
    });
  }

  function updateContent(id: string, content: string) {
    setEditorTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, content, modified: true } : t))
    );
  }

  function markSaved(id: string) {
    setEditorTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, modified: false } : t))
    );
  }

  // ディレクトリ変更時に設定に保存
  function handleDirChange(dir: string) {
    setSettings((prev) => {
      const next = { ...prev, lastOpenDir: dir };
      saveSettings(next).catch(() => {});
      return next;
    });
  }

  // カーソル位置変更コールバック
  function handleCursorChange(id: string, start: number, end: number) {
    const tab = editorTabsRef.current.find(t => t.id === id);
    if (tab?.path) {
      cursorPositionsRef.current[tab.path] = { start, end };
    }
  }

  // 写真クリック → エディタタブで画像表示
  function handlePhotoClick(path: string, dataUrl: string) {
    const name = path.split(/[\\/]/).pop() ?? "写真";
    const existing = editorTabsRef.current.find(t => t.path === path && t.type === "image");
    if (existing) { selectTab(existing.id); return; }
    const newTab: EditorTab = {
      id: `tab-${tabCounter++}`, path, name, content: "", modified: false, type: "image", url: dataUrl,
    };
    setEditorTabs(prev => [...prev, newTab]);
    selectTab(newTab.id);
  }

  // Diffタブを開く（使いまわし）
  function handleDiffOpen(path: string, diffContent: string) {
    const name = path.split(/[\\/]/).pop() ?? path;
    const existing = editorTabsRef.current.find(t => t.type === "diff");
    if (existing) {
      // 既存のDiffタブを更新
      setEditorTabs(prev => prev.map(t =>
        t.type === "diff" ? { ...t, path, name, content: diffContent, modified: false } : t
      ));
      selectTab(existing.id);
    } else {
      const newTab: EditorTab = {
        id: `tab-${tabCounter++}`, path, name, content: diffContent, modified: false, type: "diff",
      };
      setEditorTabs(prev => [...prev, newTab]);
      selectTab(newTab.id);
    }
  }

  // ニュースクリック → システムブラウザで開く
  async function handleNewsClick(_title: string, url: string) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      // フォールバック: window.openで開く
      window.open(url, "_blank");
    }
  }

  const activeTab = editorTabs.find((t) => t.id === activeTabId);
  const activeFilePath = activeTab?.path || null;

  const win = getCurrentWindow();

  return (
    <div className="app-layout">
      <header className="app-header" data-tauri-drag-region>
        <span className="app-title" data-tauri-drag-region>ALICE</span>
        <span className="app-subtitle" data-tauri-drag-region>AI Local Interface for Code Editor</span>
        <div className="window-controls">
          <button
            className="wc-btn wc-settings"
            title="設定"
            onClick={() => openSettingsWindow().catch(() => {})}
          >
            ⚙
          </button>
          <button className="wc-btn wc-min" title="最小化" onClick={() => win.minimize()}>─</button>
          <button className="wc-btn wc-max" title="最大化" onClick={() => win.toggleMaximize()}>□</button>
          <button className="wc-btn wc-close" title="閉じる" onClick={() => win.close()}>✕</button>
        </div>
      </header>
      <div className="main-layout" data-resizing={activeDrag || undefined}>
        <div style={{ width: leftWidth, flexShrink: 0 }}>
          <LeftPane
            onFileOpen={openFile}
            onDiffOpen={handleDiffOpen}
            selectedFilePath={activeFilePath}
            initialDir={settings.lastOpenDir ?? undefined}
            onDirChange={handleDirChange}
            showHidden={settings.files.showHidden}
            initialExpandedDirs={restoredExpandedDirs}
            onExpandedDirsChange={(dirs) => { expandedDirsRef.current = dirs; }}
          />
        </div>
        <div
          className="resize-handle resize-handle-col"
          onMouseDown={(e) => onResizeStart("left", e)}
        />
        <div className="center-layout">
          <EditorPane
            tabs={editorTabs}
            activeTabId={activeTabId}
            onTabSelect={selectTab}
            onTabClose={closeTab}
            onContentChange={updateContent}
            onSaved={markSaved}
            onNewTab={newTab}
            fontSize={settings.editor.fontSize}
            autoSave={settings.editor.autoSave}
            onCursorChange={handleCursorChange}
            cursorPositions={cursorPositionsRef.current}
          />
          <div
            className="resize-handle resize-handle-row"
            onMouseDown={(e) => onResizeStart("console", e)}
          />
          <div style={{ height: consoleHeight, flexShrink: 0 }}>
            <ConsolePane cwd={settings.lastOpenDir ?? undefined} />
          </div>
        </div>
        <div
          className="resize-handle resize-handle-col"
          onMouseDown={(e) => onResizeStart("right", e)}
        />
        <div style={{ width: rightWidth, flexShrink: 0 }}>
          <RightPane
            widgetItems={settings.widgets.items}
            settings={settings}
            onPhotoClick={handlePhotoClick}
            onNewsClick={handleNewsClick}
          />
        </div>
      </div>
    </div>
  );
}
