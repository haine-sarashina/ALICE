import type { IconType } from "../lib/weather";

interface Props {
  type: IconType;
  size?: number;
}

export default function WeatherIcon({ type, size = 48 }: Props) {
  const s = size;
  const stroke = "#cdd6f4";
  const sw = 1.5;

  switch (type) {
    case "sunny":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className="weather-icon">
          <circle cx="24" cy="24" r="9" stroke="#f9e2af" strokeWidth={sw} />
          {[0,45,90,135,180,225,270,315].map((deg, i) => {
            const r = Math.PI * deg / 180;
            const x1 = 24 + 13 * Math.cos(r), y1 = 24 + 13 * Math.sin(r);
            const x2 = 24 + 17 * Math.cos(r), y2 = 24 + 17 * Math.sin(r);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f9e2af" strokeWidth={sw} strokeLinecap="round" />;
          })}
        </svg>
      );

    case "partly-cloudy":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className="weather-icon">
          <circle cx="20" cy="20" r="7" stroke="#f9e2af" strokeWidth={sw} />
          {[0,60,120,180,240,300].map((deg, i) => {
            const r = Math.PI * deg / 180;
            const x1 = 20 + 10 * Math.cos(r), y1 = 20 + 10 * Math.sin(r);
            const x2 = 20 + 13 * Math.cos(r), y2 = 20 + 13 * Math.sin(r);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f9e2af" strokeWidth={sw} strokeLinecap="round" />;
          })}
          <path d="M14 32 Q14 26 20 26 Q21 22 26 22 Q32 22 32 28 Q36 28 36 32 Z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );

    case "cloudy":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className="weather-icon">
          <path d="M10 30 Q10 22 18 22 Q19 17 26 17 Q34 17 34 24 Q39 24 39 30 Z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );

    case "rainy":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className="weather-icon">
          <path d="M10 26 Q10 18 18 18 Q19 13 26 13 Q34 13 34 20 Q39 20 39 26 Z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          {[[16,32,14,38],[22,32,20,38],[28,32,26,38],[34,32,32,38]].map(([x1,y1,x2,y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#89b4fa" strokeWidth={sw} strokeLinecap="round" />
          ))}
        </svg>
      );

    case "snowy":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className="weather-icon">
          <path d="M10 26 Q10 18 18 18 Q19 13 26 13 Q34 13 34 20 Q39 20 39 26 Z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          {[16,22,28,34].map((x, i) => (
            <circle key={i} cx={x} cy={36} r="2" stroke="#cdd6f4" strokeWidth={sw} />
          ))}
        </svg>
      );

    case "stormy":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className="weather-icon">
          <path d="M10 26 Q10 18 18 18 Q19 13 26 13 Q34 13 34 20 Q39 20 39 26 Z" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <polyline points="26,28 22,35 26,35 22,42" stroke="#f9e2af" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case "foggy":
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className="weather-icon">
          {[18, 23, 28, 33].map((y, i) => (
            <line key={i} x1="10" y1={y} x2="38" y2={y} stroke={stroke} strokeWidth={sw} strokeLinecap="round" opacity={1 - i * 0.2} />
          ))}
        </svg>
      );
  }
}
