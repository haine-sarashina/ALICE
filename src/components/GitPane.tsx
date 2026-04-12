import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GitStatusItem {
  status: string;
  path: string;
  staged: boolean;
}

interface GitInfo {
  isRepo: boolean;
  branch: string;
  items: GitStatusItem[];
}

interface GitPaneProps {
  cwd?: string;
  onDiffOpen?: (path: string, content: string) => void;
}

export default function GitPane({ cwd, onDiffOpen }: GitPaneProps) {
  const [info, setInfo] = useState<GitInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [commitResult, setCommitResult] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);
  const [hasUnpushed, setHasUnpushed] = useState(false);

  const refresh = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try {
      const result = await invoke<GitInfo>("git_status", { cwd });
      setInfo(result);
      if (result.isRepo) {
        const remote = await invoke<boolean>("git_has_remote", { cwd });
        setHasRemote(remote);
        if (remote) {
          const unpushed = await invoke<boolean>("git_has_unpushed", { cwd });
          setHasUnpushed(unpushed);
        } else {
          setHasUnpushed(false);
        }
      }
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    refresh();
    // 10秒ごとに自動更新
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleStage(path: string) {
    if (!cwd) return;
    try {
      await invoke("git_stage", { cwd, path });
      await refresh();
    } catch {}
  }

  async function handleUnstage(path: string) {
    if (!cwd) return;
    try {
      await invoke("git_unstage", { cwd, path });
      await refresh();
    } catch {}
  }

  async function handleCommit() {
    if (!cwd || !commitMsg.trim()) return;
    try {
      const result = await invoke<string>("git_commit", { cwd, message: commitMsg.trim() });
      setCommitResult(result);
      setCommitMsg("");
      setTimeout(() => setCommitResult(null), 3000);
      await refresh();
    } catch (e) {
      setCommitResult(`エラー: ${e}`);
    }
  }

  async function handlePush() {
    if (!cwd) return;
    setPushing(true);
    setPushResult(null);
    try {
      const result = await invoke<string>("git_push", { cwd });
      setPushResult(result || "プッシュ完了");
      setTimeout(() => setPushResult(null), 5000);
    } catch (e) {
      setPushResult(`エラー: ${e}`);
    } finally {
      setPushing(false);
    }
  }

  async function handleShowDiff(path: string, staged: boolean, status: string) {
    if (!cwd) return;
    if (diffPath === path) {
      setDiffContent(null);
      setDiffPath(null);
      return;
    }
    try {
      const diff = await invoke<string>("git_diff", { cwd, path, staged });
      const diffText = diff || "(差分なし)";
      setDiffContent(diffText);
      setDiffPath(path);
      // 変更ファイルの場合はエディタにDiffタブを開く
      if (status === "M" && onDiffOpen) {
        onDiffOpen(path, diffText);
      }
    } catch {
      setDiffContent("(差分取得失敗)");
      setDiffPath(path);
    }
  }

  if (!cwd) {
    return <div className="git-pane-empty">プロジェクトフォルダを開いてください</div>;
  }

  if (loading && !info) {
    return <div className="git-pane-empty">読み込み中...</div>;
  }

  if (info && !info.isRepo) {
    return <div className="git-pane-empty">Gitリポジトリではありません</div>;
  }

  if (!info) {
    return <div className="git-pane-empty">Git情報を取得できませんでした</div>;
  }

  const stagedItems = info.items.filter(i => i.staged);
  const unstagedItems = info.items.filter(i => !i.staged);

  function statusLabel(s: string) {
    switch (s) {
      case "M": return "変更";
      case "A": return "追加";
      case "D": return "削除";
      case "R": return "名前変更";
      case "?": return "未追跡";
      default: return s;
    }
  }

  function statusColor(s: string) {
    switch (s) {
      case "M": return "var(--yellow)";
      case "A": return "var(--green)";
      case "D": return "var(--red)";
      case "?": return "var(--text-muted)";
      default: return "var(--text-secondary)";
    }
  }

  // gitがクォートしたパスをデコード（日本語ファイル名等）
  function unquotePath(p: string): string {
    if (p.startsWith('"') && p.endsWith('"')) {
      return p.slice(1, -1).replace(/\\(\d{3})/g, (_, oct) =>
        String.fromCharCode(parseInt(oct, 8))
      ).replace(/\\\\/g, "\\");
    }
    return p;
  }

  return (
    <div className="git-pane">
      <div className="git-branch">
        <span className="git-branch-icon">⎇</span>
        <span className="git-branch-name">{info.branch || "HEAD"}</span>
        <button className="btn-small btn-refresh-git" onClick={refresh} title="更新">↻</button>
        {hasRemote && (
          <button
            className="btn-small btn-push-git"
            onClick={handlePush}
            disabled={pushing || !hasUnpushed}
            title={hasUnpushed ? "プッシュ" : "プッシュするコミットはありません"}
          >
            {pushing ? "..." : "↑ Push"}
          </button>
        )}
      </div>
      {pushResult && <div className="git-push-result">{pushResult}</div>}

      {/* ステージ済み */}
      {stagedItems.length > 0 && (
        <div className="git-section">
          <div className="git-section-title">ステージ済み ({stagedItems.length})</div>
          <ul className="git-file-list">
            {stagedItems.map((item, i) => (
              <li key={`staged-${i}`} className="git-file-item">
                <span className="git-status" style={{ color: statusColor(item.status) }}>{statusLabel(item.status)}</span>
                <span
                  className="git-file-name"
                  onClick={() => handleShowDiff(item.path, true, item.status)}
                  title={unquotePath(item.path)}
                >
                  {unquotePath(item.path)}
                </span>
                <button className="btn-git-action" onClick={() => handleUnstage(item.path)} title="ステージ解除">−</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 未ステージ */}
      {unstagedItems.length > 0 && (
        <div className="git-section">
          <div className="git-section-title">変更 ({unstagedItems.length})</div>
          <ul className="git-file-list">
            {unstagedItems.map((item, i) => (
              <li key={`unstaged-${i}`} className="git-file-item">
                <span className="git-status" style={{ color: statusColor(item.status) }}>{statusLabel(item.status)}</span>
                <span
                  className="git-file-name"
                  onClick={() => handleShowDiff(item.path, false, item.status)}
                  title={unquotePath(item.path)}
                >
                  {unquotePath(item.path)}
                </span>
                <button className="btn-git-action" onClick={() => handleStage(item.path)} title="ステージ">＋</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {info.items.length === 0 && (
        <div className="git-pane-empty" style={{ padding: "8px 10px" }}>変更はありません</div>
      )}

      {/* Diff表示 */}
      {diffContent && (
        <div className="git-diff">
          <div className="git-diff-header">
            <span>{diffPath}</span>
            <button className="btn-git-action" onClick={() => { setDiffContent(null); setDiffPath(null); }}>✕</button>
          </div>
          <pre className="git-diff-content">{diffContent}</pre>
        </div>
      )}

      {/* コミット */}
      {stagedItems.length > 0 && (
        <div className="git-commit-area">
          <textarea
            className="git-commit-input"
            placeholder="コミットメッセージ..."
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            rows={3}
          />
          <button
            className="btn-commit"
            onClick={handleCommit}
            disabled={!commitMsg.trim()}
          >
            コミット
          </button>
          {commitResult && <div className="git-commit-result">{commitResult}</div>}
        </div>
      )}
    </div>
  );
}
