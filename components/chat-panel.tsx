"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

export function ChatPanel({ meetingId }: { meetingId?: string }) {
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { meetingId },
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

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {messages.map((message) => (
          <li key={message.id} className="text-sm">
            <span className="font-medium">
              {message.role === "user" ? "You" : "Rika"}:{" "}
            </span>
            {message.parts.map((part, i) =>
              part.type === "text" ? (
                <span key={i} className="whitespace-pre-wrap">
                  {part.text}
                </span>
              ) : null,
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== "ready"}
          placeholder={
            meetingId
              ? "Ask about this meeting..."
              : "Ask about any of your meetings..."
          }
          className="flex-1 rounded border border-black/[.15] bg-transparent px-3 py-2 text-sm dark:border-white/[.2]"
        />
        <button
          type="submit"
          disabled={status !== "ready"}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
