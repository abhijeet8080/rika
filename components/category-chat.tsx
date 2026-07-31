"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";

interface Category {
  id: string;
  name: string;
  meetingCount: number;
}

type Scope =
  | { type: "all" }
  | { type: "uncategorized" }
  | { type: "category"; id: string };

function scopeKey(scope: Scope): string {
  if (scope.type === "category") return `category:${scope.id}`;
  return scope.type;
}

export function CategoryChat() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [scope, setScope] = useState<Scope>({ type: "all" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/categories")
      .then((res) => (res.ok ? res.json() : { categories: [] }))
      .then((body) => {
        if (!cancelled) setCategories(body.categories ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function pillClasses(isActive: boolean): string {
    return `rounded-full border px-3 py-1.5 text-sm transition-colors ${
      isActive
        ? "border-ink bg-ink text-paper"
        : "border-line text-ink hover:border-ink/30"
    }`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setScope({ type: "all" })}
          className={pillClasses(scope.type === "all")}
        >
          All meetings
        </button>
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
      </div>

      <ChatPanel
        key={scopeKey(scope)}
        categoryId={scope.type === "category" ? scope.id : undefined}
        uncategorizedOnly={scope.type === "uncategorized"}
      />
    </div>
  );
}
