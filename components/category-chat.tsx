"use client";

import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown, FolderOpen, FolderPlus, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { useCategories } from "@/lib/hooks/use-categories";
import styles from "./chat-workspace.module.css";

export function CategoryChat() {
  const { categories, loaded, createCategory, deleteCategory } = useCategories();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visitedIds, setVisitedIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeId = categories.some((c) => c.id === selectedId)
    ? selectedId : (categories[0]?.id ?? null);
  const activeCategory = categories.find((c) => c.id === activeId);
  const activeCount = activeCategory?.meetingCount ?? 0;

  function select(id: string) {
    setVisitedIds((ids) => [...new Set([...ids, ...(activeId ? [activeId] : []), id])]);
    setSelectedId(id);
    setOpen(false);
    setConfirmDeleteId(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      const category = await createCategory(newName.trim());
      if (category) {
        select(category.id);
        setNewName("");
        setCreating(false);
      }
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (saving) return;
    setSaving(true);
    try {
      if (await deleteCategory(id)) setConfirmDeleteId(null);
    } finally { setSaving(false); }
  }

  const createForm = (
    <form onSubmit={handleCreate} className={styles.createForm}>
      <label htmlFor="chat-category-name">Category name</label>
      <div>
        <input id="chat-category-name" autoFocus value={newName}
          onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Product team" disabled={saving} />
        <button type="submit" disabled={!newName.trim() || saving}>{saving ? "Adding…" : "Add"}</button>
        {categories.length > 0 && <button type="button" aria-label="Cancel new category" onClick={() => { setCreating(false); setNewName(""); }}><X size={16} /></button>}
      </div>
    </form>
  );

  if (!loaded) return <div className={styles.loading} role="status"><div className={styles.loadingMark} />Loading your meeting memory…</div>;

  if (!categories.length) return (
    <section className={styles.onboarding}>
      <span className={styles.welcomeMark}><FolderPlus size={30} strokeWidth={1.5} /></span>
      <p className={styles.eyebrow}>YOUR MEETING MEMORY</p>
      <h2>Bring your conversations together.</h2>
      <p>Create a category for a client or team, then group their meetings to ask questions across the whole series.</p>
      {createForm}
      <Link href="/meetings">Browse your meetings →</Link>
    </section>
  );

  return (
    <section className={styles.workspace} aria-label="Cross-meeting conversation">
      <div className={styles.toolbar}>
        <div className={styles.scope}>
          <span className={styles.scopeLabel}>MEETING MEMORY</span>
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger className={styles.selector} aria-label="Choose meeting category">
              <FolderOpen size={16} /> <span>{activeCategory?.name}</span> <ChevronDown size={14} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner side="bottom" align="start" sideOffset={10} className={styles.positioner}>
                <Popover.Popup className={styles.categoryMenu}>
                  <div className={styles.menuHeader}><h2>Your categories</h2><span>{categories.length} groups</span></div>
                  <ul>
                    {categories.map((category) => (
                      <li key={category.id}>
                        {confirmDeleteId === category.id ? (
                          <div className={styles.deleteConfirmation}>
                            <p>Delete “{category.name}”?<small>Its meetings will become uncategorized.</small></p>
                            <button type="button" disabled={saving} onClick={() => handleDelete(category.id)}>Delete</button>
                            <button type="button" disabled={saving} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div className={styles.categoryRow} data-active={activeId === category.id}>
                            <button type="button" onClick={() => select(category.id)} aria-current={activeId === category.id ? "true" : undefined}>
                              <FolderOpen size={15} /><span>{category.name}<small>{category.meetingCount ?? 0} meetings</small></span>{activeId === category.id && <Check size={15} />}
                            </button>
                            <button type="button" aria-label={`Delete ${category.name}`} onClick={() => setConfirmDeleteId(category.id)}><Trash2 size={14} /></button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className={styles.menuFooter}>
                    {creating ? createForm : <button type="button" onClick={() => setCreating(true)}><Plus size={15} />New category</button>}
                  </div>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>
        <span className={styles.scopeCount}><span />{activeCount} meeting{activeCount === 1 ? "" : "s"} in context</span>
      </div>
      <div className={styles.conversations}>
        {categories.filter((category) => category.id === activeId || visitedIds.includes(category.id)).map((category) => (
          <div key={category.id} className={styles.conversation} hidden={category.id !== activeId}>
            <ChatPanel categoryId={category.id} variant="workspace" scopeName={category.name}
              meetingCount={category.meetingCount ?? 0} visible={category.id === activeId} />
          </div>
        ))}
      </div>
    </section>
  );
}
