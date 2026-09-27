"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { NumberSetting, Row, SelectSetting, SettingsSection, TextSetting, TimeSetting, ToggleSetting } from "@/components/settings/controls";
import { DataSection } from "@/components/settings/data-section";
import { Button, ButtonLink } from "@/components/app/button";
import { Input, NumberInput, Select, Switch } from "@/components/app/form";
import { SubjectDot } from "@/components/app/misc";
import { formatMinutes, sleepDurationMinutes } from "@/lib/domain/dates";
import { playSound } from "@/lib/focus/sound";
import { notificationPermission, notify, requestNotificationPermission, type PermissionState } from "@/lib/focus/notify";
import { useSubjects } from "@/lib/hooks";
import { RATING_LABELS } from "@/lib/labels";
import { NOTIFICATION_MODES, RATING_EFFECTS, type NotificationCategoryKey, type Settings } from "@/lib/schemas/settings";
import { db, useSettings } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";

const SECTIONS = [
  ["general", "General"],
  ["study", "Study"],
  ["subjects", "Subjects"],
  ["pomodoro", "Pomodoro"],
  ["revision", "Revision"],
  ["notifications", "Notifications"],
  ["display", "Display"],
  ["data", "Data"],
] as const;

export default function SettingsPage() {
  const s = useSettings();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-[var(--gap)]">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <nav aria-label="Settings sections" className="sticky top-14 z-10 -mx-1 flex gap-1 overflow-x-auto bg-background/90 px-1 py-2 backdrop-blur">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground hover:bg-surface-2 hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>
      <General s={s} />
      <Study s={s} />
      <SubjectSettings />
      <Pomodoro s={s} />
      <Revision s={s} />
      <Notifications s={s} />
      <Display s={s} />
      <DataSection />
    </div>
  );
}

function General({ s }: { s: Settings }) {
  return (
    <SettingsSection id="general" title="General">
      <TextSetting label="Name" value={s.profile.name} patch={(name) => ({ profile: { name } })} />
      <TextSetting label="Track" value={s.profile.track} patch={(track) => ({ profile: { track } })} />
      <SelectSetting
        label="Language"
        hint="Arabic also switches the layout to right-to-left."
        value={s.general.language}
        options={[
          { value: "en", label: "English" },
          { value: "ar", label: "العربية" },
        ]}
        patch={(language) => ({ general: { language } })}
      />
      <SelectSetting
        label="Theme"
        value={s.general.theme}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        patch={(theme) => ({ general: { theme } })}
      />
    </SettingsSection>
  );
}

function Study({ s }: { s: Settings }) {
  const st = s.study;
  return (
    <SettingsSection id="study" title="Study" description="Your study days, catch-up day and blocks live in the Weekly plan. These set the daily limits and the study window.">
      <NumberSetting label="Daily target" hint="Focused study per day." value={st.dailyTargetMinutes} patch={(dailyTargetMinutes) => ({ study: { dailyTargetMinutes } })} suffix="min" />
      <NumberSetting label="Minimum" value={st.minDailyMinutes} patch={(minDailyMinutes) => ({ study: { minDailyMinutes } })} suffix="min" />
      <NumberSetting label="Maximum" hint="The plan never goes above this." value={st.maxDailyMinutes} patch={(maxDailyMinutes) => ({ study: { maxDailyMinutes } })} suffix="min" />
      <Row label="Weekly routine">
        <ButtonLink href="/schedule" variant="secondary" size="sm">
          Edit weekly plan
        </ButtonLink>
      </Row>
      <TimeSetting label="Study starts" value={st.windowStart} patch={(windowStart) => ({ study: { windowStart } })} />
      <TimeSetting label="Study ends" value={st.windowEnd} patch={(windowEnd) => ({ study: { windowEnd } })} />
      <NumberSetting label="Block duration" value={st.blockMinutes} patch={(blockMinutes) => ({ study: { blockMinutes } })} suffix="min" />
      <NumberSetting label="Break duration" value={st.breakMinutes} patch={(breakMinutes) => ({ study: { breakMinutes } })} suffix="min" />
      <TimeSetting label="Wake time" value={s.sleep.wakeTime} patch={(wakeTime) => ({ sleep: { wakeTime } })} />
      <TimeSetting label="Bedtime" hint={`${formatMinutes(sleepDurationMinutes(s.sleep.bedtime, s.sleep.wakeTime))} of sleep. Nothing is planned while you sleep.`} value={s.sleep.bedtime} patch={(bedtime) => ({ sleep: { bedtime } })} />
      <NumberSetting label="Sleep target" value={s.sleep.targetHours} patch={(targetHours) => ({ sleep: { targetHours } })} suffix="hours" step={0.5} integer={false} />
    </SettingsSection>
  );
}

function SubjectSettings() {
  const { active } = useSubjects();
  return (
    <SettingsSection id="subjects" title="Subjects" description="Blocks per week and priority. Priority decides who keeps their blocks when the week is too full.">
      {active.length === 0 && <p className="px-5 py-4 text-[13px] text-muted-foreground">No subjects yet.</p>}
      {active.map((sub) => (
        <Row key={sub.id} label={sub.name}>
          <SubjectDot color={sub.color} />
          <NumberInput aria-label={`${sub.name} blocks per week`} className="h-8 w-16" min={0} max={28} value={sub.weeklySessions} onChange={(v) => v != null && v >= 0 && v <= 28 && db.update("subjects", sub.id, { weeklySessions: Math.round(v) })} />
          <span className="text-xs text-muted-foreground">/week · priority</span>
          <Select aria-label={`${sub.name} priority`} className="h-8 w-16" value={sub.priority} onChange={(e) => db.update("subjects", sub.id, { priority: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </Row>
      ))}
    </SettingsSection>
  );
}

function Pomodoro({ s }: { s: Settings }) {
  const p = s.pomodoro;
  const custom = (patch: Partial<Settings["pomodoro"]>) => ({ pomodoro: { ...patch, preset: "custom" as const } });
  return (
    <SettingsSection id="pomodoro" title="Pomodoro" description="Your “Custom” timer. The 25/5, 50/10 and 90/15 presets are always available when you start studying.">
      <NumberSetting label="Focus" value={p.focusMinutes} patch={(focusMinutes) => custom({ focusMinutes })} suffix="min" />
      <NumberSetting label="Break" value={p.shortBreakMinutes} patch={(shortBreakMinutes) => custom({ shortBreakMinutes })} suffix="min" />
      <NumberSetting label="Long break" value={p.longBreakMinutes} patch={(longBreakMinutes) => custom({ longBreakMinutes })} suffix="min" />
      <NumberSetting label="Rounds before long break" value={p.cyclesBeforeLongBreak} patch={(cyclesBeforeLongBreak) => custom({ cyclesBeforeLongBreak })} />
      <ToggleSetting label="Sound" value={p.sound} patch={(sound) => ({ pomodoro: { sound } })} />
      <Row label="Sound type & volume">
        <Select aria-label="Sound type" className="w-28" value={p.soundType} onChange={(e) => db.updateSettings({ pomodoro: { soundType: e.target.value as Settings["pomodoro"]["soundType"] } })}>
          <option value="chime">Chime</option>
          <option value="bell">Bell</option>
          <option value="beep">Beep</option>
        </Select>
        <input type="range" aria-label="Volume" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => db.updateSettings({ pomodoro: { volume: Number(e.target.value) } })} className="w-28 accent-primary" />
        <Button size="sm" onClick={() => playSound(p.soundType, p.volume)}>
          Test
        </Button>
      </Row>
      <ToggleSetting label="Show remaining time" hint="Turn off if watching the clock distracts you." value={p.showRemaining} patch={(showRemaining) => ({ pomodoro: { showRemaining } })} />
      <ToggleSetting label="Start sessions in focus mode" value={s.focus.focusModeByDefault} patch={(focusModeByDefault) => ({ focus: { focusModeByDefault } })} />
      <ToggleSetting label="Phone-away reminder before sessions" value={s.focus.phoneAwayPrompt} patch={(phoneAwayPrompt) => ({ focus: { phoneAwayPrompt } })} />
    </SettingsSection>
  );
}

function Revision({ s }: { s: Settings }) {
  const r = s.revision;
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const nums = draft.split(/[,\s]+/).filter(Boolean).map(Number);
    if (nums.length === 0 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) return setErr("Use whole days between 1 and 365, separated by commas");
    db.updateSettings({ revision: { intervals: nums } });
    setDraft(null);
    setErr(null);
  };
  return (
    <SettingsSection id="revision" title="Revision" description="Configurable defaults, not a claim about the best spacing.">
      <Row label="Intervals (days)" hint="After completing a lesson, reviews follow these gaps." error={err}>
        <Input aria-label="Revision intervals" className="w-48" value={draft ?? r.intervals.join(", ")} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
      </Row>
      {(["1", "2", "3", "4", "5"] as const).map((k) => (
        <SelectSetting
          key={k}
          label={`If you rate it ${k} — ${RATING_LABELS[Number(k) - 1]}`}
          value={r.ratingEffects[k]}
          options={RATING_EFFECTS.map((e) => ({ value: e, label: { reset: "Start over", back: "One step back", repeat: "Same interval", next: "Next interval", skip: "Skip an interval" }[e] }))}
          patch={(v) => ({ revision: { ratingEffects: { [k]: v } } })}
        />
      ))}
    </SettingsSection>
  );
}

const CATEGORIES: { key: NotificationCategoryKey; label: string; field: "lead" | "time" | "leadDays" }[] = [
  { key: "studyReminder", label: "Study reminder", field: "lead" },
  { key: "revisionDue", label: "Revision reminder", field: "time" },
  { key: "examReminder", label: "Exam reminder", field: "leadDays" },
];

function Notifications({ s }: { s: Settings }) {
  const [perm, setPerm] = useState<PermissionState>(() => notificationPermission());
  return (
    <SettingsSection id="notifications" title="Notifications" description="Reminders appear while the app is open in a browser tab.">
      <Row label="Browser notifications" hint={perm === "unsupported" ? "Not supported here — in-app messages are used." : perm === "denied" ? "Blocked in your browser — in-app messages are used." : undefined}>
        <Switch
          checked={s.notifications.browser && perm === "granted"}
          label="Browser notifications"
          disabled={perm === "unsupported" || perm === "denied"}
          onChange={async (v) => {
            if (v && perm !== "granted") {
              const p = await requestNotificationPermission();
              setPerm(p);
              if (p !== "granted") return toast.warning("Notifications not allowed", "You'll get in-app messages instead.");
            }
            db.updateSettings({ notifications: { browser: v } });
          }}
        />
        <Button size="sm" onClick={() => void notify("Test notification", "Notifications are working.", { browser: s.notifications.browser })}>
          <Bell /> Test
        </Button>
      </Row>
      {CATEGORIES.map(({ key, label, field }) => {
        const c = s.notifications.categories[key];
        const set = (patch: Partial<typeof c>) => db.updateSettings({ notifications: { categories: { [key]: patch } } });
        return (
          <Row key={key} label={label}>
            <Select aria-label={`${label} mode`} className="w-28" value={c.mode} onChange={(e) => set({ mode: e.target.value as (typeof NOTIFICATION_MODES)[number] })}>
              <option value="off">Off</option>
              <option value="once">On</option>
              <option value="custom">Custom</option>
            </Select>
            {c.mode === "custom" && field === "time" && <Input aria-label={`${label} time`} type="time" className="w-28" value={c.time} onChange={(e) => e.target.value && set({ time: e.target.value })} />}
            {c.mode === "custom" && field === "lead" && (
              <>
                <NumberInput aria-label={`${label} minutes before`} className="w-20" min={0} max={1440} value={c.leadMinutes} onChange={(v) => v != null && v >= 0 && v <= 1440 && set({ leadMinutes: Math.round(v) })} />
                <span className="text-xs text-muted-foreground">min before</span>
              </>
            )}
            {c.mode === "custom" && field === "leadDays" && (
              <>
                <NumberInput aria-label="Days before exam" className="w-16" min={0} max={1} value={Math.round(c.leadMinutes / 1440)} onChange={(v) => v != null && v >= 0 && v <= 1 && set({ leadMinutes: Math.round(v) * 1440 })} />
                <span className="text-xs text-muted-foreground">days before, at</span>
                <Input aria-label="Exam reminder time" type="time" className="w-28" value={c.time} onChange={(e) => e.target.value && set({ time: e.target.value })} />
              </>
            )}
          </Row>
        );
      })}
    </SettingsSection>
  );
}

function Display({ s }: { s: Settings }) {
  return (
    <SettingsSection id="display" title="Display">
      <SelectSetting
        label="Compact mode"
        value={s.display.density}
        options={[
          { value: "comfortable", label: "Off" },
          { value: "compact", label: "On" },
        ]}
        patch={(density) => ({ display: { density } })}
      />
      <ToggleSetting label="Reduce motion" hint="Also follows your device setting." value={s.display.reducedMotion} patch={(reducedMotion) => ({ display: { reducedMotion } })} />
      <SelectSetting
        label="Text direction"
        hint="Right-to-left is used automatically with Arabic."
        value={s.general.language}
        options={[
          { value: "en", label: "Left to right" },
          { value: "ar", label: "Right to left (Arabic)" },
        ]}
        patch={(language) => ({ general: { language } })}
      />
    </SettingsSection>
  );
}
