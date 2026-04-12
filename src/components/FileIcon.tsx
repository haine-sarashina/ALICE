
interface Props {
  isDir: boolean;
  accessible?: boolean;
  name?: string;
}

export default function FileIcon({ isDir, accessible = true, name = "" }: Props) {
  if (isDir) {
    if (!accessible) {
      return (
        <svg className="icon icon-lock" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="7" width="10" height="8" rx="1.5" fill="#585b70" />
          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="#585b70" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11" r="1" fill="#1e1e2e" />
        </svg>
      );
    }
    return (
      <svg className="icon icon-folder" viewBox="0 0 16 16" fill="none">
        <path d="M1.5 4.5A1.5 1.5 0 013 3h3.172a1.5 1.5 0 011.06.44l.829.828A1.5 1.5 0 009.12 4.75H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 13.75H3A1.5 1.5 0 011.5 12.25V4.5z" fill="#89b4fa" />
      </svg>
    );
  }

  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";

  // コード系
  if (["ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "c", "cpp", "cs", "rb", "php", "swift", "kt"].includes(ext)) {
    return (
      <svg className="icon icon-code" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="1.5" width="12" height="13" rx="1.5" fill="#313244" stroke="#cba6f7" strokeWidth="0.8" />
        <path d="M5 6l-2 2 2 2M11 6l2 2-2 2M8.5 5l-1 6" stroke="#cba6f7" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  // 画像系
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(ext)) {
    return (
      <svg className="icon icon-image" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="1.5" fill="#313244" stroke="#a6e3a1" strokeWidth="0.8" />
        <circle cx="5.5" cy="5.5" r="1.2" fill="#a6e3a1" />
        <path d="M2.5 11l3-3.5 2.5 3 2-2.5 3.5 3" stroke="#a6e3a1" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // マークダウン / テキスト系
  if (["md", "txt", "rst", "log"].includes(ext)) {
    return (
      <svg className="icon icon-text" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="1.5" width="12" height="13" rx="1.5" fill="#313244" stroke="#f9e2af" strokeWidth="0.8" />
        <line x1="4.5" y1="5" x2="11.5" y2="5" stroke="#f9e2af" strokeWidth="1" strokeLinecap="round" />
        <line x1="4.5" y1="7.5" x2="11.5" y2="7.5" stroke="#f9e2af" strokeWidth="1" strokeLinecap="round" />
        <line x1="4.5" y1="10" x2="8.5" y2="10" stroke="#f9e2af" strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  }

  // JSON / 設定系
  if (["json", "toml", "yaml", "yml", "xml", "ini", "env"].includes(ext)) {
    return (
      <svg className="icon icon-config" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="1.5" width="12" height="13" rx="1.5" fill="#313244" stroke="#fab387" strokeWidth="0.8" />
        <path d="M5 5.5h1.5M5 8h4M5 10.5h2.5" stroke="#fab387" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M8.5 5.5l1.5 1.5-1.5 1.5" stroke="#fab387" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // デフォルトファイル
  return (
    <svg className="icon icon-file" viewBox="0 0 16 16" fill="none">
      <path d="M3 2a1 1 0 011-1h6l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V2z" fill="#313244" stroke="#a6adc8" strokeWidth="0.8" />
      <path d="M9 1v3h3" stroke="#a6adc8" strokeWidth="0.8" />
      <line x1="5" y1="7" x2="11" y2="7" stroke="#a6adc8" strokeWidth="0.9" strokeLinecap="round" />
      <line x1="5" y1="9.5" x2="11" y2="9.5" stroke="#a6adc8" strokeWidth="0.9" strokeLinecap="round" />
      <line x1="5" y1="12" x2="8" y2="12" stroke="#a6adc8" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}
