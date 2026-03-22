import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface NewsItem {
  title: string;
  url: string;
}

interface NewsWidgetProps {
  keywords: string[];
  intervalMinutes?: number;
  onNewsClick?: (title: string, url: string) => void;
}

// 表示幅に合わせてタイトルを最大行数で切り詰める（文字単位の折り返しシミュレーション）
function truncateToFit(text: string, containerWidth: number, fontSize: number, maxLines: number): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx || containerWidth <= 0) return text;
  ctx.font = `${fontSize}px "Segoe UI", "Meiryo", sans-serif`;

  // 1文字ずつ追加して折り返しをシミュレーション
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < text.length; i++) {
    const lineText = text.slice(lineStart, i + 1);
    if (ctx.measureText(lineText).width > containerWidth) {
      line++;
      lineStart = i;
      if (line > maxLines) {
        // maxLines を超えた → i の手前で切る
        // 最終行に "..." が収まる位置を探す
        let end = i - 1;
        while (end > 0) {
          const startOfLastLine = lineStart > 0 ? lineStart : 0;
          if (ctx.measureText(text.slice(startOfLastLine, end) + "...").width <= containerWidth) {
            break;
          }
          end--;
        }
        return text.slice(0, end) + "...";
      }
    }
  }
  return text;
}

function NewsList({ items, onNewsClick }: { items: NewsItem[]; onNewsClick?: (title: string, url: string) => void }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [displayTitles, setDisplayTitles] = useState<string[]>([]);

  useEffect(() => {
    if (!listRef.current || items.length === 0) { setDisplayTitles([]); return; }
    // リスト要素の幅を取得して切り詰め
    const li = listRef.current.querySelector(".news-item");
    const width = li ? li.clientWidth - 12 : 180; // padding分を引く
    const titles = items.map(item => truncateToFit(item.title, width, 11, 2));
    setDisplayTitles(titles);
  }, [items]);

  // リサイズ時にも再計算
  useEffect(() => {
    if (!listRef.current || items.length === 0) return;
    const observer = new ResizeObserver(() => {
      const li = listRef.current?.querySelector(".news-item");
      const width = li ? li.clientWidth - 12 : 180;
      const titles = items.map(item => truncateToFit(item.title, width, 11, 2));
      setDisplayTitles(titles);
    });
    observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [items]);

  return (
    <ul className="news-list" ref={listRef}>
      {items.map((item, i) => (
        <li
          key={i}
          className="news-item"
          onClick={() => onNewsClick?.(item.title, item.url)}
          title={item.title}
        >
          {displayTitles[i] ?? item.title}
        </li>
      ))}
    </ul>
  );
}

export default function NewsWidget({ keywords, intervalMinutes = 30, onNewsClick }: NewsWidgetProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (keywords.length === 0) { setItems([]); return; }
    setLoading(true);
    try {
      const result = await invoke<NewsItem[]>("fetch_news", { keywords });
      setItems(result);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, intervalMinutes * 60 * 1000);
    return () => clearInterval(id);
  }, [keywords.join(","), intervalMinutes]);

  if (keywords.length === 0) {
    return (
      <div className="widget news-widget">
        <h3>ニュース</h3>
        <p className="news-empty">設定画面でキーワードを登録してください</p>
      </div>
    );
  }

  return (
    <div className="widget news-widget">
      <div className="weather-header">
        <h3>ニュース</h3>
        <button className="btn-refresh" onClick={load} title="更新" disabled={loading}>↻</button>
      </div>
      {loading && items.length === 0 && <div className="weather-loading">取得中...</div>}
      {error && items.length === 0 && <div className="weather-error">{error}</div>}
      <NewsList items={items} onNewsClick={onNewsClick} />
    </div>
  );
}
