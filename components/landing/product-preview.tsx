"use client";

import { useState, type KeyboardEvent } from "react";
import {
  ArrowUp,
  AudioLines,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Folder,
  MessageSquareText,
  Search,
  Sparkles,
  Video,
} from "lucide-react";
import styles from "./landing.module.css";

const tabs = ["Summary", "Transcript", "Ask Rika"] as const;
type Tab = (typeof tabs)[number];
const transcript = [
  {
    time: "02:14",
    initials: "P",
    name: "Priya",
    text: "So where did we land on the Q3 pricing tiers?",
    tone: "mint",
  },
  {
    time: "02:19",
    initials: "S",
    name: "Sam",
    text: "Three tiers: Starter, Growth, and Enterprise. The model we sketched last week.",
    tone: "blue",
  },
  {
    time: "04:47",
    initials: "P",
    name: "Priya",
    text: "Let's lock the Enterprise tier before Friday. Sam, can you update the pricing page?",
    tone: "mint",
  },
  {
    time: "05:12",
    initials: "S",
    name: "Sam",
    text: "I'll have the pricing page ready by Thursday. Alex can share the launch checklist.",
    tone: "blue",
  },
];
const questions = [
  {
    question: "What did we decide about pricing?",
    answer:
      "The team agreed on three pricing tiers: Starter, Growth, and Enterprise. Priya asked to finalize the Enterprise tier before Friday.",
    time: "04:47",
  },
  {
    question: "What are the next steps?",
    answer:
      "Sam will update the pricing page by Thursday. Alex will share the launch checklist, and the team will finalize the Enterprise tier before Friday.",
    time: "05:12",
  },
];

export function ProductPreview() {
  const [tab, setTab] = useState<Tab>("Summary");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [checked, setChecked] = useState<number[]>([]);
  const [citation, setCitation] = useState<string | null>(null);
  const question = questions[questionIndex];

  function viewCitation(time: string) {
    setCitation(time);
    setTab("Transcript");
  }
  function handleTabKey(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next]);
    document.getElementById(`preview-tab-${next}`)?.focus();
  }

  return (
    <div className={styles.productFrame}>
      <aside className={styles.previewSidebar} aria-label="Sample workspace">
        <div className={styles.previewBrand}>
          <AudioLines size={21} /> rika.
        </div>
        <div className={styles.workspaceName}>
          <span className={styles.workspaceAvatar}>S</span> Studio workspace{" "}
          <ChevronDown size={12} />
        </div>
        <div className={styles.previewSearch}>
          <Search size={13} /> Search meetings <kbd>⌘ K</kbd>
        </div>
        <div className={styles.sidebarItems}>
          <span className={styles.sidebarActive}>
            <Video size={15} /> Meetings <small>12</small>
          </span>
          <span>
            <MessageSquareText size={15} /> Ask Rika
          </span>
          <span>
            <CalendarDays size={15} /> Calendar
          </span>
        </div>
        <p className={styles.sidebarLabel}>YOUR CATEGORIES</p>
        <div className={styles.sidebarItems}>
          <span>
            <Folder size={14} /> Product team
          </span>
          <span>
            <Folder size={14} /> Customer calls
          </span>
          <span>
            <Folder size={14} /> Weekly catch-ups
          </span>
        </div>
        <div className={styles.sidebarBottom}>
          <span className={styles.personAvatar}>JD</span>
          <div>
            Jamie Davis<small>Personal workspace</small>
          </div>
        </div>
      </aside>
      <div className={styles.previewMain}>
        <div className={styles.previewBreadcrumb}>
          Meetings <ChevronRight size={12} /> <span>Product team</span>
          <span className={styles.sampleTag}>SAMPLE MEETING</span>
        </div>
        <div className={styles.previewHeading}>
          <div>
            <div className={styles.meetingTag}>
              <span /> Captured & ready
            </div>
            <h2>Q3 Product Planning</h2>
            <p>
              <CalendarDays size={12} /> Jul 14 <span>·</span>
              <Clock3 size={12} /> 32 min <span>·</span> Google Meet
            </p>
          </div>
          <div
            className={styles.participantAvatars}
            aria-label="Three participants"
          >
            <span>P</span>
            <span>S</span>
            <span>A</span>
          </div>
        </div>
        <div className={styles.previewColumns}>
          <div className={styles.notesColumn}>
            <div
              role="tablist"
              aria-label="Sample meeting views"
              className={styles.previewTabs}
            >
              {tabs.map((item, index) => (
                <button
                  key={item}
                  id={`preview-tab-${index}`}
                  role="tab"
                  aria-selected={tab === item}
                  aria-controls="preview-panel"
                  tabIndex={tab === item ? 0 : -1}
                  className={tab === item ? styles.previewTabActive : undefined}
                  onClick={() => setTab(item)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                >
                  {item === "Ask Rika" && <Sparkles size={12} />}
                  {item}
                </button>
              ))}
            </div>
            <div
              className={styles.previewPanel}
              id="preview-panel"
              role="tabpanel"
              aria-labelledby={`preview-tab-${tabs.indexOf(tab)}`}
              tabIndex={0}
            >
              {tab === "Summary" && (
                <>
                  <div className={styles.summaryTitle}>
                    <Sparkles size={14} /> A meeting, made clear.
                  </div>
                  <p className={styles.summaryText}>
                    The team aligned on the Q3 launch and a simpler pricing
                    model. Three tiers, a clear owner for each next step, and an
                    Enterprise decision to wrap up by Friday.
                  </p>
                  <h3>
                    Key decisions <span>02</span>
                  </h3>
                  <div className={styles.decision}>
                    <span className={styles.checkIcon}>
                      <Check size={12} />
                    </span>
                    <p>
                      Move forward with three pricing tiers
                      <button onClick={() => viewCitation("02:19")}>
                        02:19 ↗
                      </button>
                    </p>
                  </div>
                  <div className={styles.decision}>
                    <span className={styles.checkIcon}>
                      <Check size={12} />
                    </span>
                    <p>
                      Finalize Enterprise pricing before Friday
                      <button onClick={() => viewCitation("04:47")}>
                        04:47 ↗
                      </button>
                    </p>
                  </div>
                  <h3>
                    Action items <span>02</span>
                  </h3>
                  {[
                    {
                      task: "Update the pricing page",
                      name: "Sam",
                      date: "Thursday",
                    },
                    {
                      task: "Share the launch checklist",
                      name: "Alex",
                      date: "Next step",
                    },
                  ].map((item, i) => (
                    <label className={styles.actionItem} key={item.task}>
                      <input
                        type="checkbox"
                        checked={checked.includes(i)}
                        onChange={() =>
                          setChecked(
                            checked.includes(i)
                              ? checked.filter((n) => n !== i)
                              : [...checked, i],
                          )
                        }
                      />
                      <span
                        className={
                          checked.includes(i) ? styles.completedTask : undefined
                        }
                      >
                        {item.task}
                        <small>{item.name}</small>
                      </span>
                      <em>{item.date}</em>
                    </label>
                  ))}
                </>
              )}
              {tab === "Transcript" && (
                <>
                  <div className={styles.summaryTitle}>
                    <AudioLines size={14} /> Every word. Every speaker.
                  </div>
                  <div className={styles.transcriptLines}>
                    {transcript.map((line) => (
                      <div
                        key={line.time}
                        className={`${styles.transcriptLine} ${citation === line.time ? styles.citedLine : ""}`}
                      >
                        <span
                          className={styles.transcriptAvatar}
                          data-tone={line.tone}
                        >
                          {line.initials}
                        </span>
                        <div>
                          <p>
                            <strong>{line.name}</strong>
                            <time>{line.time}</time>
                          </p>
                          <p>{line.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {tab === "Ask Rika" && (
                <>
                  <div className={styles.summaryTitle}>
                    <Sparkles size={14} /> Answers from the conversation.
                  </div>
                  <p className={styles.summaryText}>
                    Choose a sample question to see how Rika answers.
                  </p>
                  <div className={styles.sampleQuestions}>
                    {questions.map((q, i) => (
                      <button
                        aria-pressed={questionIndex === i}
                        key={q.question}
                        onClick={() => setQuestionIndex(i)}
                      >
                        {q.question}
                      </button>
                    ))}
                  </div>
                  <div className={styles.inlineAnswer} aria-live="polite">
                    {question.answer}
                    <button onClick={() => viewCitation(question.time)}>
                      Q3 Product Planning · {question.time} ↗
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <aside
            className={styles.askColumn}
            aria-label="Sample question and answer"
          >
            <div className={styles.askHeader}>
              <span>
                <Sparkles size={14} /> Ask Rika
              </span>
              <span className={styles.askContext}>This meeting</span>
            </div>
            <div className={styles.askMessages}>
              <div className={styles.questionBubble}>{question.question}</div>
              <div className={styles.answerIdentity}>
                <span>
                  <AudioLines size={13} />
                </span>{" "}
                Rika
              </div>
              <p className={styles.answerText} aria-live="polite">
                {question.answer}
              </p>
              <button
                className={styles.citation}
                onClick={() => viewCitation(question.time)}
              >
                <Clock3 size={11} /> Q3 Planning · {question.time}{" "}
                <ArrowUp size={11} />
              </button>
              <div className={styles.answerNote}>
                <Check size={11} /> Linked to what was actually said
              </div>
            </div>
            <button
              className={styles.sampleAskButton}
              onClick={() => {
                setQuestionIndex((questionIndex + 1) % questions.length);
                setTab("Ask Rika");
              }}
            >
              Try another sample question{" "}
              <span>
                <ArrowUp size={14} />
              </span>
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
