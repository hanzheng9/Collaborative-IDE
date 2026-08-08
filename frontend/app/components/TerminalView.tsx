"use client";

import { useRef, useState } from "react";

type TerminalViewProps = {
  files: { fileName: string }[];
  onRunCommand: (command: string) => Promise<string>;
};

const helpText = `Supported Commands

python
python3
node
npx tsx
ls
pwd
clear
help

For more details, click the information icon in the Terminal panel.`;

function getFriendlyUnsupportedMessage(command: string) {
  const trimmedCommand = command.trim();

  if (/^cd(\s|$)/.test(trimmedCommand)) {
    return `Persistent working directories are not currently supported.

See Terminal Capabilities for more information.`;
  }

  if (/^(npm|pnpm|yarn)\s+(install|add)(\s|$)/.test(trimmedCommand)) {
    return `Package installation is not currently supported.

See Terminal Capabilities for supported functionality.`;
  }

  if (/^git(\s|$)/.test(trimmedCommand)) {
    return `Git commands are not currently available in the isolated execution environment.

See Terminal Capabilities for supported functionality.`;
  }

  if (/^(export|env|printenv)(\s|$)/.test(trimmedCommand)) {
    return `Environment variables are not currently available in the terminal.

See Terminal Capabilities for supported functionality.`;
  }

  return `Command not supported.

Type "help" to see supported commands.

For more information, open Terminal Capabilities using the information button.`;
}

function isRunnableCommand(command: string) {
  return /^(python3?|node)\s+\S+/.test(command) || /^npx\s+tsx\s+\S+/.test(command);
}

export function TerminalView({ files, onRunCommand }: TerminalViewProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [lines, setLines] = useState<string[]>([
    'Type "help" to see supported commands.'
  ]);
  const isRunningRef = useRef(false);

  const appendLines = (nextLines: string[]) => {
    setLines((currentLines) => [...currentLines, ...nextLines]);
  };

  const submitCommand = async () => {
    const command = inputValue.trim();

    if (!command || isRunningRef.current) {
      return;
    }

    setInputValue("");
    setHistory((currentHistory) => [...currentHistory, command]);
    setHistoryIndex(null);

    if (command === "clear") {
      setLines([]);
      return;
    }

    appendLines([`$ ${command}`]);

    if (command === "help") {
      appendLines([helpText]);
      return;
    }

    if (command === "pwd") {
      appendLines(["/workspace"]);
      return;
    }

    if (command === "ls") {
      appendLines([files.map((file) => file.fileName).join("\n") || "No files"]);
      return;
    }

    if (!isRunnableCommand(command)) {
      appendLines([getFriendlyUnsupportedMessage(command)]);
      return;
    }

    isRunningRef.current = true;
    appendLines(["Running..."]);

    try {
      appendLines([await onRunCommand(command)]);
    } catch (error) {
      appendLines([
        error instanceof Error ? error.message : "Command execution failed."
      ]);
    } finally {
      isRunningRef.current = false;
    }
  };

  const showPreviousCommand = () => {
    if (history.length === 0) {
      return;
    }

    const nextIndex =
      historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
    setHistoryIndex(nextIndex);
    setInputValue(history[nextIndex] ?? "");
  };

  const showNextCommand = () => {
    if (history.length === 0 || historyIndex === null) {
      return;
    }

    const nextIndex = historyIndex + 1;

    if (nextIndex >= history.length) {
      setHistoryIndex(null);
      setInputValue("");
      return;
    }

    setHistoryIndex(nextIndex);
    setInputValue(history[nextIndex] ?? "");
  };

  return (
    <div className="terminalView">
      <pre className="terminalTranscript" aria-live="polite">
        {lines.join("\n\n")}
      </pre>
      <label className="terminalPrompt">
        <span aria-hidden="true">$</span>
        <input
          aria-label="Terminal command"
          autoComplete="off"
          spellCheck={false}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submitCommand();
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              showPreviousCommand();
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              showNextCommand();
            }
          }}
        />
      </label>
    </div>
  );
}
