export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
