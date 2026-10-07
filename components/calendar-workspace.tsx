"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CalendarDays, Check, ChevronRight, Plus, Settings2, X } from "lucide-react";
import { useState } from "react";
import { AutoRecordToggle } from "./auto-record-toggle";
import { CalendarEventsList } from "./calendar-events-list";
import styles from "./calendar-workspace.module.css";

export interface CalendarAccount {
  id: string;
  provider: string;
  email: string | null;
  autoRecord: boolean;
}

export function CalendarWorkspace({ connections }: { connections: CalendarAccount[] }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRecordValues, setAutoRecordValues] = useState<Record<string, boolean>>({});
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>A LITTLE MORE PRESENCE</p><h1>Calendar</h1><p>Your next conversations, taken care of.</p></div>
        <Dialog.Root open={manageOpen} onOpenChange={setManageOpen}>
          <Dialog.Trigger className={styles.manageButton}><Settings2 size={16} />Manage calendars</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className={styles.backdrop} />
            <Dialog.Popup className={styles.dialog}>
              <div className={styles.dialogHeader}>
                <div><Dialog.Title>Manage calendars</Dialog.Title><Dialog.Description>Connected accounts and recording preferences.</Dialog.Description></div>
                <Dialog.Close className={styles.closeButton} aria-label="Close calendar settings"><X size={18} /></Dialog.Close>
              </div>
              <div className={styles.accounts}>
                {connections.length === 0 && <p className={styles.noAccounts}>Connect an account to bring your upcoming meetings into Rika.</p>}
                {connections.map((account) => (
                  <section key={account.id} className={styles.account}>
                    <div className={styles.accountHeading}><span className={styles.providerMark}><CalendarDays size={20} /></span><div><h3>{account.provider === "google" ? "Google Calendar" : "Outlook Calendar"}</h3><p>{account.email ?? "Connected account"}</p></div><span className={styles.connected}><Check size={12} />Connected</span></div>
                    <div className={styles.autoRecord}>
                      <AutoRecordToggle connectionIds={[account.id]} initialValue={autoRecordValues[account.id] ?? account.autoRecord} label={`Auto-record meetings for ${account.email ?? "connected account"}`} onUpdated={(value) => { setAutoRecordValues((values) => ({ ...values, [account.id]: value })); setRefreshKey((key) => key + 1); }} />
                      <p>Automatically schedule Rika for meetings with a call link. Turning this off keeps recordings you have already scheduled.</p>
                    </div>
                  </section>
                ))}
              </div>
              <a href="/api/calendar/google/connect" className={styles.addAccount}><Plus size={16} />{connections.length ? "Add Google Calendar account" : "Connect Google Calendar"}</a>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </header>
      {!connections.length && (
        <section className={styles.connectCard}>
          <div className={styles.connectCopy}><span className={styles.connectMark}><CalendarDays size={30} strokeWidth={1.5} /></span><p className={styles.eyebrow}>MEETINGS, WITHOUT THE EXTRA STEP</p><h2>Be there. Rika will remember.</h2><p>Connect Google Calendar to see your upcoming calls and choose the meetings you want Rika to join.</p><a href="/api/calendar/google/connect">Connect Google Calendar<ChevronRight size={16} /></a><small>Choose what to record. Enable automatic scheduling whenever you’re ready.</small></div>
          <div className={styles.connectSteps}><span>HOW IT WORKS</span>{[
            ["01", "Connect your calendar", "Bring your upcoming invitations into one place."],
            ["02", "Choose your meetings", "Schedule Rika for a call or turn on auto-record."],
            ["03", "Come back to clarity", "Find the recording, transcript, and notes in Meetings."],
          ].map(([number, title, detail]) => <div key={number}><i>{number}</i><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div>
        </section>
      )}
      <CalendarEventsList hasConnections={connections.length > 0} refreshKey={refreshKey} connectionCount={connections.length} />
    </div>
  );
}
