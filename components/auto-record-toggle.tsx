"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";

export function AutoRecordToggle({
  connectionIds,
  initialValue,
  onUpdated,
  label = "Auto-record every meeting",
}: {
  connectionIds: string[];
  initialValue: boolean;
  onUpdated?: (value: boolean) => void;
  label?: string;
}) {
  const [checked, setChecked] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setPending(true);
    setMessage(null);

    try {
      const results = await Promise.all(
        connectionIds.map((id) =>
          fetch(`/api/calendar/connections/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ autoRecord: next }),
          }).then(async (res) => ({
            ok: res.ok,
            body: res.ok ? await res.json() : null,
          })),
        ),
      );
      if (results.some((result) => !result.ok)) {
        setMessage("Couldn’t update this setting. Please try again.");
        return;
      }
      setChecked(next);
      if (next) {
        const scheduled = results.reduce((sum, result) => sum + (result.body?.scheduled ?? 0), 0);
        const failed = results.reduce((sum, result) => sum + (result.body?.failed ?? 0), 0);
        setMessage(failed > 0
          ? `Scheduled ${scheduled} meetings. ${failed} couldn’t be scheduled; try scheduling them from the agenda.`
          : scheduled > 0 ? `Scheduled ${scheduled} upcoming meeting${scheduled === 1 ? "" : "s"}.` : "No upcoming meetings to schedule yet.");
      } else {
        setMessage("Automatic scheduling is off.");
      }
      onUpdated?.(next);
    } catch {
      setMessage("Couldn’t reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-ink">Auto-record every meeting</p>
        {message && (
          <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
            {message}
          </p>
        )}
      </div>
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={handleChange}
        disabled={pending || connectionIds.length === 0}
      />
    </div>
  );
}
