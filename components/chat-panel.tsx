"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";

// The transport is only built once, on mount — if the scope needs to
// change (e.g. the user picks a different category), remount this
// component with a `key` that changes rather than expecting props here to
// update it live.
export function ChatPanel({
  meetingId,
  categoryId,
  uncategorizedOnly,
}: {
  meetingId?: string;
  categoryId?: string;
  uncategorizedOnly?: boolean;
}) {
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { meetingId, categoryId, uncategorizedOnly },
      }),
  );
  const { messages, sendMessage, status } = useChat({ transport });
  const [input, setInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  }

  const isBusy = status !== "ready" && status !== "error";

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {messages.length === 0 ? (
        <EmptyState>
          {meetingId || categoryId || uncategorizedOnly
            ? "Ask something to get started."
            : "Ask about any of your meetings to get started."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap ${
                  message.role === "user"
                    ? "bg-ink text-paper"
                    : "bg-paper-soft text-ink"
                }`}
              >
                {message.parts.map((part, i) =>
                  part.type === "text" ? <span key={i}>{part.text}</span> : null,
                )}
              </div>
            </li>
          ))}
          {status === "submitted" && (
            <li className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl bg-paper-soft px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted" />
              </div>
            </li>
          )}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isBusy}
          placeholder={
            meetingId
              ? "Ask about this meeting..."
              : categoryId || uncategorizedOnly
                ? "Ask about these meetings..."
                : "Ask about any of your meetings..."
          }
          className="flex-1 rounded-full border border-line bg-card px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-ink/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isBusy || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rec text-white transition-colors hover:bg-rec-dark disabled:opacity-40"
          aria-label="Send"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}
