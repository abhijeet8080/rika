"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CalendarDays, Check, ChevronRight, Plus, Settings2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AutoRecordToggle } from "./auto-record-toggle";
import { CalendarEventsList } from "./calendar-events-list";
import styles from "./calendar-workspace.module.css";

export interface CalendarAccount {
  id: string;
  provider: string;
  email: string | null;
  autoRecord: boolean;
  status: string;
  cleanupError: string | null;
}

export function CalendarWorkspace({ connections, outlookEnabled = false }: { connections: CalendarAccount[]; outlookEnabled?: boolean }) {
  const router = useRouter();
  const activeCount = connections.filter((account) => account.status === "connected").length;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    if (!connections.some((account) => account.status === "disconnecting")) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [connections, router]);
  async function disconnect(id: string) {
    setBusyId(id); setError(null);
    try {
      const response = await fetch("/api/calendar/connections/" + id, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not disconnect calendar");
      setConfirmId(null); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not reach the server"); }
    finally { setBusyId(null); }
  }
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
              {error && <p role="alert" className={styles.error}>{error}</p>}
              <div className={styles.accounts}>
                {connections.length === 0 && <p className={styles.noAccounts}>Connect an account to bring your upcoming meetings into Rika.</p>}
                {connections.map((account) => (
                  <section key={account.id} className={styles.account}>
                    <div className={styles.accountHeading}><span className={styles.providerMark}><CalendarDays size={20} /></span><div><h3>{account.provider === "google" ? "Google Calendar" : "Outlook Calendar"}</h3><p>{account.email ?? "Connected account"}</p></div><span className={styles.connected}><Check size={12} />{account.status === "connected" ? "Connected" : account.status === "disconnecting" ? "Disconnecting…" : "Disconnected"}</span></div>
                    {account.status === "connected" && <div className={styles.autoRecord}>
                      <AutoRecordToggle connectionIds={[account.id]} initialValue={autoRecordValues[account.id] ?? account.autoRecord} label={`Auto-record meetings for ${account.email ?? "connected account"}`} onUpdated={(value) => { setAutoRecordValues((values) => ({ ...values, [account.id]: value })); setRefreshKey((key) => key + 1); }} />
                      <p>Automatically schedule Rika for meetings with a call link. Turning this off keeps recordings you have already scheduled.</p>
                    </div>}
                    {account.cleanupError && <p role="alert" className={styles.error}>{account.cleanupError}</p>}
                    {account.status === "disconnecting" ? <button type="button" className={styles.addAccount} disabled={busyId !== null} onClick={() => disconnect(account.id)}>{busyId === account.id ? "Retrying…" : "Retry disconnect"}</button> : account.status !== "connected" ? <a className={styles.addAccount} href={"/api/calendar/" + (account.provider === "google" ? "google" : "outlook") + "/connect?connectionId=" + account.id}>Reconnect calendar</a> : confirmId === account.id ? <div className={styles.autoRecord}><p>Disconnect this calendar? Future linked recordings will be unscheduled. Completed meetings will stay in Rika.</p><button type="button" className={styles.addAccount} disabled={busyId !== null} onClick={() => disconnect(account.id)}>Confirm disconnect</button><button type="button" className={styles.addAccount} onClick={() => setConfirmId(null)}>Keep connected</button></div> : <button type="button" className={styles.addAccount} onClick={() => setConfirmId(account.id)}>Disconnect calendar</button>}
                  </section>
                ))}
              </div>
              <a href="/api/calendar/google/connect" className={styles.addAccount}><Plus size={16} />{connections.length ? "Add Google Calendar account" : "Connect Google Calendar"}</a>
              {outlookEnabled && <a href="/api/calendar/outlook/connect" className={styles.addAccount}><Plus size={16} />Connect Outlook Calendar</a>}
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </header>
      {activeCount === 0 && (
        <section className={styles.connectCard}>
          <div className={styles.connectCopy}><span className={styles.connectMark}><CalendarDays size={30} strokeWidth={1.5} /></span><p className={styles.eyebrow}>MEETINGS, WITHOUT THE EXTRA STEP</p><h2>Be there. Rika will remember.</h2><p>Connect Google Calendar to see your upcoming calls and choose the meetings you want Rika to join.</p><a href="/api/calendar/google/connect">Connect Google Calendar<ChevronRight size={16} /></a><small>Choose what to record. Enable automatic scheduling whenever you’re ready.</small></div>
          <div className={styles.connectSteps}><span>HOW IT WORKS</span>{[
            ["01", "Connect your calendar", "Bring your upcoming invitations into one place."],
            ["02", "Choose your meetings", "Schedule Rika for a call or turn on auto-record."],
            ["03", "Come back to clarity", "Find the recording, transcript, and notes in Meetings."],
          ].map(([number, title, detail]) => <div key={number}><i>{number}</i><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div>
        </section>
      )}
      <CalendarEventsList key={connections.map((account) => account.id + ":" + account.status).join(",")} hasConnections={activeCount > 0} refreshKey={refreshKey} connectionCount={activeCount} />
    </div>
  );
}
