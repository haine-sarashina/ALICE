import { useState, useEffect } from "react";

export default function ClockWidget() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
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
