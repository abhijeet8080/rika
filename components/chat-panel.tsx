"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";

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

  const placeholder = meetingId
    ? "Ask about this meeting…"
    : categoryId || uncategorizedOnly
      ? "Ask about these meetings…"
      : "Ask about any of your meetings…";

  return (
    <div
      className={`flex flex-col gap-4 ${meetingId ? "h-full min-h-0" : ""}`}
    >
      <div
        className={`min-h-0 flex-1 ${messages.length === 0 ? "" : "overflow-y-auto"}`}
      >
        {messages.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-4 w-4" strokeWidth={1.75} />}
            className={meetingId ? "h-full min-h-[180px] py-10" : "py-14"}
          >
            {meetingId
              ? "Ask what was decided, who owns a follow-up, or what someone said."
              : "Pick a category above, then ask across those meetings."}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3 pb-1">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap ${
                    message.role === "user"
                      ? "rounded-2xl rounded-br-md bg-ink text-paper"
                      : "rounded-2xl rounded-bl-md border border-line bg-white/70 text-ink"
                  }`}
                >
                  {message.role === "assistant" && (
                    <p className="mb-1.5 font-mono text-[10px] tracking-wider text-ink-muted uppercase">
                      Rika
                    </p>
                  )}
                  {message.parts.map((part, i) =>
                    part.type === "text" ? (
                      <span key={i}>{part.text}</span>
                    ) : null,
                  )}
                </div>
              </li>
            ))}
            {status === "submitted" && (
              <li className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-white/70 px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-rec [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-rec [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-rec" />
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-full border border-line bg-white/80 p-1.5 shadow-[0_1px_0_rgb(21_23_29_/_0.04)]"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isBusy}
          placeholder={placeholder}
          className="flex-1 border-0 bg-transparent shadow-none focus:border-transparent"
        />
        <button
          type="submit"
          disabled={isBusy || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rec text-white transition-colors hover:bg-rec-dark disabled:opacity-40"
          aria-label="Send"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}
