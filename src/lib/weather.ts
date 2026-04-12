export interface WeatherData {
  city: string;
  description: string;
  icon: string;
  tempCurrent: number;
  tempMax: number;
  tempMin: number;
}

// ブラウザの Geolocation API で緯度経度を取得（Windows Location Service 利用）
function getBrowserLocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation 未対応"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 8000, maximumAge: 300_000 }
    );
  });
}

// Nominatim でリバースジオコーディング（緯度経度 → 市区町村名）
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`;
  const res = await fetch(url, { headers: { "User-Agent": "ALICE-App/1.0" } });
  if (!res.ok) return "不明";
  const data = await res.json();
  // 市区町村を優先
  const addr = data.address ?? {};
  return addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? "不明";
}

// IP ベースのフォールバック
async function getLocationByIp(): Promise<{ lat: number; lon: number; city: string }> {
  const res = await fetch("https://ipinfo.io/json");
  if (!res.ok) throw new Error("位置情報の取得に失敗しました");
  const data = await res.json();
  const [lat, lon] = (data.loc ?? "0,0").split(",").map(Number);
  return { lat, lon, city: data.city ?? "不明" };
}

export async function fetchWeather(): Promise<WeatherData> {
  let lat: number, lon: number, city: string;

  try {
    // Windows Location Service 経由で高精度な位置情報を取得
    const pos = await getBrowserLocation();
    lat = pos.lat;
    lon = pos.lon;
    city = await reverseGeocode(lat, lon);
  } catch {
    // Geolocation が使えない場合は IP ベースにフォールバック
    const ipLoc = await getLocationByIp();
    lat = ipLoc.lat;
    lon = ipLoc.lon;
    city = ipLoc.city;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weathercode` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&timezone=Asia%2FTokyo&forecast_days=1`;

  const weatherRes = await fetch(url);
  if (!weatherRes.ok) throw new Error("天気情報の取得に失敗しました");
  const data = await weatherRes.json();

  return {
    city,
    description: wmoDescription(data.current.weathercode),
    icon: String(data.current.weathercode),
    tempCurrent: Math.round(data.current.temperature_2m),
    tempMax: Math.round(data.daily.temperature_2m_max[0]),
    tempMin: Math.round(data.daily.temperature_2m_min[0]),
  };
}

export function wmoDescription(code: number): string {
  if (code === 0) return "快晴";
  if (code <= 2) return "晴れ";
  if (code === 3) return "曇り";
  if (code <= 49) return "霧";
  if (code <= 59) return "霧雨";
  if (code <= 69) return "雨";
  if (code <= 79) return "雪";
  if (code <= 84) return "にわか雨";
  if (code <= 94) return "雷雨";
  return "雷雨";
}

export type IconType = "sunny" | "partly-cloudy" | "cloudy" | "rainy" | "snowy" | "stormy" | "foggy";

export function wmoIconType(code: number): IconType {
  if (code === 0) return "sunny";
  if (code <= 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code <= 49) return "foggy";
  if (code <= 69) return "rainy";
  if (code <= 79) return "snowy";
  if (code <= 84) return "rainy";
  return "stormy";
}
