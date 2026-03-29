import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SystemStats {
  cpuUsage: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryUsage: number;
  cpuTemp: number | null;
  gpuUsage: number | null;
  gpuTemp: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  gpuName: string | null;
  npuUsage: number | null;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="monitor-bar-track">
      <div className="monitor-bar-fill" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
    </div>
  );
}

function Row({ label, value, bar, color }: { label: string; value: string; bar?: number; color?: string }) {
  return (
    <div className="monitor-row">
      <span className="monitor-label">{label}</span>
      <span className="monitor-value">{value}</span>
      {bar !== undefined && <Bar value={bar} color={color ?? "#89b4fa"} />}
    </div>
  );
}

function usageColor(pct: number) {
  if (pct >= 90) return "#f38ba8";
  if (pct >= 70) return "#f9e2af";
  return "#a6e3a1";
}

export default function SystemMonitorWidget() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const s = await invoke<SystemStats>("get_system_stats");
      setStats(s);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="widget monitor-widget">
      <h3>システム</h3>
      {error && <div className="weather-error">{error}</div>}
      {stats && (
        <div className="monitor-rows">
          <Row
            label="CPU"
            value={`${stats.cpuUsage.toFixed(1)}%`}
            bar={stats.cpuUsage}
            color={usageColor(stats.cpuUsage)}
          />
          {stats.cpuTemp !== null && (
            <Row label="CPU 温度" value={`${stats.cpuTemp.toFixed(0)}°C`} />
          )}
          <Row
            label="メモリ"
            value={`${stats.memoryUsedMb.toLocaleString()} / ${stats.memoryTotalMb.toLocaleString()} MB`}
            bar={stats.memoryUsage}
            color={usageColor(stats.memoryUsage)}
          />
          {stats.gpuUsage !== null && (
            <>
              <Row
                label="GPU"
                value={`${stats.gpuUsage.toFixed(1)}%`}
                bar={stats.gpuUsage}
                color={usageColor(stats.gpuUsage)}
              />
              {stats.gpuName && (
                <div className="monitor-gpu-name">{stats.gpuName}</div>
              )}
            </>
          )}
          {stats.gpuTemp !== null && (
            <Row label="GPU 温度" value={`${stats.gpuTemp.toFixed(0)}°C`} />
          )}
          {stats.vramUsedMb !== null && stats.vramTotalMb !== null && (
            <Row
              label="VRAM"
              value={stats.vramTotalMb >= 1024 ? `${(stats.vramUsedMb/1024).toFixed(1)} / ${(stats.vramTotalMb/1024).toFixed(1)} GB` : `${stats.vramUsedMb} / ${stats.vramTotalMb} MB`}
              bar={(stats.vramUsedMb / stats.vramTotalMb) * 100}
              color={usageColor((stats.vramUsedMb / stats.vramTotalMb) * 100)}
            />
          )}
          {stats.npuUsage !== null && (
            <Row
              label="NPU"
              value={`${stats.npuUsage.toFixed(1)}%`}
              bar={stats.npuUsage}
              color={usageColor(stats.npuUsage)}
            />
          )}
          {stats.gpuUsage === null && (
            <div className="monitor-no-gpu">GPU: 未検出</div>
          )}
        </div>
      )}
    </div>
  );
}
