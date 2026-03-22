import { invoke } from "@tauri-apps/api/core";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LMStudioConfig {
  baseUrl: string;
  model: string;
}

const DEFAULT_CONFIG: LMStudioConfig = {
  baseUrl: "http://localhost:1234",
  model: "claude-code",
};

export async function chatCompletion(
  messages: Message[],
  config: Partial<LMStudioConfig> = {}
): Promise<string> {
  const { baseUrl, model } = { ...DEFAULT_CONFIG, ...config };
  const url = `${baseUrl}/v1/chat/completions`;
  const body = JSON.stringify({
    model,
    messages,
    temperature: 0.7,
    stream: false,
  });

  const responseText = await invoke<string>("lm_chat", { url, body });
  const data = JSON.parse(responseText);
  return data.choices?.[0]?.message?.content ?? "";
}

export async function streamChatCompletion(
  messages: Message[],
  onChunk: (chunk: string) => void,
  config: Partial<LMStudioConfig> = {}
): Promise<void> {
  const { baseUrl, model } = { ...DEFAULT_CONFIG, ...config };
  const url = `${baseUrl}/v1/chat/completions`;
  const body = JSON.stringify({
    model,
    messages,
    temperature: 0.7,
    stream: false, // Rust経由ではストリーミング不可のため非ストリームで取得
  });

  const responseText = await invoke<string>("lm_chat", { url, body });
  const data = JSON.parse(responseText);
  const content = data.choices?.[0]?.message?.content ?? "";
  if (content) onChunk(content);
}
