"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { useCategories } from "@/lib/hooks/use-categories";

type Scope = { type: "uncategorized" } | { type: "category"; id: string };

function scopeKey(scope: Scope): string {
  if (scope.type === "category") return `category:${scope.id}`;
  return scope.type;
}

export function CategoryChat() {
  const { categories, createCategory } = useCategories();
  const [scope, setScope] = useState<Scope>({ type: "uncategorized" });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  function pillClasses(isActive: boolean): string {
    return `rounded-full border px-3 py-1.5 text-sm transition-colors ${
      isActive
        ? "border-ink bg-ink text-paper"
        : "border-line text-ink hover:border-ink/30"
    }`;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const category = await createCategory(newName.trim());
    if (category) {
      setScope({ type: "category", id: category.id });
      setNewName("");
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setScope({ type: "uncategorized" })}
          className={pillClasses(scope.type === "uncategorized")}
        >
          Uncategorized
        </button>
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            onClick={() => setScope({ type: "category", id: category.id })}
            className={pillClasses(
              scope.type === "category" && scope.id === category.id,
            )}
          >
            {category.name}{" "}
            <span className="font-mono text-[11px] opacity-70">
              {category.meetingCount}
            </span>
          </button>
        ))}

        {creating ? (
          <form onSubmit={handleCreate} className="flex items-center gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New category name"
              className="rounded-full border border-line bg-card px-3 py-1 text-sm text-ink outline-none focus:border-ink/30"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="font-mono text-[12px] text-ink underline underline-offset-2 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="font-mono text-[12px] text-ink-muted"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink/30 hover:text-ink"
          >
            + New category
          </button>
        )}
      </div>

      <ChatPanel
        key={scopeKey(scope)}
        categoryId={scope.type === "category" ? scope.id : undefined}
        uncategorizedOnly={scope.type === "uncategorized"}
      />
    </div>
  );
}
