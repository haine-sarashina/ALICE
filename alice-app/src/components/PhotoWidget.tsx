import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PhotoWidgetProps {
  folder?: string | null;
  interval?: number;
  onPhotoClick?: (path: string, dataUrl: string) => void;
}

export default function PhotoWidget({ folder, interval = 10, onPhotoClick }: PhotoWidgetProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [currentDataUrl, setCurrentDataUrl] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  // "visible" → "fade-out" → (画像差替) → "fade-in" → "visible"
  const [phase, setPhase] = useState<"visible" | "fade-out" | "fade-in">("visible");
  const orderRef = useRef<number[]>([]);
  const indexRef = useRef(0);
  const nextDataRef = useRef<{ url: string; path: string } | null>(null);

  // 写真リストを取得
  useEffect(() => {
    if (!folder) return;
    invoke<string[]>("list_photos", { dir: folder }).then((list) => {
      setPhotos(list);
      const indices = list.map((_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      orderRef.current = indices;
      indexRef.current = 0;
    }).catch(() => {});
  }, [folder]);

  const loadPhoto = useCallback(async (path: string) => {
    try {
      return await invoke<string>("read_file_base64", { path });
    } catch {
      return null;
    }
  }, []);

  // 最初の写真を表示
  useEffect(() => {
    if (photos.length === 0 || orderRef.current.length === 0) return;
    const idx = orderRef.current[0];
    loadPhoto(photos[idx]).then((url) => {
      if (url) {
        setCurrentDataUrl(url);
        setCurrentPath(photos[idx]);
      }
    });
  }, [photos]);

  // スライドショー
  useEffect(() => {
    if (photos.length <= 1) return;
    const timer = setInterval(async () => {
      indexRef.current = (indexRef.current + 1) % orderRef.current.length;
      const idx = orderRef.current[indexRef.current];
      const url = await loadPhoto(photos[idx]);
      if (!url) return;

      // 次の写真データをrefに保持し、フェードアウト開始
      nextDataRef.current = { url, path: photos[idx] };
      setPhase("fade-out");
    }, interval * 1000);
    return () => clearInterval(timer);
  }, [photos, interval]);

  // フェードアウト完了 → 画像差替え → フェードイン
  useEffect(() => {
    if (phase === "fade-out") {
      const t = setTimeout(() => {
        if (nextDataRef.current) {
          setCurrentDataUrl(nextDataRef.current.url);
          setCurrentPath(nextDataRef.current.path);
          nextDataRef.current = null;
        }
        setPhase("fade-in");
      }, 600);
      return () => clearTimeout(t);
    }
    if (phase === "fade-in") {
      const t = setTimeout(() => setPhase("visible"), 600);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (!folder) {
    return (
      <div className="widget photo-widget">
        <h3>写真</h3>
        <p className="photo-empty">設定画面でフォルダを指定してください</p>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="widget photo-widget">
        <h3>写真</h3>
        <p className="photo-empty">写真が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="widget photo-widget">
      <h3>写真</h3>
      <div
        className="photo-frame"
        onClick={() => currentPath && currentDataUrl && onPhotoClick?.(currentPath, currentDataUrl)}
        style={{ cursor: onPhotoClick ? "pointer" : "default" }}
      >
        {currentDataUrl && (
          <img
            src={currentDataUrl}
            alt=""
            className={`photo-img ${phase === "fade-out" ? "fade-out" : ""} ${phase === "fade-in" ? "fade-in" : ""}`}
          />
        )}
      </div>
    </div>
  );
}
