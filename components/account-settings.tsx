"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RETENTION_OPTIONS } from "@/lib/lifecycle/policy";

export function AccountSettings({ retentionDays, pending }: {
  retentionDays: number | null; pending: { id: string; title: string | null; error: string | null }[];
}) {
  const router = useRouter();
  const [retention, setRetention] = useState(String(retentionDays ?? "forever"));
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function send(url: string, method: string, body?: unknown) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save this change");
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Could not reach the server"); return false; }
    finally { setBusy(false); }
  }
  const button = "rounded-lg border border-line px-4 py-2 text-sm font-medium disabled:opacity-50";
  return <div className="max-w-2xl space-y-6">
    <div><p className="section-label mb-2">YOUR DATA</p><h1 className="text-3xl font-semibold text-ink">Account settings</h1><p className="mt-2 text-sm text-ink-muted">Choose how long Rika keeps your conversations.</p></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-moss">{message}</p>}
    <section className="rounded-2xl border border-line bg-white p-6">
      <h2 className="text-lg font-semibold">Meeting retention</h2>
      <p className="mt-2 text-sm text-ink-muted">Automatically delete completed meetings, recordings, transcripts, notes, and chat history after this period. Existing completed meetings older than the selected period will be queued for deletion when you save.</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="retention">Keep completed meetings for</label>
      <select id="retention" value={retention} onChange={(event) => setRetention(event.target.value)} className="my-3 rounded-lg border border-line bg-white p-2">
        <option value="forever">Keep forever</option>
        {RETENTION_OPTIONS.map((days) => <option key={days} value={days}>{days} days</option>)}
      </select>
      <p className="mb-4 text-xs text-ink-muted">Cleanup runs daily. New recordings also expire at the provider. A longer period cannot restore deleted data or extend an existing recording’s provider expiry.</p>
      <button type="button" disabled={busy} className={button} onClick={async () => {
        if (await send("/api/account", "PATCH", { retentionDays: retention === "forever" ? null : Number(retention) })) { setMessage("Retention saved. Eligible meetings will be removed."); router.refresh(); }
      }}>{busy ? "Saving…" : "Save retention"}</button>
    </section>
    {pending.length > 0 && <section className="rounded-2xl border border-line bg-white p-6">
      <h2 className="text-lg font-semibold">Pending deletions</h2><p className="mt-2 text-sm text-ink-muted">Meetings are hidden immediately. Recording and data cleanup is retried automatically each day.</p>
      <ul className="mt-4 space-y-4">{pending.map((meeting) => <li key={meeting.id}><p className="text-sm font-medium">{meeting.title ?? "Untitled meeting"}</p><p className="my-1 text-xs text-ink-muted">{meeting.error ?? "Cleanup queued"}</p>
        <button type="button" disabled={busy} className={button} onClick={async () => { if (await send("/api/meetings/" + meeting.id, "DELETE")) { setMessage("Cleanup retry queued."); router.refresh(); } }}>Retry cleanup</button></li>)}</ul>
      <button type="button" className={"mt-4 " + button} onClick={() => router.refresh()}>Refresh status</button>
    </section>}
    <section className="rounded-2xl border border-red-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-red-700">Delete account</h2>
      <p className="mt-2 text-sm text-ink-muted">Permanently delete your sign-in account, disconnect calendars, stop Rika’s scheduled or active bots, and remove all meeting recordings and application data. This cannot be undone. Cleanup may continue after you are signed out.</p>
      <label htmlFor="delete-confirmation" className="mt-4 block text-sm">Type DELETE to confirm</label>
      <input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="my-3 block rounded-lg border border-line p-2" />
      <button type="button" className={button + " text-red-700"} disabled={busy || confirmation !== "DELETE"} onClick={async () => {
        if (await send("/api/account", "DELETE", { confirmation })) router.replace("/account-deletion");
      }}>{busy ? "Requesting deletion…" : "Permanently delete account"}</button>
    </section>
  </div>;
}
