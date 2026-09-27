"use client";

import { ArrowDown, ArrowUp, CalendarDays, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { Button, ButtonLink } from "@/components/app/button";
import { Card, CardBody, CardHeader } from "@/components/app/card";
import { Checkbox, DatePicker, Field, Input, NumberInput, Select } from "@/components/app/form";
import { Menu, MenuItem } from "@/components/app/menu";
import { Callout, EmptyState, PageHeader, SubjectDot } from "@/components/app/misc";
import { regenerateWeeklyPlan, saveWeeklyPlan } from "@/lib/actions";
import { formatMinutes } from "@/lib/domain/dates";
import { weeklyMinutes } from "@/lib/domain/weekly";
import { useSubjects } from "@/lib/hooks";
import { WEEKDAYS } from "@/lib/labels";
import type { PlanDay, PlanSlot, SlotKind } from "@/lib/schemas/settings";
import { confirmAction } from "@/lib/store/confirm";
import { useSettings } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";
import { uid } from "@/lib/utils";

/**
 * Weekly Study Plan: the routine that repeats every week. The calendar and Today are
 * generated from it. Changing it here changes all future weeks; changing one date is
 * done from the calendar or Today ("Edit this occurrence") and leaves this untouched.
 */
export default function SchedulePage() {
  const settings = useSettings();
  const { active, byId } = useSubjects();
  const plan = settings.weeklyPlan;
  const start = settings.general.weekStartsOn;
  const order = useMemo(() => Array.from({ length: 7 }, (_, i) => (start + i) % 7), [start]);

  const save = (days: PlanDay[]) => saveWeeklyPlan(days);
  const patchDay = (wd: number, patch: Partial<PlanDay>) => save(plan.days.map((d, i) => (i === wd ? { ...d, ...patch } : d)));
  const patchSlot = (wd: number, id: string, patch: Partial<PlanSlot>) =>
    patchDay(wd, { slots: plan.days[wd].slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const move = (wd: number, index: number, by: number) => {
    const slots = [...plan.days[wd].slots];
    const j = index + by;
    if (j < 0 || j >= slots.length) return;
    [slots[index], slots[j]] = [slots[j], slots[index]];
    // Swapping the order of blocks that have no fixed time swaps who goes first; fixed times stay put.
    patchDay(wd, { slots });
  };
  const add = (wd: number, kind: SlotKind, subjectId: string | null) =>
    patchDay(wd, {
      slots: [...plan.days[wd].slots, { id: uid().slice(0, 8), kind, subjectId, start: null, durationMinutes: kind === "study" ? settings.study.blockMinutes : kind === "revision" ? 45 : settings.study.blockMinutes }],
    });
  const setCatchUp = (wd: number, on: boolean) => save(plan.days.map((d, i) => ({ ...d, catchUp: i === wd ? on : on ? false : d.catchUp, off: i === wd && on ? false : d.off })));

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of plan.days) if (!d.off) for (const s of d.slots) if (s.kind === "study" && s.subjectId) m.set(s.subjectId, (m.get(s.subjectId) ?? 0) + 1);
    return m;
  }, [plan.days]);
  const total = weeklyMinutes(plan.days);

  const regenerate = async () => {
    if (plan.configured && !(await confirmAction({ title: "Rebuild your weekly plan?", description: "It will be recreated from each subject's priority and weekly sessions. Your one-off changes to specific dates are kept.", confirmLabel: "Rebuild" }))) return;
    const dropped = regenerateWeeklyPlan();
    toast.success("Weekly plan rebuilt", dropped > 0 ? `${dropped} session${dropped === 1 ? "" : "s"} didn't fit — raise "blocks per day" in Settings or lower a subject's sessions.` : undefined);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        title="Weekly Study Plan"
        description="Set your routine once. The calendar and Today repeat it every week."
        className="!mb-0"
        actions={
          <>
            <ButtonLink href="/calendar" variant="ghost">
              <CalendarDays /> Calendar
            </ButtonLink>
            <Button onClick={regenerate}>
              <RefreshCcw /> {plan.configured ? "Rebuild from my subjects" : "Build from my subjects"}
            </Button>
          </>
        }
      />

      {!plan.configured ? (
        <EmptyState
          icon={<CalendarDays />}
          title="No weekly plan yet."
          description="Build one from your subjects' priorities and weekly sessions, then adjust it here."
          action={
            <Button variant="primary" onClick={regenerate} disabled={active.length === 0}>
              Build from my subjects
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardBody className="flex flex-col gap-3 text-[13px]">
              <p>
                <span className="font-medium">{formatMinutes(total)}</span> <span className="text-muted-foreground">of study per week</span>
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {active.map((s) => {
                  const n = counts.get(s.id) ?? 0;
                  return (
                    <li key={s.id} className="flex items-center gap-1.5">
                      <SubjectDot color={s.color} />
                      <span>{s.name}</span>
                      <span className={n < s.weeklySessions ? "text-warning" : "text-muted-foreground"}>
                        {n}/{s.weeklySessions}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="max-w-xs">
                <Field label="Repeats until" hint="Leave empty to repeat indefinitely (for example until the academic year ends).">
                  {(p) => <DatePicker {...p} value={plan.endsOn ?? ""} clearable onChange={(v) => saveWeeklyPlan(plan.days, { endsOn: v || null })} />}
                </Field>
              </div>
            </CardBody>
          </Card>

          <div className="grid gap-[var(--gap)] md:grid-cols-2">
            {order.map((wd) => {
              const day = plan.days[wd];
              return (
                <Card key={wd} className={day.off ? "opacity-70" : undefined}>
                  <CardHeader title={WEEKDAYS[wd]} description={day.catchUp ? "Catch-up day" : day.off ? "Day off" : undefined} />
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      <Checkbox checked={day.off} onChange={(v) => patchDay(wd, { off: v, catchUp: v ? false : day.catchUp })} label="Day off" />
                      <Checkbox checked={day.catchUp} onChange={(v) => setCatchUp(wd, v)} label="Catch-up day" />
                    </div>
                    {!day.off && (
                      <ul className="flex flex-col gap-2">
                        {day.slots.map((slot, i) => (
                          <li key={slot.id} className="flex items-start gap-2 rounded-lg border p-2">
                            <div className="flex flex-col pt-0.5">
                              <Button size="icon-sm" className="size-6" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(wd, i, -1)}>
                                <ArrowUp />
                              </Button>
                              <Button size="icon-sm" className="size-6" variant="ghost" aria-label="Move down" disabled={i === day.slots.length - 1} onClick={() => move(wd, i, 1)}>
                                <ArrowDown />
                              </Button>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              {slot.kind === "study" ? (
                                <Select aria-label="Subject" value={slot.subjectId ?? ""} onChange={(e) => patchSlot(wd, slot.id, { subjectId: e.target.value })}>
                                  {[...active, ...(slot.subjectId && !active.some((s) => s.id === slot.subjectId) && byId.get(slot.subjectId) ? [byId.get(slot.subjectId)!] : [])].map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <span className="flex h-9 items-center text-sm font-medium">{slot.kind === "revision" ? "Weekly revision" : "Catch-up"}</span>
                              )}
                              <div className="flex items-center gap-2">
                                <Input
                                  type="time"
                                  aria-label="Preferred start time"
                                  className="w-28"
                                  value={slot.start ?? ""}
                                  title="Leave empty to place it automatically"
                                  onChange={(e) => patchSlot(wd, slot.id, { start: e.target.value || null })}
                                />
                                <NumberInput aria-label="Minutes" className="w-20" min={5} max={480} step={5} value={slot.durationMinutes} onChange={(v) => patchSlot(wd, slot.id, { durationMinutes: Math.max(5, v ?? 5) })} />
                                <span className="text-xs text-muted-foreground">min</span>
                              </div>
                            </div>
                            <Button size="icon-sm" variant="ghost" aria-label="Remove block" onClick={() => patchDay(wd, { slots: day.slots.filter((s) => s.id !== slot.id) })}>
                              <Trash2 />
                            </Button>
                          </li>
                        ))}
                        {day.slots.length === 0 && <li className="text-[13px] text-muted-foreground">Nothing planned. This day is free.</li>}
                      </ul>
                    )}
                    {!day.off && (
                      <Menu
                        label={`Add a block on ${WEEKDAYS[wd]}`}
                        variant="secondary"
                        align="start"
                        trigger={
                          <>
                            <Plus /> Add block
                          </>
                        }
                      >
                        {active.map((s) => (
                          <MenuItem key={s.id} icon={<SubjectDot color={s.color} />} onClick={() => add(wd, "study", s.id)}>
                            {s.name}
                          </MenuItem>
                        ))}
                        <MenuItem onClick={() => add(wd, "revision", null)}>Weekly revision</MenuItem>
                        <MenuItem onClick={() => add(wd, "catchup", null)}>Catch-up</MenuItem>
                      </Menu>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
          <Callout tone="neutral" title="How this works">
            Blocks without a start time are placed one after another from the start of your study window, around meals and breaks. Changing one date (move, skip, day off) never changes this plan.
          </Callout>
        </>
      )}
    </div>
  );
}
