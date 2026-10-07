"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, AudioLines, CheckCheck, Compass, ListChecks, Sparkles, Square, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { parseMeetingCitation } from "@/lib/meeting-citations";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import styles from "./chat-workspace.module.css";

const markdownComponents = {
  p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
  ul: ({ ...props }) => (
    <ul className="mb-2 list-disc space-y-0.5 pl-4 last:mb-0" {...props} />
  ),
  ol: ({ ...props }) => (
    <ol className="mb-2 list-decimal space-y-0.5 pl-4 last:mb-0" {...props} />
  ),
  li: ({ ...props }) => <li {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
  code: ({ ...props }) => (
    <code
      className="rounded bg-ink/8 px-1 py-0.5 font-mono text-[12.5px]"
      {...props}
    />
  ),
  pre: ({ ...props }) => (
    <pre
      className="mb-2 overflow-x-auto rounded-lg bg-ink/8 p-2.5 text-[12.5px] last:mb-0"
      {...props}
    />
  ),
  table: ({ ...props }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="border-collapse text-[13px]" {...props} />
    </div>
  ),
  th: ({ ...props }) => (
    <th
      className="border border-line px-2 py-1 text-left font-semibold"
      {...props}
    />
  ),
  td: ({ ...props }) => (
    <td className="border border-line px-2 py-1" {...props} />
  ),
} satisfies React.ComponentProps<typeof ReactMarkdown>["components"];

// The transport is only built once, on mount — if the scope needs to
// change (e.g. the user picks a different category), remount this
// component with a `key` that changes rather than expecting props here to
// update it live.
export function ChatPanel({
  meetingId,
  categoryId,
  suggestions,
  onCitation,
  variant = "compact",
  scopeName,
  meetingCount = 0,
  visible = true,
}: {
  variant?: "compact" | "workspace";
  scopeName?: string;
  meetingCount?: number;
  visible?: boolean;
  meetingId?: string;
  categoryId?: string;
  onCitation?: (chunkId: string) => void;
  /** Clickable prompts shown on an empty thread — clicking sends one. */
  suggestions?: string[];
}) {
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { meetingId, categoryId },
      }),
  );
  const { messages, sendMessage, status, stop } = useChat({ transport });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const isWorkspace = variant === "workspace";
  const noContext = isWorkspace && meetingCount === 0;
  const isBusy = status !== "ready" && status !== "error";

  // Keep the newest message / streaming tokens / typing dots in view.
  useEffect(() => {
    const container = messagesRef.current;
    if (container && visible) container.scrollTop = container.scrollHeight;
  }, [messages, status, visible]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isBusy || noContext) return;
    sendMessage({ text: input });
    setInput("");
  }

  const placeholder = meetingId
    ? "Ask about this meeting…"
    : "Ask across these meetings…";

  return (
    <div className={isWorkspace ? styles.chat : "flex h-full min-h-0 flex-col gap-4"}>
      <div
        ref={messagesRef}
        className={isWorkspace ? styles.messages : "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"}
      >
        {messages.length === 0 && isWorkspace ? (
          <div className={styles.welcome}>
            <span className={styles.welcomeMark}><AudioLines size={32} strokeWidth={1.5} /></span>
            <p className={styles.eyebrow}>A LITTLE MORE CLARITY</p>
            <h2>{noContext ? "Your meeting memory starts here." : "What would you like to know?"}</h2>
            <p>{noContext ? `Add meetings to ${scopeName} to give Rika the context for your questions.` : "Connect the dots across your conversations. Decisions, follow-ups, and the details you need — all in one place."}</p>
            {noContext ? <Link href="/meetings" className={styles.browse}>Browse meetings →</Link> : (
              <div className={styles.prompts}>
                {[
                  { title: "Catch me up", detail: "Get the bigger picture", prompt: "Summarize the most recent call", icon: Compass },
                  { title: "Track follow-ups", detail: "See what needs attention", prompt: "What action items are still open?", icon: ListChecks },
                  { title: "Find decisions", detail: "Know where things stand", prompt: "What decisions have we made recently?", icon: CheckCheck },
                ].map(({ title, detail, prompt, icon: Icon }) => (
                  <button type="button" key={title} disabled={isBusy} onClick={() => sendMessage({ text: prompt })}>
                    <Icon size={19} strokeWidth={1.6} /><strong>{title}</strong><span>{detail}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-0 flex-col">
            <EmptyState
              icon={<Sparkles className="h-4 w-4" strokeWidth={1.75} />}
              className="h-full min-h-[160px] border-0 bg-transparent py-8"
            >
              {meetingId
                ? "Ask what was decided, who owns a follow-up, or what someone said."
                : "Ask across this category — decisions, open action items, who said what."}
            </EmptyState>
            {suggestions && suggestions.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={isBusy}
                    onClick={() => sendMessage({ text: suggestion })}
                    className="rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-[13px] text-ink-muted transition-colors hover:border-ink/30 hover:bg-white hover:text-ink disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <ul className={isWorkspace ? styles.messageList : "flex flex-col gap-3 pb-1"}>
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={`${isWorkspace ? styles.messageRow : ""} flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={isWorkspace ? (message.role === "user" ? styles.userMessage : styles.answer) : `max-w-[88%] px-4 py-2.5 text-[14px] leading-relaxed ${
                      message.role === "user"
                        ? "rounded-2xl rounded-br-md bg-ink text-paper whitespace-pre-wrap"
                        : "rounded-2xl rounded-bl-md border border-line bg-white/70 text-ink"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <p className={isWorkspace ? styles.answerLabel : "mb-1.5 font-mono text-[10px] tracking-wider text-ink-muted uppercase"}>
                        {isWorkspace && <AudioLines size={16} />} Rika
                      </p>
                    )}
                    {message.parts.map((part, i) =>
                      part.type !== "text" ? null : message.role ===
                        "assistant" ? (
                        <ReactMarkdown
                          key={i}
                          remarkPlugins={[remarkGfm]}
                          components={{
                            ...markdownComponents,
                            a: ({ href, children }) => {
                              const citation = parseMeetingCitation(href);
                              if (
                                citation &&
                                citation.meetingId === meetingId &&
                                onCitation
                              ) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => onCitation(citation.chunkId)}
                                    className="inline rounded-md bg-moss/10 px-1.5 text-moss underline-offset-2 hover:underline"
                                    aria-label={`Play cited excerpt ${String(children)}`}
                                  >
                                    {children}
                                  </button>
                                );
                              }
                              if (href?.startsWith("/")) {
                                return (
                                  <Link
                                    href={href}
                                    className={isWorkspace && citation ? styles.sourceLink : "text-moss underline underline-offset-2 hover:no-underline"}
                                    aria-label={citation ? `Open meeting source ${String(children)}` : undefined}
                                  >
                                    {children}
                                  </Link>
                                );
                              }
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline underline-offset-2 hover:no-underline"
                                >
                                  {children}
                                </a>
                              );
                            },
                          }}
                        >
                          {part.text}
                        </ReactMarkdown>
                      ) : (
                        <span key={i}>{part.text}</span>
                      ),
                    )}
                  </div>
                </li>
              ))}
              {status === "submitted" && (
                <li className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-white/70 px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-moss [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-moss [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-moss" />
                  </div>
                </li>
              )}
            </ul>
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {status === "error" && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 rounded-xl border border-rec/25 bg-rec/8 px-3.5 py-2.5 text-[13px] text-rec"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          Something went wrong — check your connection and try again.
        </div>
      )}

      {isWorkspace ? (
        <div className={styles.composerArea}>
          <form onSubmit={handleSubmit} className={styles.composer}>
            <textarea value={input} rows={2} onChange={(e) => setInput(e.target.value)}
              placeholder={noContext ? "Add meetings to this category to start…" : "Ask a question about your meetings…"}
              aria-label="Ask a question about your meetings" disabled={noContext}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!isBusy) e.currentTarget.form?.requestSubmit();
                }
              }} />
            <div className={styles.composerBottom}>
              <span><AudioLines size={13} strokeWidth={1.6} />{scopeName}</span>
              {isBusy ? <button type="button" aria-label="Stop response" onClick={() => stop()}><Square size={14} fill="currentColor" /></button>
                : <button type="submit" aria-label="Send" disabled={!input.trim() || noContext}><ArrowUp size={19} /></button>}
            </div>
          </form>
          <p className={styles.composerHint}>Answers draw from this category’s meetings. Follow source links to check the details.</p>
        </div>
      ) : (
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-white/80 p-1.5 shadow-[0_1px_0_rgb(21_23_29_/_0.04)]"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isBusy}
          placeholder={placeholder}
          aria-label={placeholder}
          className="flex-1 border-0 bg-transparent shadow-none focus:border-transparent"
        />
        <button
          type="submit"
          disabled={isBusy || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
          aria-label="Send"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2} />
        </button>
      </form>
      )}

    </div>
  );
}
