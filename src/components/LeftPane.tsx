import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import FileIcon from "./FileIcon";
import GitPane from "./GitPane";

interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  accessible: boolean;
}

interface GrepMatch {
  path: string;
  lineNumber: number;
  line: string;
}

interface DirItem {
  name: string;
  path: string;
  isDir: boolean;
  accessible: boolean;
}

interface LeftPaneProps {
  onFileOpen: (path: string, content: string) => void;
  onDiffOpen?: (path: string, content: string) => void;
  onGrepResult?: (query: string, content: string, baseDir?: string) => void;
  selectedFilePath?: string | null;
  initialDir?: string;
  onDirChange?: (dir: string) => void;
  showHidden?: boolean;
  initialExpandedDirs?: string[];
  onExpandedDirsChange?: (dirs: string[]) => void;
  onReady?: () => void;
  recentDirs?: string[];
  onOpenRecentDir?: (dir: string) => void;
}

const IS_MAC = navigator.platform.startsWith("Mac");

export default function LeftPane({ onFileOpen, onDiffOpen, onGrepResult, selectedFilePath, initialDir, onDirChange, showHidden = false, initialExpandedDirs, onExpandedDirsChange, onReady, recentDirs, onOpenRecentDir }: LeftPaneProps) {
  const [activeTab, setActiveTab] = useState<"files" | "git" | "search">("files");
  const [currentDir, setCurrentDir] = useState<string>("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Map<string, FileItem[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showRecentMenu, setShowRecentMenu] = useState(false);
  const [grepSearching, setGrepSearching] = useState(false);
  const [searchScopeDir, setSearchScopeDir] = useState<string | null>(null);
  const [searchDirTree, setSearchDirTree] = useState<Map<string, DirItem[]>>(new Map());
  const [searchExpandedDirs, setSearchExpandedDirs] = useState<Set<string>>(new Set());

  // リネーム
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  // 新規作成
  const [creating, setCreating] = useState<{ parentDir: string; type: "file" | "folder" } | null>(null);
  const [createName, setCreateName] = useState("");
  const createRef = useRef<HTMLInputElement>(null);

  // 初期ディレクトリの復元
  const dirInitializedRef = useRef(false);
  const readyCalledRef = useRef(false);
  useEffect(() => {
    if (initialDir && !currentDir && !dirInitializedRef.current) {
      dirInitializedRef.current = true;
      openDir(initialDir);
    }
    // initialDir が無い場合は即 ready
    if (!initialDir && !readyCalledRef.current) {
      readyCalledRef.current = true;
      onReady?.();
    }
  }, [initialDir]);

  // 展開されたフォルダの復元（currentDir設定後に実行）
  const expandedDirsRestoredRef = useRef(false);
  useEffect(() => {
    if (!currentDir) return;
    if (expandedDirsRestoredRef.current) return;
    // 展開ディレクトリが無い場合は openDir 完了で ready
    if (!initialExpandedDirs || initialExpandedDirs.length === 0) {
      if (!readyCalledRef.current) {
        readyCalledRef.current = true;
        onReady?.();
      }
      return;
    }
    expandedDirsRestoredRef.current = true;

    (async () => {
      const contents = new Map<string, FileItem[]>();
      for (const dir of initialExpandedDirs) {
        if (dir === currentDir) continue;
        const items = await loadDir(dir);
        if (items) contents.set(dir, items);
      }
      if (contents.size > 0) {
        setDirContents(prev => {
          const next = new Map(prev);
          for (const [k, v] of contents) next.set(k, v);
          return next;
        });
        setExpandedDirs(prev => {
          const next = new Set(prev);
          for (const dir of initialExpandedDirs) next.add(dir);
          return next;
        });
      }
      // 展開ディレクトリ復元完了 → ready
      if (!readyCalledRef.current) {
        readyCalledRef.current = true;
        onReady?.();
      }
    })();
  }, [currentDir, initialExpandedDirs]);

  // expandedDirs 変更時にコールバック
  useEffect(() => {
    onExpandedDirsChange?.(Array.from(expandedDirs));
  }, [expandedDirs]);

  // showHidden 変更時にリロード
  const showHiddenRef = useRef(showHidden);
  useEffect(() => {
    if (showHiddenRef.current !== showHidden && currentDir) {
      showHiddenRef.current = showHidden;
      // 展開中のディレクトリをすべてリロード
      const dirs = Array.from(expandedDirs);
      Promise.all(dirs.map(async (dir) => {
        const items = await loadDir(dir);
        return items ? [dir, items] as const : null;
      })).then((results) => {
        setDirContents(prev => {
          const next = new Map(prev);
          for (const r of results) {
            if (r) next.set(r[0], r[1]);
          }
          return next;
        });
      });
    }
  }, [showHidden]);

  async function loadDir(dir: string): Promise<FileItem[] | null> {
    try {
      // 大量のファイルを一度に読み込むと応答がなくなるため、非同期で処理
      const items = await invoke<FileItem[]>("list_directory", { path: dir, showHidden });

      // ファイル数が多い場合は警告を表示
      if (items && items.length > 1000) {
        console.warn(`ディレクトリ "${dir}" に ${items.length} 個のファイルが見つかりました。`);
      }

      return items;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }

  async function openDir(dir: string) {
    setLoading(true);
    setError(null);
    const items = await loadDir(dir);
    if (items) {
      setCurrentDir(dir);
      setDirContents(new Map([[dir, items]]));
      setExpandedDirs(new Set([dir]));
      onDirChange?.(dir);
    }
    setLoading(false);
  }

  async function openDirectory() {
    try {
      const dir = await openDialog({ directory: true, multiple: false, title: "フォルダを選択" });
      if (dir && typeof dir === "string") {
        await openDir(dir);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  const toggleDir = useCallback(async (path: string) => {
    if (expandedDirs.has(path)) {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    } else {
      if (!dirContents.has(path)) {
        const items = await loadDir(path);
        if (!items) return;
        setDirContents(prev => new Map(prev).set(path, items));
      }
      setExpandedDirs(prev => new Set(prev).add(path));
    }
  }, [expandedDirs, dirContents]);

  async function handleFileClick(file: FileItem) {
    if (file.isDir) {
      if (!file.accessible) {
        setError(`アクセスが拒否されました: ${file.name}`);
        return;
      }
      await toggleDir(file.path);
    } else {
      try {
        const content = await invoke<string>("read_file", { path: file.path });
        onFileOpen(file.path, content);
      } catch (e) {
        setError(String(e));
      }
    }
  }

  // リネーム
  function startRename(path: string, name: string) {
    setRenamingPath(path);
    setRenameValue(name);
    setTimeout(() => renameRef.current?.select(), 0);
  }

  async function commitRename() {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }
    const oldPath = renamingPath;
    const parentDir = oldPath.replace(/[\\/][^\\/]+$/, "");
    const sep = oldPath.includes("\\") ? "\\" : "/";
    const newPath = parentDir + sep + renameValue.trim();
    if (newPath !== oldPath) {
      try {
        await invoke("rename_path", { oldPath, newPath });
        // リロード
        const items = await loadDir(parentDir);
        if (items) {
          setDirContents(prev => new Map(prev).set(parentDir, items));
        }
      } catch (e) {
        setError(String(e));
      }
    }
    setRenamingPath(null);
  }

  // 新規作成
  async function startCreate(parentDir: string, type: "file" | "folder") {
    // 対象ディレクトリが展開されていなければ展開する
    if (!expandedDirs.has(parentDir)) {
      if (!dirContents.has(parentDir)) {
        const items = await loadDir(parentDir);
        if (!items) return;
        setDirContents(prev => new Map(prev).set(parentDir, items));
      }
      setExpandedDirs(prev => new Set(prev).add(parentDir));
    }
    setCreating({ parentDir, type });
    setCreateName("");
    setTimeout(() => createRef.current?.focus(), 0);
  }

  async function commitCreate() {
    if (!creating || !createName.trim()) {
      setCreating(null);
      return;
    }
    const sep = creating.parentDir.includes("\\") ? "\\" : "/";
    const newPath = creating.parentDir + sep + createName.trim();
    try {
      if (creating.type === "folder") {
        await invoke("create_directory", { path: newPath });
      } else {
        await invoke("write_file", { path: newPath, content: "" });
      }
      const items = await loadDir(creating.parentDir);
      if (items) {
        setDirContents(prev => new Map(prev).set(creating.parentDir, items));
      }
      // 作成先を展開
      setExpandedDirs(prev => new Set(prev).add(creating.parentDir));
      // ファイルの場合は作成したファイルを開く
      if (creating.type === "file") {
        onFileOpen(newPath, "");
      }
    } catch (e) {
      setError(String(e));
    }
    setCreating(null);
  }

  function handleItemKeyDown(e: React.KeyboardEvent, file: FileItem) {
    // F2 (Windows) / Enter (Mac) でリネーム開始
    if ((IS_MAC && e.key === "Enter") || (!IS_MAC && e.key === "F2")) {
      e.preventDefault();
      startRename(file.path, file.name);
    }
  }

  // コンテキストメニュー
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: FileItem } | null>(null);

  function handleContextMenu(e: React.MouseEvent, item: FileItem) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }

  // グローバルクリックでメニューを閉じる
  useEffect(() => {
    if (!contextMenu && !showRecentMenu) return;
    const close = () => { setContextMenu(null); setShowRecentMenu(false); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu, showRecentMenu]);

  async function handleDelete(item: FileItem) {
    setContextMenu(null);
    const msg = item.isDir
      ? `フォルダ「${item.name}」とその中身をすべて削除しますか？`
      : `ファイル「${item.name}」を削除しますか？`;
    if (!window.confirm(msg)) return;
    try {
      await invoke("delete_path", { path: item.path });
      // 親ディレクトリをリロード
      const parentDir = item.path.replace(/[\\/][^\\/]+$/, "");
      const items = await loadDir(parentDir);
      if (items) {
        setDirContents(prev => new Map(prev).set(parentDir, items));
      }
    } catch (e) {
      setError(String(e));
    }
  }

  // ドラッグ&ドロップによるファイル移動
  // WebView2 では dataTransfer が正しく動作しないため useRef で管理
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const dragSourceRef = useRef<string | null>(null);

  function handleDragStart(e: React.DragEvent, item: FileItem) {
    dragSourceRef.current = item.path;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.name);
  }

  function handleDragOver(e: React.DragEvent, item: FileItem) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (item.isDir && item.accessible) {
      setDragOverPath(item.path);
    } else {
      setDragOverPath(null);
    }
  }

  function handleListDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDragEnd() {
    dragSourceRef.current = null;
    setDragOverPath(null);
  }

  async function moveFile(sourcePath: string, targetDirPath: string) {
    if (sourcePath === targetDirPath) return;
    // 自分自身の子にドロップしないようチェック
    if (targetDirPath.startsWith(sourcePath + "\\") || targetDirPath.startsWith(sourcePath + "/")) return;

    const fileName = sourcePath.split(/[\\/]/).pop();
    if (!fileName) return;
    const sep = targetDirPath.includes("\\") ? "\\" : "/";
    const newPath = targetDirPath + sep + fileName;
    if (newPath === sourcePath) return;

    try {
      await invoke("rename_path", { oldPath: sourcePath, newPath });
      const sourceParent = sourcePath.replace(/[\\/][^\\/]+$/, "");
      for (const dir of [sourceParent, targetDirPath]) {
        const items = await loadDir(dir);
        if (items) setDirContents(prev => new Map(prev).set(dir, items));
      }
    } catch (e) {
      setError(String(e));
    }
  }

  function handleDrop(e: React.DragEvent, target: FileItem) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    const sourcePath = dragSourceRef.current;
    dragSourceRef.current = null;
    if (!sourcePath) return;
    // フォルダならそのフォルダへ、ファイルならその親フォルダへ移動
    const destDir = target.isDir && target.accessible
      ? target.path
      : target.path.replace(/[\\/][^\\/]+$/, "");
    moveFile(sourcePath, destDir);
  }

  function handleListDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverPath(null);
    const sourcePath = dragSourceRef.current;
    dragSourceRef.current = null;
    if (!sourcePath || !currentDir) return;
    moveFile(sourcePath, currentDir);
  }

  // 選択ファイルが変更されたら、またはファイルタブに切り替わったら表示範囲にスクロール
  const fileListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeTab !== "files" || !selectedFilePath || !fileListRef.current) return;
    // タブ切り替え直後はDOMがまだ描画されていない場合があるので少し遅延
    const timer = setTimeout(() => {
      const el = fileListRef.current?.querySelector(`[data-filepath="${CSS.escape(selectedFilePath)}"]`);
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedFilePath, activeTab]);

  // ツリー描画
  function renderItems(items: FileItem[], depth: number): React.ReactNode[] {
    return items.map(item => {
      const isExpanded = item.isDir && expandedDirs.has(item.path);
      const children = item.isDir && isExpanded ? dirContents.get(item.path) : null;

      return (
        <li key={item.path} className="tree-group">
          <div
            className={`file-item ${item.isDir ? "dir" : "file"} ${!item.accessible ? "inaccessible" : ""} ${!item.isDir && item.path === selectedFilePath ? "selected" : ""} ${item.isDir && dragOverPath === item.path ? "drag-over" : ""}`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => handleFileClick(item)}
            onKeyDown={(e) => handleItemKeyDown(e, item)}
            tabIndex={0}
            title={item.accessible ? item.path : `${item.path} (アクセス不可)`}
            data-filepath={item.path}
            onContextMenu={(e) => handleContextMenu(e, item)}
            draggable={!renamingPath}
            onDragStart={(e) => handleDragStart(e, item)}
            onDragOver={(e) => handleDragOver(e, item)}
            onDrop={(e) => handleDrop(e, item)}
            onDragEnd={handleDragEnd}
          >
            {item.isDir && (
              <span className="tree-arrow">{isExpanded ? "▾" : "▸"}</span>
            )}
            <FileIcon isDir={item.isDir} accessible={item.accessible} name={item.name} />
            {renamingPath === item.path ? (
              <input
                ref={renameRef}
                className="rename-input"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenamingPath(null);
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="file-name">{item.name}</span>
            )}
          </div>
          {children && (
            <ul className="tree-children">
              {creating?.parentDir === item.path && (
                <li className="file-item create-item" style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}>
                  <span className="tree-arrow-placeholder" />
                  <FileIcon isDir={creating.type === "folder"} accessible={true} name={createName || "new"} />
                  <input
                    ref={createRef}
                    className="rename-input"
                    placeholder={creating.type === "folder" ? "フォルダ名" : "ファイル名"}
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    onBlur={commitCreate}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitCreate();
                      if (e.key === "Escape") setCreating(null);
                    }}
                  />
                </li>
              )}
              {renderItems(children, depth + 1)}
            </ul>
          )}
        </li>
      );
    });
  }

  // 選択中ファイルの親ディレクトリを取得（新規作成時に使用）
  function getSelectedDir(): string {
    if (selectedFilePath) {
      // selectedFilePathがディレクトリかファイルかを判定
      // dirContentsに存在するならディレクトリ
      if (expandedDirs.has(selectedFilePath)) {
        return selectedFilePath;
      }
      // ファイルの場合は親ディレクトリ
      const parent = selectedFilePath.replace(/[\\/][^\\/]+$/, "");
      if (parent && parent !== selectedFilePath) {
        return parent;
      }
    }
    return currentDir;
  }

  // 検索タブ: フォルダツリー読み込み
  useEffect(() => {
    if (activeTab === "search" && currentDir && !searchDirTree.has(currentDir)) {
      invoke<DirItem[]>("list_directories_only", { path: currentDir }).then(dirs => {
        setSearchDirTree(prev => new Map(prev).set(currentDir, dirs));
      }).catch(() => {});
    }
  }, [activeTab, currentDir]);

  async function toggleSearchDir(path: string) {
    if (searchExpandedDirs.has(path)) {
      setSearchExpandedDirs(prev => { const n = new Set(prev); n.delete(path); return n; });
    } else {
      if (!searchDirTree.has(path)) {
        try {
          const dirs = await invoke<DirItem[]>("list_directories_only", { path });
          setSearchDirTree(prev => new Map(prev).set(path, dirs));
        } catch { return; }
      }
      setSearchExpandedDirs(prev => new Set(prev).add(path));
    }
  }

  function selectSearchScope(path: string | null) {
    setSearchScopeDir(prev => prev === path ? null : path);
  }

  async function handleGrep() {
    if (!searchQuery.trim() || !currentDir) return;
    const dir = searchScopeDir ?? currentDir;
    setGrepSearching(true);
    try {
      const matches = await invoke<GrepMatch[]>("grep_files", { dir, query: searchQuery.trim() });
      // 結果をテキストとして整形
      const lines: string[] = [];
      const dirPrefix = currentDir.replace(/\\/g, "/");
      let currentFile = "";
      for (const m of matches) {
        const relPath = m.path.replace(/\\/g, "/").replace(dirPrefix + "/", "");
        if (relPath !== currentFile) {
          if (currentFile) lines.push("");
          currentFile = relPath;
          lines.push(`── ${relPath} ──`);
        }
        lines.push(`  ${m.lineNumber}: ${m.line}`);
      }
      if (matches.length === 0) {
        lines.push("検索結果はありません。");
      } else if (matches.length >= 500) {
        lines.push("");
        lines.push("（結果が500件を超えたため省略されました）");
      }
      onGrepResult?.(searchQuery.trim(), lines.join("\n"), currentDir);
    } catch (e) {
      setError(String(e));
    }
    setGrepSearching(false);
  }

  function renderSearchDirTree(parentPath: string, depth: number): React.ReactNode[] {
    const dirs = searchDirTree.get(parentPath);
    if (!dirs) return [];
    return dirs.map(dir => {
      const isExpanded = searchExpandedDirs.has(dir.path);
      const isSelected = searchScopeDir === dir.path;
      return (
        <li key={dir.path} className="tree-group">
          <div
            className={`file-item dir ${isSelected ? "selected" : ""}`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => { selectSearchScope(dir.path); toggleSearchDir(dir.path); }}
          >
            <span className="tree-arrow">
              {isExpanded ? "▾" : "▸"}
            </span>
            <FileIcon isDir={true} accessible={dir.accessible} name={dir.name} />
            <span className="file-name">{dir.name}</span>
          </div>
          {isExpanded && (
            <ul className="tree-children">
              {renderSearchDirTree(dir.path, depth + 1)}
            </ul>
          )}
        </li>
      );
    });
  }

  const rootItems = currentDir ? (dirContents.get(currentDir) ?? []) : [];

  // 空状態: フォルダ未選択
  if (!currentDir) {
    return (
      <div className="pane left-pane">
        <div className="pane-content empty-pane">
          <button className="btn-open-folder" onClick={openDirectory}>
            フォルダを開く
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pane left-pane">
      <div className="pane-tabs">
        <button
          className={`tab-btn ${activeTab === "files" ? "active" : ""}`}
          onClick={() => setActiveTab("files")}
        >
          ファイル
        </button>
        <button
          className={`tab-btn ${activeTab === "git" ? "active" : ""}`}
          onClick={() => setActiveTab("git")}
        >
          Git
        </button>
        <button
          className={`tab-btn ${activeTab === "search" ? "active" : ""}`}
          onClick={() => setActiveTab("search")}
        >
          検索
        </button>
      </div>

      <div className="pane-content">
        {activeTab === "files" && (
          <div className="file-list" ref={fileListRef} onDragOver={handleListDragOver} onDrop={handleListDrop}>
            <div className="dir-header">
              <div className="dir-header-btns">
                <button className="btn-small" onClick={openDirectory} title="別のフォルダを開く">
                  📁
                </button>
                {recentDirs && recentDirs.length > 0 && (
                  <div className="recent-dir-wrapper">
                    <button className="btn-small" onClick={(e) => { e.stopPropagation(); setShowRecentMenu(v => !v); }} title="最近のフォルダ">
                      🕐
                    </button>
                    {showRecentMenu && (
                      <div className="recent-dir-menu">
                        {recentDirs.map((dir) => (
                          <button
                            key={dir}
                            className="context-menu-item"
                            title={dir}
                            onClick={() => {
                              setShowRecentMenu(false);
                              openDir(dir);
                              onOpenRecentDir?.(dir);
                            }}
                          >
                            {dir.split(/[\\/]/).pop()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button className="btn-small" onClick={() => startCreate(getSelectedDir(), "file")} title="新規ファイル">
                  +F
                </button>
                <button className="btn-small" onClick={() => startCreate(getSelectedDir(), "folder")} title="新規フォルダ">
                  +D
                </button>
              </div>
              <span className="dir-path" title={currentDir}>
                {currentDir.split(/[\\/]/).pop()}
              </span>
            </div>
            {loading && <div className="loading">読み込み中...</div>}
            {error && <div className="error-msg">{error}</div>}
            <ul className="file-items tree-root">
              {creating?.parentDir === currentDir && (
                <li className="file-item create-item" style={{ paddingLeft: "8px" }}>
                  <FileIcon isDir={creating.type === "folder"} accessible={true} name={createName || "new"} />
                  <input
                    ref={createRef}
                    className="rename-input"
                    placeholder={creating.type === "folder" ? "フォルダ名" : "ファイル名"}
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    onBlur={commitCreate}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitCreate();
                      if (e.key === "Escape") setCreating(null);
                    }}
                  />
                </li>
              )}
              {renderItems(rootItems, 0)}
            </ul>
          </div>
        )}

        {activeTab === "git" && (
          <GitPane cwd={currentDir || undefined} onDiffOpen={onDiffOpen} />
        )}

        {activeTab === "search" && (
          <div className="search-panel">
            <div className="search-header">
              <input
                className="search-input"
                placeholder="Grep 検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleGrep(); }}
              />
              <button
                className="btn-small"
                onClick={handleGrep}
                disabled={grepSearching || !searchQuery.trim()}
              >
                {grepSearching ? "検索中..." : "検索"}
              </button>
            </div>
            {searchScopeDir && (
              <div className="search-scope-info">
                検索対象: {searchScopeDir.split(/[\\/]/).pop()}
                <button className="btn-clear-scope" onClick={() => setSearchScopeDir(null)} title="解除">✕</button>
              </div>
            )}
            <div className="search-dir-label">フォルダを選択して検索範囲を絞り込み:</div>
            <ul className="file-items tree-root search-dir-tree">
              <li className="tree-group">
                <div
                  className={`file-item dir ${searchScopeDir === null ? "selected" : ""}`}
                  style={{ paddingLeft: "8px" }}
                  onClick={() => selectSearchScope(null)}
                >
                  <FileIcon isDir={true} accessible={true} name={currentDir.split(/[\\/]/).pop() ?? ""} />
                  <span className="file-name">{currentDir.split(/[\\/]/).pop()} (全体)</span>
                </div>
              </li>
              {renderSearchDirTree(currentDir, 1)}
            </ul>
          </div>
        )}
      </div>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          ref={(el) => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            if (rect.bottom > vh) {
              el.style.top = `${contextMenu.y - rect.height}px`;
            }
            if (rect.right > vw) {
              el.style.left = `${contextMenu.x - rect.width}px`;
            }
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={() => {
            const dir = contextMenu.item.isDir ? contextMenu.item.path : contextMenu.item.path.replace(/[\\/][^\\/]+$/, "");
            setContextMenu(null);
            startCreate(dir, "file");
          }}>
            新規ファイル
          </button>
          <button className="context-menu-item" onClick={() => {
            const dir = contextMenu.item.isDir ? contextMenu.item.path : contextMenu.item.path.replace(/[\\/][^\\/]+$/, "");
            setContextMenu(null);
            startCreate(dir, "folder");
          }}>
            新規フォルダ
          </button>
          <button className="context-menu-item" onClick={() => { setContextMenu(null); startRename(contextMenu.item.path, contextMenu.item.name); }}>
            名前を変更
          </button>
          <button className="context-menu-item danger" onClick={() => handleDelete(contextMenu.item)}>
            削除
          </button>
        </div>
      )}
    </div>
  );
}
