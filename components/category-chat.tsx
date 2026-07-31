"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { Input } from "@/components/ui/input";
import { useCategories } from "@/lib/hooks/use-categories";

type Scope = { type: "uncategorized" } | { type: "category"; id: string };

function scopeKey(scope: Scope): string {
  if (scope.type === "category") return `category:${scope.id}`;
  return scope.type;
}

export function CategoryChat() {
  const { categories, createCategory, deleteCategory } = useCategories();
  const [scope, setScope] = useState<Scope>({ type: "uncategorized" });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  async function handleDelete(id: string) {
    const ok = await deleteCategory(id);
    setConfirmDeleteId(null);
    if (ok && scope.type === "category" && scope.id === id) {
      setScope({ type: "uncategorized" });
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
        {categories.map((category) =>
          confirmDeleteId === category.id ? (
            <div
              key={category.id}
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[12px]"
            >
              <span className="text-ink-muted">Delete {category.name}?</span>
              <button
                type="button"
                onClick={() => handleDelete(category.id)}
                className="text-rec underline underline-offset-2"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="text-ink-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div
              key={category.id}
              className={`group flex items-center rounded-full border transition-colors ${
                scope.type === "category" && scope.id === category.id
                  ? "border-ink bg-ink text-paper"
                  : "border-line text-ink hover:border-ink/30"
              }`}
            >
              <button
                type="button"
                onClick={() => setScope({ type: "category", id: category.id })}
                className="rounded-full py-1.5 pr-1.5 pl-3 text-sm"
              >
                {category.name}{" "}
                <span className="font-mono text-[11px] opacity-70">
                  {category.meetingCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(category.id)}
                aria-label={`Delete ${category.name}`}
                className="rounded-full p-1.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
          ),
        )}

        {creating ? (
          <form onSubmit={handleCreate} className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New category name"
              className="py-1"
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
