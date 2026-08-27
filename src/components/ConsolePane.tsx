import React, { useState, useRef, useEffect, useCallback } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";


type Tab = "log" | "console" | "ollama";

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

// Ollamaタブ（モデル選択＋起動＋コンソール）
function OllamaTab({ cwd }: { cwd?: string }) {
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
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
      const oi = await invoke<boolean>("ollama_installed");
      setOllamaOk(oi);
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
      setModelsError(String(e));
    }
  }, []);

  useEffect(() => {
    refreshChecks();
  }, [refreshChecks]);

  async function launch() {
    if (!selectedModel || running) return;
    const prompt = initialPrompt.trim();
    if (childRef.current) {
      try { await childRef.current.kill(); } catch {}
      childRef.current = null;
    }

    const cmdLine = `ollama run ${selectedModel}`;
    setLines(prev => [...prev, `> ${cmdLine}`, ...(prompt ? [`[prompt] ${prompt}`] : [])]);
    setRunning(true);

    const isWin = navigator.platform.startsWith("Win");
    const cmdName = isWin ? "cmd-ollama" : "ollama";
    const args = isWin
      ? ["/c", "ollama", "run", selectedModel]
      : ["run", selectedModel];

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
      if (prompt) {
        try {
          await child.write(prompt + "\n");
        } catch (e) {
          setLines(prev => [...prev, `[stdin書き込み失敗] ${e}`]);
        }
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

  const showMissingNotice = ollamaOk === false;

  return (
    <>
      {showMissingNotice && (
        <div className="ollama-notice">
          <div className="notice-line">
            Ollama がインストールされていません。
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer">こちら</a>
            からインストールしてください。
          </div>
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
          placeholder="初回プロンプト（起動時に送信）"
          value={initialPrompt}
          onChange={(e) => setInitialPrompt(e.target.value)}
          disabled={running}
        />
        <button
          className="btn-small"
          onClick={launch}
          disabled={!ollamaOk || !selectedModel || running}
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
  const [activeTab, setActiveTab] = useState<Tab>("ollama");
  const [outputLines] = useState<string[]>(["[ALICE] アプリケーションを起動しました。"]);
  const outputBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { outputBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [outputLines]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "ollama", label: "Ollama" },
    { id: "log",    label: "ログ" },
    { id: "console", label: "コンソール" },
  ];

  return (
    <div className="pane console-pane">
      <div
        className="pane-tabs"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        {tabs.map((t) => (
          <button key={t.id} className={`tab-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "ollama" && <OllamaTab cwd={cwd} />}

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
