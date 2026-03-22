import React, { useState } from "react";
import CalendarWidget from "./CalendarWidget";
import WeatherWidget from "./WeatherWidget";
import SystemMonitorWidget from "./SystemMonitorWidget";
import PhotoWidget from "./PhotoWidget";
import NewsWidget from "./NewsWidget";
import type { WidgetItem, AppSettings } from "../lib/settings";

function ClockWidget() {
  const [time, setTime] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="widget clock-widget">
      <h3>時刻</h3>
      <div className="clock-time">{time.toLocaleTimeString("ja-JP")}</div>
      <div className="clock-date">{time.toLocaleDateString("ja-JP", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
    </div>
  );
}

function InfoWidget() {
  return (
    <div className="widget info-widget">
      <h3>ALICE について</h3>
      <ul>
        <li>AI Local Interface for Code Editor</li>
        <li>Tauri v2 + React</li>
        <li>LM Studio 連携</li>
        <li>4 ペインレイアウト</li>
      </ul>
    </div>
  );
}

interface RightPaneProps {
  widgetItems?: WidgetItem[];
  settings?: AppSettings;
  onPhotoClick?: (path: string, dataUrl: string) => void;
  onNewsClick?: (title: string, url: string) => void;
}

export default function RightPane({ widgetItems, settings, onPhotoClick, onNewsClick }: RightPaneProps) {
  const [activeTab, setActiveTab] = useState(0);

  const visibleWidgets = widgetItems
    ? widgetItems.filter((w) => w.visible)
    : [
        { id: "clock", visible: true },
        { id: "calendar", visible: true },
        { id: "weather", visible: true },
        { id: "photo", visible: true },
        { id: "news", visible: true },
        { id: "systemMonitor", visible: true },
        { id: "info", visible: true },
      ];

  function renderWidget(id: string) {
    switch (id) {
      case "clock": return <ClockWidget />;
      case "calendar": return <CalendarWidget />;
      case "weather": return <WeatherWidget />;
      case "photo": return (
        <PhotoWidget
          folder={settings?.widgets.photoFolder}
          interval={settings?.widgets.photoInterval ?? 10}
          onPhotoClick={onPhotoClick}
        />
      );
      case "news": return (
        <NewsWidget
          keywords={settings?.widgets.newsKeywords ?? []}
          intervalMinutes={settings?.widgets.newsInterval ?? 30}
          onNewsClick={onNewsClick}
        />
      );
      case "systemMonitor": return <SystemMonitorWidget />;
      case "info": return <InfoWidget />;
      default: return null;
    }
  }

  return (
    <div className="pane right-pane">
      <div className="pane-tabs">
        <button
          className={`tab-btn ${activeTab === 0 ? "active" : ""}`}
          onClick={() => setActiveTab(0)}
        >
          ウィジェット
        </button>
      </div>

      <div className="pane-content">
        {activeTab === 0 && (
          <div className="widget-list">
            {visibleWidgets.map((item) => (
              <React.Fragment key={item.id}>
                {renderWidget(item.id)}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
