"use client";

import { AudioLines } from "lucide-react";
import { JoinMeetingForm } from "./join-meeting-form";
import { MeetingsBrowser } from "./meetings-browser";
import type { MeetingListItem } from "./meeting-list";
import styles from "./meetings.module.css";

export function MeetingsWorkspace({
  meetings,
  categories,
  recallAccounts,
  defaultRecallAccount,
}: {
  meetings: MeetingListItem[];
  categories: { id: string; name: string }[];
  recallAccounts: string[];
  defaultRecallAccount: string;
}) {
  function focusCapture() {
    const input = document.getElementById("meeting-url");
    input?.scrollIntoView({ block: "center", behavior: "auto" });
    input?.focus({ preventScroll: true });
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>YOUR CONVERSATIONS, TOGETHER</span>
          <h1>
            Meetings<span>.</span>
          </h1>
          <p>A little less remembering. A little more being there.</p>
        </div>
      </header>
      <section className={styles.capture} aria-labelledby="capture-title">
        <div className={styles.captureIntro}>
          <span className={styles.captureIcon}>
            <AudioLines size={24} strokeWidth={1.5} />
          </span>
          <div>
            <h2 id="capture-title">Bring Rika along.</h2>
            <p>Paste a call link. Be part of the conversation.</p>
          </div>
        </div>
        <JoinMeetingForm
          workspace
          recallAccounts={recallAccounts}
          defaultRecallAccount={defaultRecallAccount}
        />
      </section>
      <MeetingsBrowser
        meetings={meetings}
        categories={categories}
        onNewMeeting={focusCapture}
      />
    </div>
  );
}
