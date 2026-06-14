import { describe, it, expect, vi, beforeEach } from "vitest";
import { chatCompletion, streamChatCompletion } from "./lmstudio";
import type { Message } from "./lmstudio";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const messages: Message[] = [{ role: "user", content: "Hello" }];

const mockResponse = (content: string) =>
  JSON.stringify({ choices: [{ message: { content } }] });

describe("chatCompletion", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("returns assistant message content", async () => {
    vi.mocked(invoke).mockResolvedValue(mockResponse("Hi there"));
    const result = await chatCompletion(messages);
    expect(result).toBe("Hi there");
  });

  it("returns empty string when choices is empty", async () => {
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({ choices: [] }));
    const result = await chatCompletion(messages);
    expect(result).toBe("");
  });

  it("passes custom baseUrl and model to invoke", async () => {
    vi.mocked(invoke).mockResolvedValue(mockResponse("ok"));
    await chatCompletion(messages, {
      baseUrl: "http://localhost:5678",
      model: "custom-model",
    });
    const call = vi.mocked(invoke).mock.calls[0];
    const url = (call[1] as { url: string }).url;
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(url).toContain("5678");
    expect(body.model).toBe("custom-model");
  });

  it("uses default config when no config provided", async () => {
    vi.mocked(invoke).mockResolvedValue(mockResponse("ok"));
    await chatCompletion(messages);
    const call = vi.mocked(invoke).mock.calls[0];
    const url = (call[1] as { url: string }).url;
    expect(url).toContain("1234");
  });
});

describe("streamChatCompletion", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("calls onChunk with content", async () => {
    vi.mocked(invoke).mockResolvedValue(mockResponse("streamed content"));
    const chunks: string[] = [];
    await streamChatCompletion(messages, (c) => chunks.push(c));
    expect(chunks).toEqual(["streamed content"]);
  });

  it("does not call onChunk when content is empty", async () => {
    vi.mocked(invoke).mockResolvedValue(
      JSON.stringify({ choices: [{ message: { content: "" } }] })
    );
    const chunks: string[] = [];
    await streamChatCompletion(messages, (c) => chunks.push(c));
    expect(chunks).toEqual([]);
  });

  it("does not call onChunk when choices is empty", async () => {
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({ choices: [] }));
    const chunks: string[] = [];
    await streamChatCompletion(messages, (c) => chunks.push(c));
    expect(chunks).toEqual([]);
  });
});
