import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

interface ClaudeUsageInfo {
  loggedIn: boolean;
  authMethod: string | null;
  email: string | null;
  orgName: string | null;
  subscriptionType: string | null;
  error: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  pro: "Pro",
  max_5: "Max (5x)",
  max_20: "Max (20x)",
  max: "Max",
  free: "Free",
  enterprise: "Enterprise",
  team: "Team",
};

export default function ClaudeCodeWidget() {
  const [info, setInfo] = useState<ClaudeUsageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const result = await invoke<ClaudeUsageInfo>("get_claude_usage");
      setInfo(result);
      setError(result.error || null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  function openUsagePage() {
    openUrl("https://claude.ai/settings/usage");
  }

  const planLabel = info?.subscriptionType
    ? PLAN_LABELS[info.subscriptionType] ?? info.subscriptionType
    : null;

  return (
    <div className="widget claude-usage-widget">
      <div className="weather-header">
        <h3>Claude Code</h3>
        <button className="btn-refresh" onClick={refresh} title="更新" disabled={loading}>↻</button>
      </div>

      {error && !info && <div className="weather-error">{error}</div>}
      {loading && !info && <div className="weather-loading">取得中...</div>}

      {info && (
        <div className="claude-usage-body">
          {!info.loggedIn ? (
            <div className="claude-usage-row">
              <span className="monitor-value" style={{ color: "var(--text-muted)" }}>未ログイン</span>
            </div>
          ) : (
            <>
              <div className="claude-usage-row">
                <span className="monitor-label">プラン</span>
                <span className="monitor-value claude-plan-badge">{planLabel ?? "—"}</span>
              </div>
              {info.email && (
                <div className="claude-usage-row">
                  <span className="monitor-label">アカウント</span>
                  <span className="monitor-value">{info.email}</span>
                </div>
              )}
              {info.authMethod && (
                <div className="claude-usage-row">
                  <span className="monitor-label">認証</span>
                  <span className="monitor-value">{info.authMethod}</span>
                </div>
              )}
            </>
          )}

          <button className="claude-usage-link" onClick={openUsagePage} title="ブラウザで使用状況ページを開く">
            使用状況を確認 →
          </button>
        </div>
      )}
    </div>
  );
}
