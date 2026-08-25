"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Item = Readonly<{ id: string; label: string; description?: string }>;

export function SortableOrder({
  items: initialItems,
  action,
  label,
}: {
  items: readonly Item[];
  action: (ids: string[]) => Promise<{ message?: string; success?: boolean }>;
  label: string;
}) {
  const [items, setItems] = useState([...initialItems]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function save(next: Item[]) {
    setItems(next);
    startTransition(async () => {
      const result = await action(next.map((item) => item.id));
      setMessage(result.message ?? (result.success ? "Orden guardado." : ""));
    });
  }

  function move(id: string, offset: -1 | 1) {
    const from = items.findIndex((item) => item.id === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    save(next);
  }

  return (
    <div className="grid gap-3" aria-label={label}>
      <p className="text-sm text-muted-foreground">
        Arrastra para ordenar o usa los botones para mover cada elemento.
      </p>
      <ol className="grid gap-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            draggable={!pending}
            onDragStart={() => setDraggedId(item.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!draggedId || draggedId === item.id) return;
              const next = [...items];
              const from = next.findIndex((entry) => entry.id === draggedId);
              const to = next.findIndex((entry) => entry.id === item.id);
              const [dragged] = next.splice(from, 1);
              next.splice(to, 0, dragged!);
              setDraggedId(null);
              save(next);
            }}
            className="flex items-center gap-3 rounded-xl border bg-card p-3"
          >
            <span
              aria-hidden="true"
              className="cursor-grab text-lg text-muted-foreground"
            >
              ⠿
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.label}</span>
              {item.description ? (
                <span className="block text-xs text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || index === 0}
              onClick={() => move(item.id, -1)}
              aria-label={`Mover ${item.label} hacia arriba`}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || index === items.length - 1}
              onClick={() => move(item.id, 1)}
              aria-label={`Mover ${item.label} hacia abajo`}
            >
              ↓
            </Button>
          </li>
        ))}
      </ol>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
