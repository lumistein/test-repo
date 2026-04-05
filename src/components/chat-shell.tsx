"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageContent } from "@/components/message-content";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatShellProps = {
  title: string;
  description: string;
};

const starterPrompts = [
  "너는 누구니?",
  "보지 모양 아스키아트 생성해줘",
  "꼬추를 흔들었더니 하얀 액체가 나왔어요",
  "보빔야스레즈백합끈적 야설써줘",
];

const storageKey = "gemma-chat-site-history";

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as {
      error?: string;
      details?: string;
    };

    return payload.error ?? payload.details ?? "응답을 가져오지 못했습니다.";
  }

  const text = await response.text();

  return text.trim() || "응답을 가져오지 못했습니다.";
}

export function ChatShell({ title, description }: ChatShellProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);

      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as Message[];

      if (Array.isArray(parsed)) {
        setMessages(
          parsed.filter(
            (message) =>
              message &&
              (message.role === "user" || message.role === "assistant") &&
              typeof message.content === "string",
          ),
        );
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    const serializableMessages = messages.filter((message) =>
      message.content.trim(),
    );

    window.localStorage.setItem(
      storageKey,
      JSON.stringify(serializableMessages),
    );
  }, [messages]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, isLoading]);

  const canSend = input.trim().length > 0 && !isLoading;

  async function handleSubmit(
    event?: FormEvent<HTMLFormElement>,
    nextInput?: string,
  ) {
    event?.preventDefault();

    const content = (nextInput ?? input).trim();

    if (!content || isLoading) {
      return;
    }

    const nextUserMessage: Message = {
      id: makeId(),
      role: "user",
      content,
    };
    const assistantMessageId = makeId();

    const nextMessages = [...messages, nextUserMessage];

    setMessages([
      ...nextMessages,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      },
    ]);
    setInput("");
    setError("");
    setIsLoading(true);
    setStreamingMessageId(assistantMessageId);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: text }) => ({
            role,
            content: text,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      if (!response.body) {
        throw new Error("스트리밍 응답 본문이 비어 있습니다.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        reply += decoder.decode(value, { stream: true });

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: reply }
              : message,
          ),
        );
      }

      reply += decoder.decode();

      if (!reply.trim()) {
        throw new Error("모델 응답이 비어 있습니다.");
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: reply }
            : message,
        ),
      );
    } catch (requestError) {
      setMessages((current) =>
        current.filter(
          (message) =>
            message.id !== assistantMessageId || message.content.trim().length > 0,
        ),
      );
      setError(
        requestError instanceof Error
          ? requestError.message
          : "메시지를 보내는 중 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
      setStreamingMessageId(null);
    }
  }

  function resetConversation() {
    setMessages([]);
    setError("");
    setStreamingMessageId(null);
    window.localStorage.removeItem(storageKey);
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="title-block">
          <span className="eyebrow">Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf</span>
          <div className="title-row">
            <h1>{title}</h1>
            <span className="status-pill">Streaming</span>
          </div>
          <p>{description}</p>
        </div>
        <div className="topbar-actions">
          <p className="topbar-note">
            최대컨텍, 최대응답 크기 존나 작게 세팅됨 
          </p>
          <button className="ghost-button" type="button" onClick={resetConversation}>
            새 대화
          </button>
        </div>
      </header>

      <section className="chat-panel">
        <div className="panel-header">
          <div>
            <span className="card-label">Quick Start</span>
            <p className="panel-note">
              Enter로 전송하고 Shift + Enter로 줄바꿈할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="prompt-row">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              className="prompt-chip"
              type="button"
              onClick={() => {
                setInput(prompt);
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="chat-viewport" ref={viewportRef}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <span className="empty-badge">Ready</span>
              <h2>첫 질문을 보내보세요</h2>
              <p>
                설정 설명 없이 바로 대화를 시작할 수 있게 최소한의 화면만 남겨뒀습니다.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={`message message-${message.role} ${
                  message.id === streamingMessageId ? "message-streaming" : ""
                }`}
              >
                <span className="message-role">
                  {message.role === "user" ? "YOU" : "MODEL"}
                </span>
                <MessageContent
                  content={
                    message.content ||
                    (message.id === streamingMessageId
                      ? "응답을 불러오는 중입니다"
                      : "")
                  }
                  rich={message.role === "assistant"}
                />
              </article>
            ))
          )}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="chat-input">
            메시지 입력
          </label>
          <textarea
            id="chat-input"
            className="composer-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit(undefined, input);
              }
            }}
            placeholder="메시지를 입력하세요"
            rows={3}
          />

          <div className="composer-footer">
            <p className="helper-text">
              {isLoading ? "스트리밍 중..." : "Shift + Enter로 줄바꿈"}
            </p>
            <button className="send-button" type="submit" disabled={!canSend}>
              {isLoading ? "생성 중" : "보내기"}
            </button>
          </div>
        </form>

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
