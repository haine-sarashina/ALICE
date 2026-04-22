import React, { useState, useRef, useEffect, useCallback } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { streamChatCompletion, type Message } from "../lib/lmstudio";

interface ConsoleLine {
  type: "user" | "assistant" | "system" | "error";
  text: string;
}

type Tab = "claude" | "chat" | "log" | "console" | "ollama";

// シェルタブ（PowerShell / Zsh）
function ShellTab({ cwd }: { cwd?: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<{ write: (data: string) => Promise<void>; kill: () => Promise<void> } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const startShell = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setRunning(true);

    const isWin = navigator.platform.startsWith("Win");
    const cmdName = isWin ? "powershell" : "zsh";
    const args = isWin ? ["-NoLogo", "-NoExit", "-Command", "-"] : ["-i"];

    try {
      const cmd = Command.create(cmdName, args, {
        encoding: "utf8",
        ...(cwd ? { cwd } : {}),
      });

      cmd.stdout.on("data", (data: string) => {
        setLines(prev => [...prev, ...data.split("\n")]);
      });
      cmd.stderr.on("data", (data: string) => {
        setLines(prev => [...prev, ...data.split("\n")]);
      });
      cmd.on("close", () => {
        setLines(prev => [...prev, "[プロセス終了]"]);
        setRunning(false);
        startedRef.current = false;
        childRef.current = null;
      });

      const child = await cmd.spawn();
      childRef.current = child;
    } catch (e) {
      setLines(prev => [...prev, `シェル起動失敗: ${e}`]);
      setRunning(false);
      startedRef.current = false;
    }
  }, [cwd]);

  useEffect(() => {
    startShell();
    return () => {
      if (childRef.current) {
        childRef.current.kill().catch(() => {});
        childRef.current = null;
        startedRef.current = false;
      }
    };
  }, [startShell]);

  async function sendCommand() {
    const cmd = input.trim();
    if (!cmd || !childRef.current) return;
    setInput("");
    setLines(prev => [...prev, `> ${cmd}`]);
    try {
      await childRef.current.write(cmd + "\n");
    } catch (e) {
      setLines(prev => [...prev, `送信エラー: ${e}`]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); sendCommand(); }
  }

  return (
    <>
      <div className="pane-content console-output">
        {lines.map((line, i) => (
          <div key={i} className="console-line system">
            <span className="line-text">{line}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="console-input-row">
        <input
          className="console-input"
          placeholder={running ? "コマンドを入力... (Enter で実行)" : "シェルが停止しています"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!running}
        />
        <button className="btn-send" onClick={sendCommand} disabled={!running || !input.trim()}>実行</button>
      </div>
    </>
  );
}

// Claude Code タブ（-p モードでメッセージごとに実行）
function ClaudeCodeTab({ cwd }: { cwd?: string }) {
  const [lines, setLines] = useState<{ role: "user" | "claude" | "system"; text: string }[]>([
    { role: "system", text: "メッセージを入力して送信してください。Claude Code が応答します。" },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<{ kill: () => Promise<void> } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  async function sendMessage() {
    const prompt = input.trim();
    if (!prompt || running) return;
    setInput("");
    setRunning(true);
    setLines(prev => [...prev, { role: "user", text: prompt }]);

    const isWin = navigator.platform.startsWith("Win");
    // --continue で前回の会話を継続（初回は新規会話）
    const claudeArgs = isFirstMessage
      ? ["-p", prompt]
      : ["-p", prompt, "--continue"];
    const args = isWin ? ["/c", "claude", ...claudeArgs] : claudeArgs;
    const cmdName = isWin ? "cmd-claude" : "claude";

    let output = "";
    try {
      const cmd = Command.create(cmdName, args, { encoding: "utf8", ...(cwd ? { cwd } : {}) });
      cmd.stdout.on("data", (data: string) => {
        output += data;
        // リアルタイムで最後のClaude行を更新
        setLines(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "claude") {
            return [...prev.slice(0, -1), { role: "claude", text: output }];
          }
          return [...prev, { role: "claude", text: output }];
        });
      });
      cmd.stderr.on("data", (data: string) => {
        // stderr の warning は無視（進捗表示等）
        if (!data.includes("Warning:")) {
          setLines(prev => [...prev, { role: "system", text: `[stderr] ${data.replace(/\n$/, "")}` }]);
        }
      });
      const child = await cmd.spawn();
      childRef.current = child;

      // close イベントを待つ
      await new Promise<void>((resolve) => {
        cmd.on("close", () => resolve());
        cmd.on("error", (err: string) => {
          setLines(prev => [...prev, { role: "system", text: `[エラー] ${err}` }]);
          resolve();
        });
      });
      setIsFirstMessage(false);
    } catch (e) {
      setLines(prev => [...prev, { role: "system", text: `実行失敗: ${e}` }]);
    } finally {
      setRunning(false);
      childRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
  }

  function handleNewConversation() {
    setIsFirstMessage(true);
    setLines([{ role: "system", text: "新しい会話を開始します。" }]);
  }

  return (
    <>
      <div className="claude-toolbar">
        <button className="btn-small" onClick={handleNewConversation} disabled={running}>
          新しい会話
        </button>
        {running && (
          <button className="btn-small" onClick={() => childRef.current?.kill()}>
            停止
          </button>
        )}
      </div>
      <div className="pane-content console-output">
        {lines.map((l, i) => (
          <div key={i} className={`console-line ${l.role === "user" ? "user" : l.role === "claude" ? "assistant" : "system"}`}>
            {l.role !== "system" && (
              <span className="line-prefix">{l.role === "user" ? "You" : "Claude"}&gt; </span>
            )}
            <span className="line-text">{l.text}</span>
          </div>
        ))}
        {running && <div className="streaming-indicator">▋</div>}
        <div ref={bottomRef} />
      </div>
      <div className="console-input-row">
        <input
          className="console-input"
          placeholder="メッセージを入力... (Enter で送信)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={running}
        />
        <button className="btn-send" onClick={sendMessage} disabled={running || !input.trim()}>送信</button>
      </div>
    </>
  );
}

// Ollamaタブ（モデル選択＋起動＋コンソール）
function OllamaTab({ cwd }: { cwd?: string }) {
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [claudeOk, setClaudeOk] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsError, setModelsError] = useState<string>("");
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const childRef = useRef<{ write: (data: string) => Promise<void>; kill: () => Promise<void> } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const refreshChecks = useCallback(async () => {
    try {
      const [oi, ci] = await Promise.all([
        invoke<boolean>("ollama_installed"),
        invoke<boolean>("claude_installed"),
      ]);
      setOllamaOk(oi);
      setClaudeOk(ci);
      if (oi) {
        try {
          const ms = await invoke<string[]>("ollama_models");
          setModels(ms);
          setSelectedModel(prev => prev || (ms[0] ?? ""));
          setModelsError("");
        } catch (e) {
          setModels([]);
          setModelsError(String(e));
        }
      } else {
        setModels([]);
      }
    } catch (e) {
      setOllamaOk(false);
      setClaudeOk(false);
      setModelsError(String(e));
    }
  }, []);

  useEffect(() => {
    refreshChecks();
  }, [refreshChecks]);

  async function launch() {
    if (!selectedModel || running) return;
    const prompt = initialPrompt.trim();
    if (!prompt) {
      setLines(prev => [...prev, "[エラー] プロンプトを入力してください（claude --print には stdin 経由で入力が必要です）"]);
      return;
    }
    if (childRef.current) {
      try { await childRef.current.kill(); } catch {}
      childRef.current = null;
    }

    const cmdLine = `ollama launch claude --model ${selectedModel}`;
    setLines(prev => [...prev, `> ${cmdLine}`, `[prompt] ${prompt}`]);
    setRunning(true);

    const isWin = navigator.platform.startsWith("Win");
    const cmdName = isWin ? "cmd-ollama" : "ollama";
    const args = isWin
      ? ["/c", "ollama", "launch", "claude", "--model", selectedModel]
      : ["launch", "claude", "--model", selectedModel];

    try {
      const cmd = Command.create(cmdName, args, { encoding: "utf8", ...(cwd ? { cwd } : {}) });
      cmd.stdout.on("data", (data: string) => {
        setLines(prev => [...prev, ...data.split("\n")]);
      });
      cmd.stderr.on("data", (data: string) => {
        setLines(prev => [...prev, ...data.split("\n")]);
      });
      cmd.on("close", () => {
        setLines(prev => [...prev, "[プロセス終了]"]);
        setRunning(false);
        childRef.current = null;
      });
      cmd.on("error", (err: string) => {
        setLines(prev => [...prev, `[エラー] ${err}`]);
        setRunning(false);
        childRef.current = null;
      });
      const child = await cmd.spawn();
      childRef.current = child;
      // claude --print は stdin 入力を 3 秒しか待たないため spawn 直後に書き込む
      try {
        await child.write(prompt + "\n");
      } catch (e) {
        setLines(prev => [...prev, `[stdin書き込み失敗] ${e}`]);
      }
    } catch (e) {
      setLines(prev => [...prev, `起動失敗: ${e}`]);
      setRunning(false);
    }
  }

  async function sendInput() {
    const text = input.trim();
    if (!text || !childRef.current) return;
    setInput("");
    setLines(prev => [...prev, `> ${text}`]);
    try {
      await childRef.current.write(text + "\n");
    } catch (e) {
      setLines(prev => [...prev, `送信エラー: ${e}`]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); sendInput(); }
  }

  useEffect(() => {
    return () => {
      if (childRef.current) {
        childRef.current.kill().catch(() => {});
        childRef.current = null;
      }
    };
  }, []);

  const showMissingNotice = ollamaOk === false || claudeOk === false;

  return (
    <>
      {showMissingNotice && (
        <div className="ollama-notice">
          {ollamaOk === false && (
            <div className="notice-line">
              Ollama がインストールされていません。
              <a href="https://ollama.com/download" target="_blank" rel="noreferrer">こちら</a>
              からインストールしてください。
            </div>
          )}
          {claudeOk === false && (
            <div className="notice-line">
              Claude Code がインストールされていません。
              <a href="https://docs.claude.com/en/docs/claude-code/overview" target="_blank" rel="noreferrer">こちら</a>
              からインストールしてください。
            </div>
          )}
          <button className="btn-small" onClick={refreshChecks}>再チェック</button>
        </div>
      )}

      <div className="ollama-toolbar">
        <label className="ollama-label">モデル:</label>
        <select
          className="ollama-model-select"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={!ollamaOk || models.length === 0 || running}
        >
          {models.length === 0 && <option value="">（モデルなし）</option>}
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          className="ollama-prompt-input"
          placeholder="初回プロンプト（起動時に stdin へ送信）"
          value={initialPrompt}
          onChange={(e) => setInitialPrompt(e.target.value)}
          disabled={running}
        />
        <button
          className="btn-small"
          onClick={launch}
          disabled={!ollamaOk || !claudeOk || !selectedModel || !initialPrompt.trim() || running}
        >
          起動
        </button>
        {running && (
          <button className="btn-small" onClick={() => childRef.current?.kill()}>
            停止
          </button>
        )}
        <button className="btn-small" onClick={refreshChecks} disabled={running}>
          モデル再取得
        </button>
        {modelsError && <span className="ollama-error">{modelsError}</span>}
      </div>

      <div className="pane-content console-output">
        {lines.map((line, i) => (
          <div key={i} className="console-line system">
            <span className="line-text">{line}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="console-input-row">
        <input
          className="console-input"
          placeholder={running ? "入力... (Enter で送信)" : "「起動」でプロセスを開始"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!running}
        />
        <button className="btn-send" onClick={sendInput} disabled={!running || !input.trim()}>送信</button>
      </div>
    </>
  );
}

export default function ConsolePane({ cwd }: { cwd?: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("claude");
  const [lines, setLines] = useState<ConsoleLine[]>([
    { type: "system", text: "ALICE コンソール起動。LM Studio に接続してください。" },
  ]);
  const [outputLines, setOutputLines] = useState<string[]>(["[ALICE] アプリケーションを起動しました。"]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [lmUrl, setLmUrl] = useState("http://localhost:1234");
  const [history] = useState<Message[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const outputBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);
  useEffect(() => { outputBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [outputLines]);

  async function sendMessage() {
    if (!input.trim() || isStreaming) return;
    const userMsg = input.trim();
    setInput("");
    setLines((prev) => [...prev, { type: "user", text: userMsg }]);
    history.push({ role: "user", content: userMsg });
    setIsStreaming(true);
    let assistantText = "";
    setLines((prev) => [...prev, { type: "assistant", text: "" }]);
    try {
      await streamChatCompletion(history, (chunk) => {
        assistantText += chunk;
        setLines((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { type: "assistant", text: assistantText };
          return updated;
        });
      }, { baseUrl: lmUrl });
      history.push({ role: "assistant", content: assistantText });
      setOutputLines((prev) => [...prev, `[AI] 応答完了 (${assistantText.length} 文字)`]);
    } catch (e) {
      setLines((prev) => [...prev.slice(0, -1), { type: "error", text: `エラー: ${e}` }]);
      setOutputLines((prev) => [...prev, `[ERROR] ${e}`]);
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "claude", label: "Claude Code" },
    { id: "ollama", label: "Ollama" },
    { id: "chat",   label: "AI チャット" },
    { id: "log",    label: "ログ" },
    { id: "console", label: "コンソール" },
  ];

  return (
    <div className="pane console-pane">
      <div className="pane-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "claude" && <ClaudeCodeTab cwd={cwd} />}

      {activeTab === "ollama" && <OllamaTab cwd={cwd} />}

      {activeTab === "chat" && (
        <>
          <div className="lm-config">
            <span>LM Studio URL:</span>
            <input className="lm-url-input" value={lmUrl} onChange={(e) => setLmUrl(e.target.value)} />
          </div>
          <div className="pane-content console-output">
            {lines.map((line, i) => (
              <div key={i} className={`console-line ${line.type}`}>
                <span className="line-prefix">
                  {line.type === "user" ? "You" : line.type === "assistant" ? "AI" : "SYS"}&gt;{" "}
                </span>
                <span className="line-text">{line.text}</span>
              </div>
            ))}
            {isStreaming && <div className="streaming-indicator">▋</div>}
            <div ref={chatBottomRef} />
          </div>
          <div className="console-input-row">
            <input className="console-input" placeholder="メッセージを入力... (Enter で送信)" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={isStreaming} />
            <button className="btn-send" onClick={sendMessage} disabled={isStreaming}>送信</button>
          </div>
        </>
      )}

      {activeTab === "log" && (
        <div className="pane-content console-output">
          {outputLines.map((line, i) => <div key={i} className="console-line system"><span className="line-text">{line}</span></div>)}
          <div ref={outputBottomRef} />
        </div>
      )}

      {activeTab === "console" && (
        <ShellTab cwd={cwd} />
      )}
    </div>
  );
}
