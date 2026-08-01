import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  content: string;
  modified: boolean;
  /** "text" = コードエディタ, "image" = 画像表示, "browser" = Web表示, "diff" = Diff表示, "search" = 検索結果 */
  type?: "text" | "image" | "browser" | "diff" | "search";
  /** 検索結果タブ用: 検索クエリ */
  searchQuery?: string;
  /** 検索結果タブ用: ベースディレクトリ（相対パス解決用） */
  searchBaseDir?: string;
  /** image/browser タブ用 URL */
  url?: string;
}

interface CursorPos {
  start: number;
  end: number;
}

interface EditorPaneProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onContentChange: (id: string, content: string) => void;
  onSaved: (id: string) => void;
  onNewTab: () => void;
  fontSize?: number;
  autoSave?: boolean;
  onCursorChange?: (id: string, start: number, end: number) => void;
  cursorPositions?: Record<string, CursorPos>;
  onFileOpen?: (path: string, content: string) => void;
}

export default function EditorPane({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onContentChange,
  onSaved,
  onNewTab,
  fontSize = 13,
  autoSave = false,
  onCursorChange,
  cursorPositions,
  onFileOpen,
}: EditorPaneProps) {
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // タブコンテキストメニュー
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const tabContextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tabContextMenu) return;
    const handleClick = () => setTabContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [tabContextMenu]);

  // 画像関連
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [imageZoom, setImageZoom] = useState<number | null>(null); // null = fit mode
  const imageViewerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const tabType = activeTab?.type || "text";
  const isMarkdown = tabType === "text" && (activeTab?.name?.endsWith(".md") || activeTab?.name?.endsWith(".markdown"));
  const highlightRef = useRef<HTMLPreElement>(null);

  // 行番号とテキストエリアのスクロールを同期（+ マークダウンハイライト同期）
  // ※ オーバーレイは scrollTop ではなく CSS transform でオフセットする。
  //   scrollHeight の差異に依存しないため末尾でもズレが生じない。
  useEffect(() => {
    const ta = textareaRef.current;
    const ln = lineNumberRef.current;
    const hl = highlightRef.current;
    if (!ta || !ln) return;
    const sync = () => {
      ln.scrollTop = ta.scrollTop;
      if (hl) {
        hl.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
      }
    };
    sync(); // タブ切り替え時に初期位置を反映
    ta.addEventListener("scroll", sync);
    return () => ta.removeEventListener("scroll", sync);
  }, [activeTabId, isMarkdown]);

  // マークダウンオーバーレイの幅を textarea の clientWidth（スクロールバーを除く）に動的合わせ
  // テキスト折り返し位置を textarea と一致させるために必要
  useEffect(() => {
    if (!isMarkdown) return;
    const ta = textareaRef.current;
    const hl = highlightRef.current;
    if (!ta || !hl) return;
    const syncWidth = () => {
      hl.style.width = ta.clientWidth + "px";
    };
    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(ta);
    return () => observer.disconnect();
  }, [isMarkdown, activeTabId]);

  // カーソル位置の復元
  const restoredTabsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !activeTab || tabType !== "text" || !activeTab.path) return;
    if (restoredTabsRef.current.has(activeTab.id)) return;
    restoredTabsRef.current.add(activeTab.id);
    const pos = cursorPositions?.[activeTab.path];
    if (pos && pos.start <= activeTab.content.length) {
      ta.selectionStart = pos.start;
      ta.selectionEnd = Math.min(pos.end, activeTab.content.length);
      ta.focus();
    }
  }, [activeTabId]);

  // 画像サイズ取得 & ズームリセット
  useEffect(() => {
    if (tabType === "image" && activeTab?.url) {
      setImageZoom(null); // fit mode
      const img = new window.Image();
      img.onload = () => setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = activeTab.url;
    } else {
      setImageSize(null);
    }
  }, [activeTabId, tabType]);

  // 画像ドラッグスクロール
  function handleImageMouseDown(e: React.MouseEvent) {
    if (imageZoom === null) return; // fit mode ではドラッグ不要
    const viewer = imageViewerRef.current;
    if (!viewer) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: viewer.scrollLeft,
      scrollTop: viewer.scrollTop,
    };
    e.preventDefault();
  }

  function handleImageMouseMove(e: React.MouseEvent) {
    if (!isDragging || !dragStartRef.current) return;
    const viewer = imageViewerRef.current;
    if (!viewer) return;
    viewer.scrollLeft = dragStartRef.current.scrollLeft - (e.clientX - dragStartRef.current.x);
    viewer.scrollTop = dragStartRef.current.scrollTop - (e.clientY - dragStartRef.current.y);
  }

  function handleImageMouseUp() {
    setIsDragging(false);
    dragStartRef.current = null;
  }

  // 実際のズーム%を計算（コンテナに対する画像の実ピクセル比率）
  function getDisplayZoomPercent(): number {
    if (!imageSize) return 100;
    if (imageZoom === null) {
      // fit mode: コンテナ内に収まるサイズ
      const viewer = imageViewerRef.current;
      if (!viewer) return 100;
      const cw = viewer.clientWidth;
      const ch = viewer.clientHeight;
      if (cw === 0 || ch === 0) return 100;
      const scale = Math.min(cw / imageSize.w, ch / imageSize.h, 1);
      return Math.round(scale * 100);
    }
    return imageZoom;
  }

  async function saveFile() {
    if (!activeTab || !activeTab.path || tabType !== "text") return;
    try {
      await invoke("write_file", { path: activeTab.path, content: activeTab.content });
      onSaved(activeTab.id);
      setSaveStatus("保存しました");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e) {
      setSaveStatus(`エラー: ${e}`);
    }
  }

  // オートセーブ
  useEffect(() => {
    if (!autoSave || !activeTab || !activeTab.path || !activeTab.modified || tabType !== "text") return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { saveFile(); }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [autoSave, activeTab?.content, activeTab?.modified]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveFile();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (!activeTab) return;
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newContent =
        activeTab.content.substring(0, start) + "  " + activeTab.content.substring(end);
      onContentChange(activeTab.id, newContent);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  }

  function handleSelect() {
    if (!activeTab || !textareaRef.current || !onCursorChange) return;
    onCursorChange(activeTab.id, textareaRef.current.selectionStart, textareaRef.current.selectionEnd);
  }

  const charCount = activeTab && tabType === "text" ? [...activeTab.content].length : 0;
  const lineCount = activeTab && tabType === "text" ? activeTab.content.split("\n").length : 0;
  const lineNumbers = activeTab && tabType === "text"
    ? activeTab.content.split("\n").map((_, i) => i + 1).join("\n")
    : "";

  return (
    <div className="pane editor-pane">
      <div
        className="pane-tabs"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => onTabSelect(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
            }}
          >
            <span className="tab-label">
              {tab.modified ? "● " : ""}
              {tab.type === "image" ? "🖼 " : tab.type === "browser" ? "🌐 " : tab.type === "diff" ? "±" : tab.type === "search" ? "🔍 " : ""}
              {tab.name}
            </span>
            <button
              className="tab-close"
              onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="tab-btn new-tab" onClick={onNewTab}>+</button>
      </div>

      {tabContextMenu && (
        <div
          ref={tabContextMenuRef}
          className="context-menu"
          style={{ position: "fixed", left: tabContextMenu.x, top: tabContextMenu.y, zIndex: 9999 }}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              tabs.filter(t => t.id !== tabContextMenu.tabId).forEach(t => onTabClose(t.id));
              setTabContextMenu(null);
            }}
          >
            他のタブをすべて閉じる
          </div>
        </div>
      )}

      {tabType === "text" && (
        <div className="editor-toolbar">
          {saveStatus && <span className="save-status">{saveStatus}</span>}
          {activeTab && (
            <span className="file-path-display">{activeTab.path || "新しいファイル"}</span>
          )}
          {activeTab && (
            <span className="editor-stats">{lineCount} 行　{charCount} 文字</span>
          )}
        </div>
      )}

      {tabType === "diff" && activeTab && (
        <div className="editor-toolbar">
          <span className="file-path-display">Diff: {activeTab.name}</span>
        </div>
      )}

      {tabType === "search" && activeTab && (
        <div className="editor-toolbar">
          <span className="file-path-display">{activeTab.name}</span>
          <span className="editor-stats">クリックでファイルを開く</span>
        </div>
      )}

      {tabType === "image" && activeTab && (
        <div className="editor-toolbar">
          <span className="file-path-display">{activeTab.name}</span>
          <span className="editor-stats">
            {imageSize ? `${imageSize.w} x ${imageSize.h} pix` : ""}
            　{getDisplayZoomPercent()}%
            <button className="btn-zoom" onClick={() => setImageZoom(z => Math.max(10, (z ?? getDisplayZoomPercent()) - 10))} title="縮小">−</button>
            <button className="btn-zoom" onClick={() => setImageZoom(null)} title="フィット">Fit</button>
            <button className="btn-zoom" onClick={() => setImageZoom(100)} title="等倍">1:1</button>
            <button className="btn-zoom" onClick={() => setImageZoom(z => Math.min(500, (z ?? getDisplayZoomPercent()) + 10))} title="拡大">＋</button>
          </span>
        </div>
      )}

      <div className="pane-content editor-content">
        {!activeTab && (
          <div className="empty-editor">
            <p>ファイルを開くか、「+」で新しいタブを作成してください</p>
          </div>
        )}

        {activeTab && tabType === "text" && (
          <div className="editor-wrapper">
            <div className="line-numbers" ref={lineNumberRef} style={{ fontSize: `${fontSize}px` }}>
              <pre>{lineNumbers}</pre>
            </div>
            <div className="editor-area">
              {isMarkdown && (
                <pre
                  ref={highlightRef}
                  className="md-highlight-overlay"
                  style={{ fontSize: `${fontSize}px` }}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: markdownHighlight(activeTab.content) }}
                />
              )}
              <textarea
                ref={textareaRef}
                className={`code-editor ${isMarkdown ? "md-editor-transparent" : ""}`}
                value={activeTab.content}
                onChange={(e) => onContentChange(activeTab.id, e.target.value)}
                onKeyDown={handleKeyDown}
                onSelect={handleSelect}
                spellCheck={false}
                style={{ fontSize: `${fontSize}px` }}
              />
            </div>
          </div>
        )}

        {activeTab && tabType === "image" && activeTab.url && (
          <div
            ref={imageViewerRef}
            className={`image-viewer ${isDragging ? "dragging" : ""}`}
            onWheel={(e) => {
              e.preventDefault();
              setImageZoom(z => {
                const current = z ?? getDisplayZoomPercent();
                return Math.max(10, Math.min(500, current + (e.deltaY < 0 ? 10 : -10)));
              });
            }}
            onMouseDown={handleImageMouseDown}
            onMouseMove={handleImageMouseMove}
            onMouseUp={handleImageMouseUp}
            onMouseLeave={handleImageMouseUp}
          >
            <div className="image-viewer-inner" style={imageZoom !== null && imageSize ? {
              minWidth: `${Math.round(imageSize.w * imageZoom / 100)}px`,
              minHeight: `${Math.round(imageSize.h * imageZoom / 100)}px`,
              display: "flex", alignItems: "center", justifyContent: "center",
            } : {
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img
                src={activeTab.url}
                alt={activeTab.name}
                className="image-view-content"
                style={imageZoom !== null && imageSize ? {
                  width: `${Math.round(imageSize.w * imageZoom / 100)}px`,
                  height: `${Math.round(imageSize.h * imageZoom / 100)}px`,
                  maxWidth: "none",
                  maxHeight: "none",
                } : undefined}
                draggable={false}
              />
            </div>
          </div>
        )}

        {activeTab && tabType === "browser" && activeTab.url && (
          <div className="browser-viewer">
            <div className="browser-toolbar">
              <span className="browser-url">{activeTab.url}</span>
            </div>
            <iframe
              src={activeTab.url}
              className="browser-frame"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              title={activeTab.name}
            />
          </div>
        )}

        {activeTab && tabType === "diff" && (
          <div className="diff-viewer">
            <pre className="diff-content">
              {activeTab.content.split("\n").map((line, i) => {
                let cls = "diff-line";
                if (line.startsWith("+")) cls += " diff-add";
                else if (line.startsWith("-")) cls += " diff-del";
                else if (line.startsWith("@@")) cls += " diff-hunk";
                else if (line.startsWith("diff ") || line.startsWith("index ")) cls += " diff-meta";
                return <div key={i} className={cls}>{line}</div>;
              })}
            </pre>
          </div>
        )}

        {activeTab && tabType === "search" && (
          <div className="search-result-viewer">
            <pre className="search-result-content">
              {activeTab.content.split("\n").map((line, i) => {
                const query = activeTab.searchQuery ?? "";
                // ファイルヘッダー行: ── path ──
                if (line.startsWith("── ") && line.endsWith(" ──")) {
                  return <div key={i} className="search-line search-file-header">{line}</div>;
                }
                // 結果行: "  行番号: 内容" → クリック可能 + クエリ文字列をハイライト
                const matchResult = line.match(/^  (\d+): (.*)$/);
                if (matchResult && query) {
                  const lineNum = matchResult[1];
                  const lineContent = matchResult[2];
                  return (
                    <div
                      key={i}
                      className="search-line search-match-line"
                      onClick={() => handleSearchLineClick(activeTab, i)}
                    >
                      <span className="search-line-num">{lineNum}: </span>
                      {highlightQuery(lineContent, query)}
                    </div>
                  );
                }
                // その他の行（空行、メッセージなど）
                return <div key={i} className="search-line">{line}</div>;
              })}
            </pre>
          </div>
        )}
      </div>
    </div>
  );

  function markdownHighlight(text: string): string {
    return text.split(/\r?\n/).map(line => {
      // HTMLエスケープ
      let escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // 見出し: # ~ ######
      if (/^#{1,6}\s/.test(escaped)) {
        return `<span class="md-heading">${escaped}</span>`;
      }
      // コードブロック開始/終了: ```
      if (/^```/.test(escaped)) {
        return `<span class="md-code-fence">${escaped}</span>`;
      }
      // 水平線: --- / *** / ___
      if (/^(\s*[-*_]){3,}\s*$/.test(escaped)) {
        return `<span class="md-hr">${escaped}</span>`;
      }
      // 引用: >
      if (/^&gt;\s?/.test(escaped)) {
        return `<span class="md-blockquote">${escaped}</span>`;
      }
      // リスト: - / * / + / 数字.
      if (/^\s*([-*+]|\d+\.)\s/.test(escaped)) {
        escaped = escaped.replace(/^(\s*)([-*+]|\d+\.)/, '$1<span class="md-list-marker">$2</span>');
      }
      // チェックボックス: - [x] / - [ ]
      escaped = escaped.replace(/\[(x|X)\]/g, '<span class="md-checkbox-checked">[x]</span>');
      escaped = escaped.replace(/\[ \]/g, '<span class="md-checkbox">[ ]</span>');
      // 太字: **text** / __text__
      escaped = escaped.replace(/(\*\*|__)(.+?)\1/g, '<span class="md-bold">$1$2$1</span>');
      // 斜体: *text* / _text_
      escaped = escaped.replace(/(\*|_)(.+?)\1/g, '<span class="md-italic">$1$2$1</span>');
      // インラインコード: `code`
      escaped = escaped.replace(/`([^`]+)`/g, '<span class="md-inline-code">`$1`</span>');
      // リンク: [text](url)
      escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-link">[$1]($2)</span>');
      // 画像: ![alt](url)
      escaped = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<span class="md-image">![$1]($2)</span>');

      return escaped;
    }).join("\n");
  }

  function highlightQuery(text: string, query: string): React.ReactNode {
    if (!query) return text;
    const parts: React.ReactNode[] = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let lastIndex = 0;
    let idx = lowerText.indexOf(lowerQuery, lastIndex);
    while (idx !== -1) {
      if (idx > lastIndex) parts.push(text.substring(lastIndex, idx));
      parts.push(<span key={idx} className="search-highlight">{text.substring(idx, idx + query.length)}</span>);
      lastIndex = idx + query.length;
      idx = lowerText.indexOf(lowerQuery, lastIndex);
    }
    if (lastIndex < text.length) parts.push(text.substring(lastIndex));
    return <>{parts}</>;
  }

  async function handleSearchLineClick(tab: EditorTab, lineIndex: number) {
    if (!onFileOpen) return;
    // 行からファイルパスを逆引き: 上方向に最も近い "── path ──" 行を探す
    const lines = tab.content.split("\n");
    let relPath = "";
    for (let j = lineIndex; j >= 0; j--) {
      const m = lines[j].match(/^── (.+) ──$/);
      if (m) { relPath = m[1]; break; }
    }
    if (!relPath) return;

    // 相対パスを絶対パスに変換
    const baseDir = tab.searchBaseDir;
    const sep = baseDir?.includes("\\") ? "\\" : "/";
    const absPath = baseDir ? baseDir + sep + relPath.replace(/\//g, sep) : relPath;

    try {
      const content = await invoke<string>("read_file", { path: absPath });
      onFileOpen(absPath, content);
    } catch { /* ファイルが開けない場合は無視 */ }
  }
}
