import { useState, useEffect } from "react";
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  WIDGET_LABELS,
  loadSettings,
  saveSettings,
} from "../lib/settings";

export default function SettingsWindow() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  useEffect(() => {
    function reload() {
      loadSettings()
        .then((s) => { setSettings(s); setLoaded(true); })
        .catch(() => { setLoaded(true); });
    }
    reload();
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);

  async function handleCheckUpdate() {
    try {
      setUpdateChecking(true);
      setUpdateStatus("更新を確認中...");
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setUpdateStatus(`最新バージョン (${update.version}) を取得しました。インストール中...`);
        await update.downloadAndInstall();
        setUpdateStatus("更新完了。アプリを再起動します...");
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } else {
        setUpdateStatus("現在は最新のバージョンです。");
      }
    } catch (e) {
      setUpdateStatus(`確認スキップまたはエラー: ${e}`);
    } finally {
      setUpdateChecking(false);
    }
  }

  async function handleClose() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      getCurrentWindow().hide();
    } catch { window.close(); }
  }

  async function handleSave() {
    try {
      await saveSettings(settings);
      setSaveMsg("保存しました");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) { setSaveMsg(`エラー: ${e}`); }
  }

  function setEditorField<K extends keyof AppSettings["editor"]>(key: K, value: AppSettings["editor"][K]) {
    setSettings((prev) => ({ ...prev, editor: { ...prev.editor, [key]: value } }));
  }

  function setFilesField<K extends keyof AppSettings["files"]>(key: K, value: AppSettings["files"][K]) {
    setSettings((prev) => ({ ...prev, files: { ...prev.files, [key]: value } }));
  }

  function setWidgetField<K extends keyof AppSettings["widgets"]>(key: K, value: AppSettings["widgets"][K]) {
    setSettings((prev) => ({ ...prev, widgets: { ...prev.widgets, [key]: value } }));
  }

  function toggleWidgetVisible(id: string) {
    setSettings((prev) => ({
      ...prev,
      widgets: { ...prev.widgets, items: prev.widgets.items.map((w) => w.id === id ? { ...w, visible: !w.visible } : w) },
    }));
  }

  function moveWidget(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= settings.widgets.items.length) return;
    setSettings((prev) => {
      const items = [...prev.widgets.items];
      [items[index], items[newIndex]] = [items[newIndex], items[index]];
      return { ...prev, widgets: { ...prev.widgets, items } };
    });
  }

  async function selectPhotoFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: "写真フォルダを選択" });
      if (dir && typeof dir === "string") {
        setWidgetField("photoFolder", dir);
      }
    } catch { /* ignore */ }
  }

  function addKeyword() {
    const kw = newKeyword.trim();
    if (!kw) return;
    const current = settings.widgets.newsKeywords ?? [];
    if (!current.includes(kw)) {
      setWidgetField("newsKeywords", [...current, kw]);
    }
    setNewKeyword("");
  }

  function removeKeyword(kw: string) {
    setWidgetField("newsKeywords", (settings.widgets.newsKeywords ?? []).filter(k => k !== kw));
  }

  return (
    <div className="app-layout">
      <header className="app-header" data-tauri-drag-region>
        <span className="app-title" data-tauri-drag-region>設定</span>
        <span className="app-subtitle" data-tauri-drag-region>ALICE Settings</span>
        <div className="window-controls">
          <button className="wc-btn wc-close" title="閉じる" onClick={handleClose}>✕</button>
        </div>
      </header>

      <div className="settings-body">
        {!loaded ? (
          <div style={{ padding: 16, color: "var(--text-muted)" }}>読み込み中...</div>
        ) : (
          <>
            {/* アプリケーション更新 */}
            <section className="settings-section">
              <h3>アプリケーションの更新</h3>
              <div className="settings-row">
                <label className="settings-label">現在のバージョン: Ver.0.2.2</label>
                <button
                  className="tab-btn active"
                  style={{ padding: "6px 14px", borderRadius: 4, cursor: "pointer" }}
                  onClick={handleCheckUpdate}
                  disabled={updateChecking}
                >
                  {updateChecking ? "確認中..." : "アップデートを確認"}
                </button>
              </div>
              {updateStatus && <p className="settings-hint" style={{ color: "var(--accent)", marginTop: 6, fontWeight: "bold" }}>{updateStatus}</p>}
              <p className="settings-hint">GitHub Releases より自動アプデを取得し、再起動して最新化します。</p>
            </section>

            {/* ファイルリスト */}
            <section className="settings-section">
              <h3>ファイルリスト</h3>
              <div className="settings-row">
                <label className="settings-label">隠しファイルの表示</label>
                <button
                  className={`toggle-switch ${settings.files.showHidden ? "on" : ""}`}
                  onClick={() => setFilesField("showHidden", !settings.files.showHidden)}
                >
                  <span className="toggle-knob" />
                  <span className="toggle-text">{settings.files.showHidden ? "ON" : "OFF"}</span>
                </button>
              </div>
              <p className="settings-hint">ONにすると、隠しファイル（.で始まるファイルなど）を表示します。</p>
            </section>

            {/* テキストエディタ */}
            <section className="settings-section">
              <h3>テキストエディタ</h3>
              <div className="settings-row">
                <label className="settings-label">オートセーブ</label>
                <button
                  className={`toggle-switch ${settings.editor.autoSave ? "on" : ""}`}
                  onClick={() => setEditorField("autoSave", !settings.editor.autoSave)}
                >
                  <span className="toggle-knob" />
                  <span className="toggle-text">{settings.editor.autoSave ? "ON" : "OFF"}</span>
                </button>
              </div>
              <p className="settings-hint">ONにすると、編集中のファイルを自動で保存します。</p>

              <div className="settings-row">
                <label className="settings-label">フォントサイズ</label>
                <div className="font-size-control">
                  <button className="btn-small" onClick={() => setEditorField("fontSize", Math.max(8, settings.editor.fontSize - 1))}>-</button>
                  <input
                    type="number" className="font-size-input" value={settings.editor.fontSize}
                    min={8} max={32}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 8 && v <= 32) setEditorField("fontSize", v); }}
                  />
                  <button className="btn-small" onClick={() => setEditorField("fontSize", Math.min(32, settings.editor.fontSize + 1))}>+</button>
                  <span className="settings-hint" style={{ marginLeft: 8 }}>px</span>
                </div>
              </div>
              <p className="settings-hint">テキストエディタ内のフォントサイズを変更します。(8〜32px)</p>
            </section>

            {/* ウィジェットエリア */}
            <section className="settings-section">
              <h3>ウィジェットエリア</h3>
              <p className="settings-hint" style={{ marginBottom: 8 }}>
                表示のON/OFFと、上下ボタンで表示順を変更できます。
              </p>
              <ul className="widget-order-list">
                {settings.widgets.items.map((item, i) => (
                  <li key={item.id} className="widget-order-item">
                    <button
                      className={`toggle-switch small ${item.visible ? "on" : ""}`}
                      onClick={() => toggleWidgetVisible(item.id)}
                    >
                      <span className="toggle-knob" />
                    </button>
                    <span className={`widget-order-name ${!item.visible ? "disabled" : ""}`}>
                      {WIDGET_LABELS[item.id] ?? item.id}
                    </span>
                    <div className="widget-order-buttons">
                      <button className="btn-small btn-order" disabled={i === 0} onClick={() => moveWidget(i, -1)} title="上へ">▲</button>
                      <button className="btn-small btn-order" disabled={i === settings.widgets.items.length - 1} onClick={() => moveWidget(i, 1)} title="下へ">▼</button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* 写真ウィジェット設定 */}
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <p className="settings-label" style={{ marginBottom: 6 }}>写真ウィジェット</p>
                <div className="settings-row">
                  <label className="settings-label" style={{ fontSize: 11 }}>写真フォルダ</label>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button className="btn-small" onClick={selectPhotoFolder}>選択</button>
                    <span className="settings-hint" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {settings.widgets.photoFolder ? settings.widgets.photoFolder.split(/[\\/]/).pop() : "未設定"}
                    </span>
                  </div>
                </div>
                <div className="settings-row">
                  <label className="settings-label" style={{ fontSize: 11 }}>表示時間</label>
                  <div className="font-size-control">
                    <input
                      type="number" className="font-size-input" value={settings.widgets.photoInterval ?? 10}
                      min={3} max={120}
                      onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 3 && v <= 120) setWidgetField("photoInterval", v); }}
                    />
                    <span className="settings-hint" style={{ marginLeft: 4 }}>秒</span>
                  </div>
                </div>
              </div>

              {/* ニュースウィジェット設定 */}
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <p className="settings-label" style={{ marginBottom: 6 }}>ニュースウィジェット</p>
                <div className="settings-row">
                  <label className="settings-label" style={{ fontSize: 11 }}>更新間隔</label>
                  <div className="font-size-control">
                    <input
                      type="number" className="font-size-input" value={settings.widgets.newsInterval ?? 30}
                      min={5} max={120}
                      onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 5 && v <= 120) setWidgetField("newsInterval", v); }}
                    />
                    <span className="settings-hint" style={{ marginLeft: 4 }}>分</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  <input
                    className="rename-input"
                    style={{ flex: 1, fontSize: 11, padding: "3px 6px" }}
                    placeholder="キーワードを入力..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addKeyword(); }}
                  />
                  <button className="btn-small" onClick={addKeyword}>追加</button>
                </div>
                <div className="keyword-tags">
                  {(settings.widgets.newsKeywords ?? []).map((kw) => (
                    <span key={kw} className="keyword-tag">
                      {kw}
                      <button className="keyword-remove" onClick={() => removeKeyword(kw)}>×</button>
                    </span>
                  ))}
                  {(settings.widgets.newsKeywords ?? []).length === 0 && (
                    <span className="settings-hint">キーワード未登録</span>
                  )}
                </div>
              </div>
            </section>

            <div className="settings-footer">
              <button className="btn-save" onClick={handleSave}>保存</button>
              {saveMsg && <span className="save-status">{saveMsg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
