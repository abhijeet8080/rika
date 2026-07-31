"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Category {
  id: string;
  name: string;
}

export function CategorySelect({
  meetingId,
  initialCategoryId,
  categories: initialCategories,
}: {
  meetingId: string;
  initialCategoryId: string | null;
  categories: Category[];
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);

  async function assignCategory(id: string | null) {
    setPending(true);
    const res = await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: id }),
    });
    setPending(false);
    if (res.ok) {
      setCategoryId(id);
      router.refresh();
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setPending(true);

    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });

    if (!res.ok) {
      setPending(false);
      return;
    }

    const { category } = await res.json();
    setCategories((prev) => [...prev, category]);
    setNewName("");
    setCreating(false);
    await assignCategory(category.id);
  }

  if (creating) {
    return (
      <form onSubmit={handleCreate} className="flex items-center gap-1.5">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          disabled={pending}
          className="rounded-full border border-line bg-card px-3 py-1 text-sm text-ink outline-none focus:border-ink/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || !newName.trim()}
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
    );
  }

  return (
    <select
      value={categoryId ?? ""}
      disabled={pending}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setCreating(true);
          return;
        }
        assignCategory(e.target.value || null);
      }}
      className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink outline-none disabled:opacity-50"
    >
      <option value="">Uncategorized</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new__">+ New category…</option>
    </select>
  );
}
