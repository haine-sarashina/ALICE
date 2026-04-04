use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::Manager;

// ─── アプリ設定 ───

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    editor: EditorSettings,
    widgets: WidgetSettings,
    #[serde(default)]
    files: FileSettings,
    #[serde(default)]
    last_open_dir: Option<String>,
    #[serde(default)]
    recent_dirs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EditorSettings {
    auto_save: bool,
    font_size: u32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WidgetItem {
    id: String,
    visible: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSettings {
    items: Vec<WidgetItem>,
    #[serde(default)]
    photo_folder: Option<String>,
    #[serde(default = "default_photo_interval")]
    photo_interval: u32,
    #[serde(default)]
    news_keywords: Vec<String>,
    #[serde(default = "default_news_interval")]
    news_interval: u32,
}

fn default_photo_interval() -> u32 { 10 }
fn default_news_interval() -> u32 { 30 }

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileSettings {
    #[serde(default)]
    show_hidden: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            editor: EditorSettings {
                auto_save: false,
                font_size: 13,
            },
            widgets: WidgetSettings {
                items: vec![
                    WidgetItem { id: "clock".into(), visible: true },
                    WidgetItem { id: "calendar".into(), visible: true },
                    WidgetItem { id: "weather".into(), visible: true },
                    WidgetItem { id: "photo".into(), visible: true },
                    WidgetItem { id: "news".into(), visible: true },
                    WidgetItem { id: "systemMonitor".into(), visible: true },
                    WidgetItem { id: "claudeCode".into(), visible: true },
                    WidgetItem { id: "battery".into(), visible: true },
                    WidgetItem { id: "info".into(), visible: true },
                ],
                photo_folder: None,
                photo_interval: 10,
                news_keywords: Vec::new(),
                news_interval: 30,
            },
            files: FileSettings::default(),
            last_open_dir: None,
            recent_dirs: Vec::new(),
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    Ok(config_dir.join("settings.json"))
}

fn state_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    Ok(config_dir.join("app-state.json"))
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;
    if path.exists() {
        let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        let default = AppSettings::default();
        let json = serde_json::to_string_pretty(&default).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        Ok(default)
    }
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// ─── アプリ状態の保存・復元 ───

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CursorPos {
    start: u32,
    end: u32,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppWindowState {
    #[serde(default)]
    window_x: Option<i32>,
    #[serde(default)]
    window_y: Option<i32>,
    #[serde(default)]
    window_width: Option<u32>,
    #[serde(default)]
    window_height: Option<u32>,
    #[serde(default)]
    left_width: Option<u32>,
    #[serde(default)]
    right_width: Option<u32>,
    #[serde(default)]
    console_height: Option<u32>,
    #[serde(default)]
    expanded_dirs: Vec<String>,
    #[serde(default)]
    open_files: Vec<String>,
    #[serde(default)]
    active_file: Option<String>,
    #[serde(default)]
    cursor_positions: HashMap<String, CursorPos>,
    #[serde(default)]
    dir_tab_states: HashMap<String, DirTabState>,
    #[serde(default)]
    is_maximized: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DirTabState {
    #[serde(default)]
    open_files: Vec<String>,
    #[serde(default)]
    active_file: Option<String>,
}

#[tauri::command]
fn load_app_state(app: tauri::AppHandle) -> Result<AppWindowState, String> {
    let path = state_path(&app)?;
    if path.exists() {
        let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        Ok(AppWindowState::default())
    }
}

#[tauri::command]
fn save_app_state(app: tauri::AppHandle, state: AppWindowState) -> Result<(), String> {
    let path = state_path(&app)?;
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// ─── 設定ウィンドウ ───

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── ファイル・システム ───

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileItem {
    name: String,
    path: String,
    is_dir: bool,
    accessible: bool,
}

#[tauri::command]
fn list_directory(path: &str, show_hidden: Option<bool>) -> Result<Vec<FileItem>, String> {
    let show_hidden = show_hidden.unwrap_or(false);
    let entries = fs::read_dir(path).map_err(|e| format!("アクセスが拒否されました: {}", e))?;
    let mut items: Vec<FileItem> = entries
        .filter_map(|e| e.ok())
        .filter(|entry| {
            if show_hidden { return true; }
            let name = entry.file_name().to_string_lossy().to_string();
            // 隠しファイル: ドット始まり
            if name.starts_with('.') { return false; }
            // Windows: hidden attribute
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::fs::MetadataExt;
                if let Ok(meta) = entry.metadata() {
                    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
                    if meta.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0 {
                        return false;
                    }
                }
            }
            true
        })
        .map(|entry| {
            let p = entry.path();
            let is_dir = entry
                .file_type()
                .map(|ft| {
                    if ft.is_dir() {
                        true
                    } else if ft.is_symlink() {
                        p.is_dir()
                    } else {
                        false
                    }
                })
                .unwrap_or_else(|_| p.is_dir());
            let accessible = if is_dir {
                fs::read_dir(&p).is_ok()
            } else {
                true
            };
            FileItem {
                name: entry.file_name().to_string_lossy().to_string(),
                path: p.to_string_lossy().to_string(),
                is_dir,
                accessible,
            }
        })
        .collect();
    items.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(items)
}

#[tauri::command]
fn read_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: &str, content: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_directory(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

// ─── Grep 検索 ───

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GrepMatch {
    path: String,
    line_number: usize,
    line: String,
}

#[tauri::command]
fn grep_files(dir: &str, query: &str) -> Result<Vec<GrepMatch>, String> {
    if query.is_empty() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();
    let query_lower = query.to_lowercase();
    grep_recursive(Path::new(dir), &query_lower, &mut results);
    // 最大500件
    results.truncate(500);
    Ok(results)
}

fn grep_recursive(dir: &Path, query: &str, results: &mut Vec<GrepMatch>) {
    use std::io::{BufRead, BufReader};

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.filter_map(|e| e.ok()) {
        if results.len() >= 500 {
            return;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // 隠しファイル・ディレクトリをスキップ
        if name.starts_with('.') {
            continue;
        }
        // node_modules, target 等をスキップ
        if name == "node_modules" || name == "target" || name == "dist" || name == ".git" {
            continue;
        }

        if path.is_dir() {
            grep_recursive(&path, query, results);
        } else {
            // バイナリファイルをスキップ（拡張子で判断）
            let ext = path.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            let binary_exts = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "avif",
                              "ico", "exe", "dll", "so", "dylib", "zip", "tar", "gz",
                              "7z", "rar", "pdf", "woff", "woff2", "ttf", "eot",
                              "mp3", "mp4", "avi", "mov", "wav", "ogg", "flac",
                              "lock"];
            if binary_exts.contains(&ext.as_str()) {
                continue;
            }

            if let Ok(file) = std::fs::File::open(&path) {
                let reader = BufReader::new(file);
                for (i, line) in reader.lines().enumerate() {
                    if results.len() >= 500 {
                        return;
                    }
                    if let Ok(line) = line {
                        if line.to_lowercase().contains(query) {
                            results.push(GrepMatch {
                                path: path.to_string_lossy().to_string(),
                                line_number: i + 1,
                                line: if line.len() > 500 { format!("{}...", &line[..500]) } else { line },
                            });
                        }
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn list_directories_only(path: &str) -> Result<Vec<FileItem>, String> {
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut dirs: Vec<FileItem> = entries
        .filter_map(|e| e.ok())
        .filter(|entry| {
            let ft = entry.file_type().ok();
            let is_dir = ft.map(|f| f.is_dir()).unwrap_or(false);
            if !is_dir { return false; }
            let name = entry.file_name().to_string_lossy().to_string();
            // 隠しフォルダ・特殊フォルダをスキップ
            !name.starts_with('.') && name != "node_modules" && name != "target" && name != "dist"
        })
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path().to_string_lossy().to_string();
            FileItem {
                name,
                path,
                is_dir: true,
                accessible: entry.path().read_dir().is_ok(),
            }
        })
        .collect();
    dirs.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(dirs)
}

// ─── 写真ウィジェット ───

#[tauri::command]
fn list_photos(dir: &str) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    let exts = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "avif"];
    let mut photos: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|entry| {
            if let Some(ext) = entry.path().extension() {
                exts.contains(&ext.to_string_lossy().to_lowercase().as_str())
            } else {
                false
            }
        })
        .map(|entry| entry.path().to_string_lossy().to_string())
        .collect();
    photos.sort();
    Ok(photos)
}

#[tauri::command]
fn read_file_base64(path: &str) -> Result<String, String> {
    use base64::Engine;
    let data = fs::read(path).map_err(|e| e.to_string())?;
    let ext = Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// ─── ニュースウィジェット ───

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    title: String,
    url: String,
    #[serde(skip)]
    pub_date: String,
}

#[tauri::command]
fn fetch_news(keywords: Vec<String>) -> Result<Vec<NewsItem>, String> {
    if keywords.is_empty() {
        return Ok(Vec::new());
    }

    // 各キーワードを個別に検索して結果をマージ
    let mut all_items: Vec<NewsItem> = Vec::new();
    for keyword in &keywords {
        let encoded = keyword.replace(' ', "+");
        let url = format!(
            "https://news.google.com/rss/search?q={}&hl=ja&gl=JP&ceid=JP:ja",
            encoded
        );
        if let Ok(body) = ureq::get(&url)
            .call()
            .and_then(|r| r.into_string().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e).into()))
        {
            let items = parse_rss_items(&body);
            all_items.extend(items);
        }
    }

    // 重複除去（URL基準）
    let mut seen = std::collections::HashSet::new();
    all_items.retain(|item| seen.insert(item.url.clone()));

    // pubDateでソート（降順＝最新順）
    all_items.sort_by(|a, b| b.pub_date.cmp(&a.pub_date));

    // 最新5件
    all_items.truncate(5);

    Ok(all_items)
}

fn parse_rss_items(body: &str) -> Vec<NewsItem> {
    let mut items = Vec::new();
    let mut pos = 0;
    while let Some(item_start) = body[pos..].find("<item>") {
        let abs_start = pos + item_start;
        if let Some(item_end) = body[abs_start..].find("</item>") {
            let item_xml = &body[abs_start..abs_start + item_end + 7];
            let title = extract_tag(item_xml, "title").unwrap_or_default();
            let link = extract_tag(item_xml, "link").unwrap_or_default();
            let pub_date = extract_tag(item_xml, "pubDate").unwrap_or_default();
            if !title.is_empty() && !link.is_empty() {
                items.push(NewsItem { title, url: link, pub_date });
            }
            pos = abs_start + item_end + 7;
        } else {
            break;
        }
        if items.len() >= 10 { break; } // 各キーワードから最大10件取得
    }
    items
}

fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let content = &xml[start..end];
    // CDATA 対応
    let content = content.strip_prefix("<![CDATA[").unwrap_or(content);
    let content = content.strip_suffix("]]>").unwrap_or(content);
    Some(decode_html_entities(content))
}

fn decode_html_entities(s: &str) -> String {
    let mut result = s.to_string();
    result = result.replace("&amp;", "&");
    result = result.replace("&lt;", "<");
    result = result.replace("&gt;", ">");
    result = result.replace("&quot;", "\"");
    result = result.replace("&apos;", "'");
    result = result.replace("&#39;", "'");
    // 数値文字参照 &#NNN; のデコード
    while let Some(start) = result.find("&#") {
        if let Some(end) = result[start..].find(';') {
            let num_str = &result[start + 2..start + end];
            let ch = if let Some(hex) = num_str.strip_prefix('x') {
                u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
            } else {
                num_str.parse::<u32>().ok().and_then(char::from_u32)
            };
            if let Some(c) = ch {
                result = format!("{}{}{}", &result[..start], c, &result[start + end + 1..]);
            } else {
                break;
            }
        } else {
            break;
        }
    }
    result
}

// ─── Claude Code 使用状況 ───

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeUsageInfo {
    logged_in: bool,
    auth_method: Option<String>,
    email: Option<String>,
    org_name: Option<String>,
    subscription_type: Option<String>,
    error: Option<String>,
}

#[tauri::command]
fn get_claude_usage() -> Result<ClaudeUsageInfo, String> {
    // claude auth status は JSON を返す
    let output = silent_command("claude")
        .args(["auth", "status"])
        .output()
        .map_err(|e| format!("claude コマンドの実行に失敗: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // JSON パース
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
        Ok(ClaudeUsageInfo {
            logged_in: val.get("loggedIn").and_then(|v| v.as_bool()).unwrap_or(false),
            auth_method: val.get("authMethod").and_then(|v| v.as_str()).map(|s| s.to_string()),
            email: val.get("email").and_then(|v| v.as_str()).map(|s| s.to_string()),
            org_name: val.get("orgName").and_then(|v| v.as_str()).map(|s| s.to_string()),
            subscription_type: val.get("subscriptionType").and_then(|v| v.as_str()).map(|s| s.to_string()),
            error: None,
        })
    } else {
        Ok(ClaudeUsageInfo {
            logged_in: false,
            auth_method: None,
            email: None,
            org_name: None,
            subscription_type: None,
            error: Some(stdout.trim().to_string()),
        })
    }
}

// ─── LM Studio チャットプロキシ ───

#[tauri::command]
fn lm_chat(url: String, body: String) -> Result<String, String> {
    let resp = ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_bytes(body.as_bytes())
        .map_err(|e| e.to_string())?;
    resp.into_string().map_err(|e| e.to_string())
}

// ─── システムモニター ───

struct SystemState(Mutex<System>);

// GPU/NPU のキャッシュ（バックグラウンドスレッドが定期更新）
struct GpuCacheData {
    usage: Option<f32>,
    temp: Option<f32>,
    vram_used_mb: Option<u64>,
    vram_total_mb: Option<u64>,
    name: Option<String>,
    npu_usage: Option<f32>,
}

struct GpuCache(Arc<Mutex<GpuCacheData>>);

#[derive(Clone, PartialEq)]
enum GpuVendor { Unknown, Nvidia, Amd, None }

const GPU_POLL_SECS: u64 = 10;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    cpu_usage: f32,
    memory_used_mb: u64,
    memory_total_mb: u64,
    memory_usage: f32,
    cpu_temp: Option<f32>,
    gpu_usage: Option<f32>,
    gpu_temp: Option<f32>,
    vram_used_mb: Option<u64>,
    vram_total_mb: Option<u64>,
    gpu_name: Option<String>,
    npu_usage: Option<f32>,
}

/// バックグラウンドスレッドで GPU/NPU を定期取得（メインスレッドをブロックしない）
fn spawn_gpu_poller(cache: Arc<Mutex<GpuCacheData>>) {
    std::thread::Builder::new()
        .name("gpu-poller".into())
        .spawn(move || {
            let mut vendor = GpuVendor::Unknown;
            let mut vendor_detected = false;
            loop {
                let gpu = fetch_gpu_stats(&vendor, vendor_detected);
                if !vendor_detected {
                    vendor = if gpu.name.as_deref().map_or(false, |n| n.to_lowercase().contains("nvidia")) {
                        GpuVendor::Nvidia
                    } else if gpu.name.is_some() {
                        GpuVendor::Amd
                    } else {
                        GpuVendor::None
                    };
                    vendor_detected = true;
                }
                {
                    let mut c = cache.lock().unwrap();
                    c.usage = gpu.usage;
                    c.temp = gpu.temp;
                    c.vram_used_mb = gpu.vram_used_mb;
                    c.vram_total_mb = gpu.vram_total_mb;
                    c.name = gpu.name;
                    c.npu_usage = gpu.npu_usage;
                }
                std::thread::sleep(std::time::Duration::from_secs(GPU_POLL_SECS));
            }
        })
        .expect("failed to spawn gpu-poller thread");
}

#[tauri::command]
fn get_system_stats(
    system_state: tauri::State<'_, SystemState>,
    gpu_cache: tauri::State<'_, GpuCache>,
) -> SystemStats {
    let mut sys = system_state.0.lock().unwrap();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu_usage = sys.global_cpu_usage();
    let memory_used_mb = sys.used_memory() / 1024 / 1024;
    let memory_total_mb = sys.total_memory() / 1024 / 1024;
    let memory_usage = if memory_total_mb > 0 {
        memory_used_mb as f32 / memory_total_mb as f32 * 100.0
    } else {
        0.0
    };
    drop(sys);

    let components = sysinfo::Components::new_with_refreshed_list();
    let cpu_temp = components
        .iter()
        .find(|c| {
            let label = c.label().to_lowercase();
            label.contains("cpu") || label.contains("package") || label.contains("tdie")
        })
        .and_then(|c| c.temperature());

    // GPU/NPU: バックグラウンドスレッドが更新したキャッシュを読むだけ
    let gpu = gpu_cache.0.lock().unwrap();

    SystemStats {
        cpu_usage,
        memory_used_mb,
        memory_total_mb,
        memory_usage,
        cpu_temp,
        gpu_usage: gpu.usage,
        gpu_temp: gpu.temp,
        vram_used_mb: gpu.vram_used_mb,
        vram_total_mb: gpu.vram_total_mb,
        gpu_name: gpu.name.clone(),
        npu_usage: gpu.npu_usage,
    }
}

// ─── バッテリー ───

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatteryInfo {
    present: bool,
    percent: f32,
    is_charging: bool,
    time_remaining_minutes: Option<u32>,
}

#[tauri::command]
fn get_battery_info() -> BatteryInfo {
    let absent = BatteryInfo { present: false, percent: 0.0, is_charging: false, time_remaining_minutes: None };

    let ps = r#"
$b = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue
if ($null -eq $b) { Write-Output "none"; exit }
$pct = [int]$b.EstimatedChargeRemaining
$status = [int]$b.BatteryStatus
$isCharging = ($status -eq 6 -or $status -eq 7 -or $status -eq 8 -or $status -eq 9 -or $status -eq 10)
$runtime = [int]$b.EstimatedRunTime
if ($null -eq $b.EstimatedRunTime -or $runtime -le 0 -or $runtime -ge 71582788) { $runtime = -1 }
Write-Output "$pct|$isCharging|$runtime"
"#;

    let output = match silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ps])
        .output() {
        Ok(o) => o,
        Err(_) => return absent,
    };

    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s == "none" || s.is_empty() {
        return absent;
    }
    let parts: Vec<&str> = s.split('|').collect();
    if parts.len() < 3 {
        return absent;
    }
    let percent = parts[0].trim().parse::<f32>().unwrap_or(0.0);
    let is_charging = parts[1].trim().to_lowercase() == "true";
    let runtime = parts[2].trim().parse::<i64>().unwrap_or(-1);
    let time_remaining_minutes = if runtime > 0 { Some(runtime as u32) } else { None };

    BatteryInfo { present: true, percent, is_charging, time_remaining_minutes }
}

struct GpuStats {
    usage: Option<f32>,
    temp: Option<f32>,
    vram_used_mb: Option<u64>,
    vram_total_mb: Option<u64>,
    name: Option<String>,
    npu_usage: Option<f32>,
}

/// コンソールウィンドウを表示しない Command を作成
fn silent_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

fn fetch_gpu_stats(vendor: &GpuVendor, detected: bool) -> GpuStats {
    let empty = GpuStats { usage: None, temp: None, vram_used_mb: None, vram_total_mb: None, name: None, npu_usage: None };

    if detected {
        match vendor {
            GpuVendor::Nvidia => try_nvidia_gpu().unwrap_or(empty),
            GpuVendor::Amd => try_amd_gpu().unwrap_or(empty),
            _ => empty,
        }
    } else {
        if let Some(stats) = try_nvidia_gpu() {
            return stats;
        }
        if let Some(stats) = try_amd_gpu() {
            return stats;
        }
        empty
    }
}

fn try_nvidia_gpu() -> Option<GpuStats> {
    let output = silent_command("nvidia-smi")
        .args([
            "--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total,name",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;

    if !output.status.success() { return None; }
    let s = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = s.trim().split(',').collect();
    if parts.len() >= 4 {
        Some(GpuStats {
            usage: parts[0].trim().parse().ok(),
            temp: parts[1].trim().parse().ok(),
            vram_used_mb: parts[2].trim().parse().ok(),
            vram_total_mb: parts[3].trim().parse().ok(),
            name: parts.get(4).map(|s| s.trim().to_string()),
            npu_usage: None,
        })
    } else {
        None
    }
}

fn try_amd_gpu() -> Option<GpuStats> {
    // GPU + NPU を1回の PowerShell 呼び出しで取得（Get-Counter は1回だけ）
    let ps_script = r#"
$gpu = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'AMD|Radeon' } | Select-Object -First 1
if (-not $gpu) { exit 1 }
$name = $gpu.Name

# VRAM 容量: レジストリの qwMemorySize (64bit) を優先
$vramTotal = 0
try {
    $regPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
    Get-ChildItem $regPath -ErrorAction Stop | ForEach-Object {
        $desc = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc
        if ($desc -match 'AMD|Radeon') {
            $qw = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).'HardwareInformation.qwMemorySize'
            if ($qw -and $qw -gt 0) { $vramTotal = [math]::Round($qw / 1MB) }
        }
    }
} catch {}
if ($vramTotal -eq 0) { $vramTotal = [math]::Round($gpu.AdapterRAM / 1MB) }

$usage = -1; $vramUsed = -1; $npuUsage = -1

# 全カウンターを1回の Get-Counter で取得（PowerShell 呼び出しコスト最小化）
try {
    $counters = Get-Counter '\GPU Engine(*)\Utilization Percentage','\GPU Process Memory(*)\Dedicated Usage' -ErrorAction Stop
    $samples = $counters.CounterSamples
    $s3d = $samples | Where-Object { $_.Path -match 'engtype_3D' -and $_.CookedValue -gt 0 }
    $usage = if ($s3d) { ($s3d | Measure-Object -Property CookedValue -Sum).Sum } else { 0 }
    $sNpu = $samples | Where-Object { $_.Path -match 'engtype_NPU|engtype_Compute' -and $_.CookedValue -gt 0 }
    if ($sNpu) { $npuUsage = ($sNpu | Measure-Object -Property CookedValue -Sum).Sum }
    $sMem = $samples | Where-Object { $_.Path -match 'GPU Process Memory' -and $_.CookedValue -gt 0 }
    if ($sMem) { $vramUsed = [math]::Round(($sMem | Measure-Object -Property CookedValue -Sum).Sum / 1MB) }
} catch {}

Write-Output "$name|-1|$usage|$vramUsed|$vramTotal|$npuUsage"
"#;

    let output = silent_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .output()
        .ok()?;

    if !output.status.success() { return None; }
    let s = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = s.trim().split('|').collect();
    if parts.len() >= 5 {
        let name = parts[0].trim().to_string();
        let temp = parts[1].trim().parse::<f32>().ok().filter(|v| *v >= 0.0);
        let usage = parts[2].trim().parse::<f32>().ok().filter(|v| *v >= 0.0);
        let vram_used = parts[3].trim().parse::<i64>().ok().filter(|v| *v >= 0).map(|v| v as u64);
        let vram_total = parts[4].trim().parse::<u64>().ok().filter(|v| *v > 0);
        let npu_usage = parts.get(5).and_then(|s| s.trim().parse::<f32>().ok()).filter(|v| *v >= 0.0);

        Some(GpuStats {
            usage,
            temp,
            vram_used_mb: vram_used,
            vram_total_mb: vram_total,
            name: Some(name),
            npu_usage,
        })
    } else {
        None
    }
}

// ─── Git 連携 ───

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusItem {
    status: String,  // "M", "A", "D", "?", "R" etc.
    path: String,
    staged: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    is_repo: bool,
    branch: String,
    items: Vec<GitStatusItem>,
}

/// git porcelain のクォートされたパスをデコード（日本語ファイル名の8進数エスケープ対応）
fn unquote_git_path(s: &str) -> String {
    let s = s.trim();
    if s.starts_with('"') && s.ends_with('"') {
        let inner = &s[1..s.len() - 1];
        let mut result = Vec::new();
        let bytes = inner.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'\\' && i + 3 < bytes.len() {
                // 8進数エスケープ \NNN
                if bytes[i + 1].is_ascii_digit() {
                    let oct = &inner[i + 1..i + 4];
                    if let Ok(val) = u8::from_str_radix(oct, 8) {
                        result.push(val);
                        i += 4;
                        continue;
                    }
                }
                // その他のエスケープ
                match bytes[i + 1] {
                    b'\\' => { result.push(b'\\'); i += 2; }
                    b'n' => { result.push(b'\n'); i += 2; }
                    b't' => { result.push(b'\t'); i += 2; }
                    b'"' => { result.push(b'"'); i += 2; }
                    _ => { result.push(bytes[i]); i += 1; }
                }
            } else {
                result.push(bytes[i]);
                i += 1;
            }
        }
        String::from_utf8(result).unwrap_or_else(|_| s.to_string())
    } else {
        s.to_string()
    }
}

#[tauri::command]
fn git_status(cwd: &str) -> Result<GitInfo, String> {
    use std::process::Command;

    // git rev-parse でリポジトリかチェック
    let check = Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    if !check.status.success() {
        return Ok(GitInfo { is_repo: false, branch: String::new(), items: Vec::new() });
    }

    // ブランチ名
    let branch_out = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    let branch = String::from_utf8_lossy(&branch_out.stdout).trim().to_string();

    // git status --porcelain=v1
    let status_out = Command::new("git")
        .args(["status", "--porcelain=v1"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    let status_str = String::from_utf8_lossy(&status_out.stdout);

    let mut items = Vec::new();
    for line in status_str.lines() {
        if line.len() < 4 { continue; }
        let index_status = &line[0..1];
        let worktree_status = &line[1..2];
        let file_path = unquote_git_path(&line[3..]);

        // ステージ済み
        if index_status != " " && index_status != "?" {
            items.push(GitStatusItem {
                status: index_status.to_string(),
                path: file_path.clone(),
                staged: true,
            });
        }
        // 未ステージ / Untracked
        if worktree_status != " " || index_status == "?" {
            let st = if index_status == "?" { "?".to_string() } else { worktree_status.to_string() };
            // ステージ済み+未ステージの両方がある場合は重複しないよう確認
            if index_status != " " && index_status != "?" && worktree_status != " " {
                items.push(GitStatusItem {
                    status: st,
                    path: file_path,
                    staged: false,
                });
            } else if index_status == " " || index_status == "?" {
                items.push(GitStatusItem {
                    status: st,
                    path: file_path,
                    staged: false,
                });
            }
        }
    }

    Ok(GitInfo { is_repo: true, branch, items })
}

#[tauri::command]
fn git_stage(cwd: &str, path: &str) -> Result<(), String> {
    use std::process::Command;
    let out = Command::new("git")
        .args(["add", "--", path])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn git_unstage(cwd: &str, path: &str) -> Result<(), String> {
    use std::process::Command;
    let out = Command::new("git")
        .args(["reset", "HEAD", "--", path])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn git_commit(cwd: &str, message: &str) -> Result<String, String> {
    use std::process::Command;
    let out = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[tauri::command]
fn git_diff(cwd: &str, path: &str, staged: bool) -> Result<String, String> {
    use std::process::Command;
    let mut args = vec!["diff"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(path);
    let out = Command::new("git")
        .args(&args)
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[tauri::command]
fn git_push(cwd: &str) -> Result<String, String> {
    use std::process::Command;
    let out = Command::new("git")
        .args(["push"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    // git push は成功時もstderrに情報を出力することがある
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

#[tauri::command]
fn git_has_unpushed(cwd: &str) -> Result<bool, String> {
    use std::process::Command;
    let out = Command::new("git")
        .args(["log", "@{u}..HEAD", "--oneline"])
        .current_dir(cwd)
        .output();
    match out {
        Ok(output) => {
            if output.status.success() {
                let log = String::from_utf8_lossy(&output.stdout).trim().to_string();
                Ok(!log.is_empty())
            } else {
                // アップストリームが未設定の場合はpush可能とみなす
                Ok(true)
            }
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn git_has_remote(cwd: &str) -> Result<bool, String> {
    use std::process::Command;
    let out = Command::new("git")
        .args(["remote"])
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;
    let remotes = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok(!remotes.is_empty())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    // GPU/NPU データ収集用バックグラウンドスレッドを起動
    let gpu_cache_data = Arc::new(Mutex::new(GpuCacheData {
        usage: None, temp: None, vram_used_mb: None, vram_total_mb: None, name: None, npu_usage: None,
    }));
    spawn_gpu_poller(Arc::clone(&gpu_cache_data));

    tauri::Builder::default()
        .manage(SystemState(Mutex::new(sys)))
        .manage(GpuCache(gpu_cache_data))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_directory,
            read_file,
            write_file,
            create_directory,
            rename_path,
            delete_path,
            list_photos,
            read_file_base64,
            fetch_news,
            get_system_stats,
            load_settings,
            save_settings,
            load_app_state,
            save_app_state,
            open_settings_window,
            git_status,
            git_stage,
            git_unstage,
            git_commit,
            git_diff,
            git_push,
            git_has_remote,
            git_has_unpushed,
            lm_chat,
            get_claude_usage,
            grep_files,
            list_directories_only,
            get_battery_info,
        ])
        .on_window_event(|window, event| {
            // メインウィンドウが閉じられたらアプリ全体を終了
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
