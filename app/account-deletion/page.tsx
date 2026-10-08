"use client";

import { SignOutButton, Show } from "@clerk/nextjs";
import { useState } from "react";

export default function AccountDeletionPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return <main className="mx-auto my-20 max-w-lg space-y-5 rounded-2xl border border-line bg-white p-8">
    <h1 className="text-2xl font-semibold">Account deletion requested</h1>
    <p className="text-sm text-ink-muted">Your workspace is closed. Rika will disconnect your calendars and remove recordings and application data. Failed cleanup is retried automatically each day.</p>
    <Show when="signed-in">
      <button type="button" disabled={busy} className="rounded-lg border border-line px-4 py-2" onClick={async () => {
        setBusy(true);
        try {
          const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE" }) });
          setMessage(response.ok ? "Cleanup retry queued." : "Your sign-in account may already have been removed. Saved cleanup will continue.");
        } catch { setMessage("Could not reach the server. Saved cleanup will continue automatically."); }
        finally { setBusy(false); }
      }}>{busy ? "Retrying…" : "Retry account cleanup"}</button>
      <div><SignOutButton redirectUrl="/"><button type="button" className="text-sm underline">Sign out</button></SignOutButton></div>
    </Show>
    {message && <p role="status" className="text-sm">{message}</p>}
  </main>;
}
