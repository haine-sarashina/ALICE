import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface BatteryInfo {
  present: boolean;
  percent: number;
  isCharging: boolean;
  timeRemainingMinutes: number | null;
}

function BatteryIcon({ percent, isCharging }: { percent: number; isCharging: boolean }) {
  const fillW = Math.round((Math.min(100, Math.max(0, percent)) / 100) * 40);
  const color = percent <= 15 ? "#f38ba8" : percent <= 40 ? "#f9e2af" : "#a6e3a1";

  return (
    <svg width="52" height="24" viewBox="0 0 52 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="44" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="2"/>
      <rect x="45" y="8" width="6" height="8" rx="2" fill="currentColor"/>
      {fillW > 0 && (
        <rect x="3" y="3" width={fillW} height="18" rx="1.5" fill={color}/>
      )}
      {isCharging && (
        <text x="23" y="17" textAnchor="middle" fill="currentColor" fontSize="13" fontFamily="sans-serif">⚡</text>
      )}
    </svg>
  );
}

export default function BatteryWidget() {
  const [info, setInfo] = useState<BatteryInfo | null>(null);

  async function refresh() {
    try {
      const b = await invoke<BatteryInfo>("get_battery_info");
      setInfo(b);
    } catch {}
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);

  if (!info || !info.present) return null;

  function formatTime(minutes: number | null): string | null {
    if (minutes === null) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `約 ${h}時間${m > 0 ? m + "分" : ""}`;
    return `約 ${m}分`;
  }

  const timeStr = !info.isCharging ? formatTime(info.timeRemainingMinutes) : null;

  return (
    <div className="widget battery-widget">
      <h3>バッテリー</h3>
      <div className="battery-content">
        <BatteryIcon percent={info.percent} isCharging={info.isCharging}/>
        <div className="battery-info">
          <span className="battery-percent">{Math.round(info.percent)}%</span>
          <span className="battery-status">{info.isCharging ? "充電中" : "使用中"}</span>
          {timeStr && <span className="battery-time">{timeStr}</span>}
        </div>
      </div>
    </div>
  );
}
