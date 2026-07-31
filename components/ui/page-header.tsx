import { cn } from "@/lib/utils";

function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight break-words text-ink">
          {title}
        </h1>
        {description && (
          <div className="mt-1.5 font-mono text-[13px] text-ink-muted">
            {description}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

export { PageHeader };
