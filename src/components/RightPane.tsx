import React, { useState } from "react";
import CalendarWidget from "./CalendarWidget";
import WeatherWidget from "./WeatherWidget";
import SystemMonitorWidget from "./SystemMonitorWidget";
import PhotoWidget from "./PhotoWidget";
import NewsWidget from "./NewsWidget";
import ClockWidget from "./ClockWidget";
import InfoWidget from "./InfoWidget";
import BatteryWidget from "./BatteryWidget";
import type { WidgetItem, AppSettings } from "../lib/settings";

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

  function renderWidget(id: string, visible: boolean) {
  // 非表示のウィジェットは何もしない
  if (!visible) return null;

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
    case "battery": return <BatteryWidget />;
    case "info": return <InfoWidget />;
    default: return null;
  }
}

  return (
    <div className="pane right-pane">
      <div
        className="pane-tabs"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
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
                {renderWidget(item.id, item.visible)}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
