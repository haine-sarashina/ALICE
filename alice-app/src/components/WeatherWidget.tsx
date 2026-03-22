import { useState, useEffect, useRef } from "react";
import { fetchWeather, wmoIconType, type WeatherData } from "../lib/weather";
import WeatherIcon from "./WeatherIcon";

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const initialLoad = useRef(true);

  async function load() {
    // 初回のみ loading 表示、以降はバックグラウンド更新
    if (initialLoad.current) setLoading(true);
    try {
      const data = await fetchWeather();
      setWeather(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      initialLoad.current = false;
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="widget weather-widget">
      <div className="weather-header">
        <h3>天気</h3>
        <button className="btn-refresh" onClick={load} title="更新" disabled={loading}>↻</button>
      </div>

      {loading && !weather && <div className="weather-loading">取得中...</div>}
      {error && !weather && <div className="weather-error">{error}</div>}

      {weather && (
        <div className="weather-body-compact">
          <div className="weather-row-top">
            <span className="weather-city">{weather.city}</span>
            <span className="weather-desc-inline">{weather.description}</span>
          </div>
          <div className="weather-row-main">
            <WeatherIcon type={wmoIconType(Number(weather.icon))} size={40} />
            <div className="weather-temp-current">{weather.tempCurrent}°</div>
            <div className="weather-range-col">
              <span className="temp-max">↑ {weather.tempMax}°</span>
              <span className="temp-min">↓ {weather.tempMin}°</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
