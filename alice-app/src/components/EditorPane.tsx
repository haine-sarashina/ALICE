import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  content: string;
  modified: boolean;
  /** "text" = コードエディタ, "image" = 画像表示, "browser" = Web表示, "diff" = Diff表示 */
  type?: "text" | "image" | "browser" | "diff";
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
}: EditorPaneProps) {
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 画像関連
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [imageZoom, setImageZoom] = useState<number | null>(null); // null = fit mode
  const imageViewerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const tabType = activeTab?.type || "text";

  // 行番号とテキストエリアのスクロールを同期
  useEffect(() => {
    const ta = textareaRef.current;
    const ln = lineNumberRef.current;
    if (!ta || !ln) return;
    const sync = () => { ln.scrollTop = ta.scrollTop; };
    ta.addEventListener("scroll", sync);
    return () => ta.removeEventListener("scroll", sync);
  }, [activeTabId]);

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
      <div className="pane-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => onTabSelect(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              tabs.filter(t => t.id !== tab.id).forEach(t => onTabClose(t.id));
            }}
          >
            <span className="tab-label">
              {tab.modified ? "● " : ""}
              {tab.type === "image" ? "🖼 " : tab.type === "browser" ? "🌐 " : tab.type === "diff" ? "±" : ""}
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
            <textarea
              ref={textareaRef}
              className="code-editor"
              value={activeTab.content}
              onChange={(e) => onContentChange(activeTab.id, e.target.value)}
              onKeyDown={handleKeyDown}
              onSelect={handleSelect}
              spellCheck={false}
              style={{ fontSize: `${fontSize}px` }}
            />
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
      </div>
    </div>
  );
}
