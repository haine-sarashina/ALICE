import { useState, useMemo } from "react";

/** n番目の曜日を求める (1-indexed)。weekday: 0=日,1=月,...,6=土 */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(year, month - 1, 1).getDay();
  let day = 1 + ((weekday - first + 7) % 7);
  day += (n - 1) * 7;
  return day;
}

/** 春分の日 (2000–2099) */
function vernalEquinox(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** 秋分の日 (2000–2099) */
function autumnalEquinox(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** 指定年の日本の祝日セットを返す ("M-D" 形式) */
function getJapaneseHolidays(year: number): Set<string> {
  const holidays = new Map<string, boolean>();

  // 固定祝日
  const fixed: [number, number][] = [
    [1, 1],   // 元日
    [2, 11],  // 建国記念の日
    [2, 23],  // 天皇誕生日
    [4, 29],  // 昭和の日
    [5, 3],   // 憲法記念日
    [5, 4],   // みどりの日
    [5, 5],   // こどもの日
    [8, 11],  // 山の日
    [11, 3],  // 文化の日
    [11, 23], // 勤労感謝の日
  ];
  for (const [m, d] of fixed) holidays.set(`${m}-${d}`, true);

  // ハッピーマンデー
  holidays.set(`1-${nthWeekday(year, 1, 1, 2)}`, true);   // 成人の日 (1月第2月曜)
  holidays.set(`7-${nthWeekday(year, 7, 1, 3)}`, true);   // 海の日 (7月第3月曜)
  holidays.set(`9-${nthWeekday(year, 9, 1, 3)}`, true);   // 敬老の日 (9月第3月曜)
  holidays.set(`10-${nthWeekday(year, 10, 1, 2)}`, true);  // スポーツの日 (10月第2月曜)

  // 春分の日・秋分の日
  holidays.set(`3-${vernalEquinox(year)}`, true);
  holidays.set(`9-${autumnalEquinox(year)}`, true);

  // 振替休日: 祝日が日曜の場合、翌日以降の最初の平日が振替休日
  const keys = [...holidays.keys()];
  for (const key of keys) {
    const [m, d] = key.split("-").map(Number);
    const date = new Date(year, m - 1, d);
    if (date.getDay() === 0) {
      let subDay = d + 1;
      while (holidays.has(`${m}-${subDay}`)) subDay++;
      holidays.set(`${m}-${subDay}`, true);
    }
  }

  // 国民の休日: 敬老の日と秋分の日に挟まれた日
  const keirouDay = nthWeekday(year, 9, 1, 3);
  const autumnDay = autumnalEquinox(year);
  if (autumnDay - keirouDay === 2) {
    holidays.set(`9-${keirouDay + 1}`, true);
  }

  return new Set(holidays.keys());
}

export default function CalendarWidget() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  const holidays = useMemo(() => getJapaneseHolidays(year), [year]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);

  const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
  const monthName = `${year}年 ${month + 1}月`;

  return (
    <div className="widget calendar-widget">
      <div className="cal-widget-title">
        <h3>カレンダー</h3>
      </div>
      <div className="cal-header">
        <button className="cal-nav" onClick={prevMonth}>‹</button>
        <span className="cal-title">{monthName}</span>
        <button className="cal-nav" onClick={nextMonth}>›</button>
      </div>
      <table className="cal-table">
        <thead>
          <tr>
            {WEEK_LABELS.map((l, i) => (
              <th key={i} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: 7 }, (_, col) => {
                const day = cells[row * 7 + col];
                const isToday =
                  day === today.getDate() &&
                  month === today.getMonth() &&
                  year === today.getFullYear();
                const isSun = col === 0;
                const isSat = col === 6;
                const isHol = day !== null && holidays.has(`${month + 1}-${day}`);
                const cls = [
                  "cal-day",
                  isToday ? "today" : "",
                  isSun || isHol ? "sun" : isSat ? "sat" : "",
                  day === null ? "empty" : "",
                ].filter(Boolean).join(" ");
                return <td key={col} className={cls}>{day ?? ""}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
