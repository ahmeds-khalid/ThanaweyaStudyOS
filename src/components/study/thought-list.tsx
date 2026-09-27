"use client";

import { ListPlus, X } from "lucide-react";
import { Button } from "@/components/app/button";
import type { Thought } from "@/lib/schemas/entities";
import { db } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";

/** A thought captured during a session: convert it to a task, or dismiss it. */
export function ThoughtRow({ thought }: { thought: Thought }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5">
      <p className="min-w-0 flex-1 text-[13px] whitespace-pre-wrap">{thought.text}</p>
      <Button
        size="xs"
        onClick={() => {
          const task = db.create("tasks", { title: thought.text.slice(0, 300), status: "today", notes: thought.text.length > 300 ? thought.text : "" });
          db.update("thoughts", thought.id, { status: "converted", taskId: task.id });
          toast.success("Added to your tasks");
        }}
      >
        <ListPlus /> Task
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Dismiss thought" onClick={() => db.update("thoughts", thought.id, { status: "done" })}>
        <X />
      </Button>
    </li>
  );
}
