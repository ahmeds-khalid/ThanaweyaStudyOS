"use client";

import { Database, Download, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/app/button";
import { Dialog } from "@/components/app/dialog";
import { Checkbox } from "@/components/app/form";
import { Callout } from "@/components/app/misc";
import { makeBackup, validateBackup, type BackupValidation } from "@/lib/schemas/backup";
import { ENTITY_NAMES } from "@/lib/schemas/entities";
import { confirmAction } from "@/lib/store/confirm";
import { db, flush, useDataStore, useSettings } from "@/lib/store/data";
import { toast } from "@/lib/store/toast";
import { downloadFile, readFileText } from "@/lib/utils";
import { Row, SettingsSection } from "./controls";

export function DataSection() {
  const settings = useSettings();
  const tables = useDataStore((s) => s.tables);
  const fileRef = useRef<HTMLInputElement>(null);
  const [validation, setValidation] = useState<BackupValidation | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [busy, setBusy] = useState(false);
  const total = ENTITY_NAMES.reduce((a, e) => a + Object.keys(tables[e]).length, 0);

  const exportJson = async () => {
    await flush();
    try {
      const res = await fetch("/api/export", { cache: "no-store" });
      if (!res.ok) throw new Error();
      downloadFile(`study-os-backup-${new Date().toISOString().slice(0, 10)}.json`, await res.text());
      toast.success("Backup downloaded");
    } catch {
      // Offline: export this device's copy instead (includes unsynced changes).
      const data = Object.fromEntries(ENTITY_NAMES.map((e) => [e, Object.values(tables[e])]));
      downloadFile(`study-os-backup-local-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(makeBackup(settings, data as never), null, 2));
      toast.warning("Server unreachable — exported this device's copy");
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await readFileText(file));
      setRaw(parsed);
      setValidation(validateBackup(parsed));
    } catch {
      setValidation({ ok: false, errors: ["The file is not valid JSON."], backup: null, counts: {} });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const runImport = async (mode: "merge" | "replace") => {
    if (!validation?.ok) return;
    const ok =
      mode === "replace"
        ? await confirmAction({
            title: "Replace all your data?",
            description: `This deletes your current ${total} items and replaces them with the backup. Download a backup first if you might need your current data.`,
            confirmLabel: "Replace everything",
            destructive: true,
            typeToConfirm: "REPLACE",
          })
        : await confirmAction({ title: "Merge backup into your data?", description: "Items with the same id are overwritten by the backup version; everything else is kept.", confirmLabel: "Merge" });
    if (!ok) return;
    setBusy(true);
    try {
      await flush();
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, confirmReplace: mode === "replace", includeSettings, backup: raw }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      await db.refresh();
      toast.success("Restore complete", `${body.written ?? 0} items written.`);
      setValidation(null);
      setRaw(null);
    } catch (err) {
      toast.error("Restore failed — nothing was changed.", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection id="data" title="Data">
      <Row label="Backup" hint={`Download everything (${total} items, plus settings) as a file.`}>
        <Button onClick={() => void exportJson()}>
          <Download /> Download backup
        </Button>
      </Row>
      <Row label="Restore" hint="Choose a backup file. It's checked before anything changes.">
        <Button onClick={() => fileRef.current?.click()}>
          <FileUp /> Choose file
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
      </Row>

      <Dialog
        open={!!validation}
        onClose={() => setValidation(null)}
        title="Restore backup"
        description={validation?.backup ? `Exported ${validation.backup.exportedAt.slice(0, 16).replace("T", " ")}` : undefined}
        footer={
          validation?.ok ? (
            <>
              <Button onClick={() => setValidation(null)}>Cancel</Button>
              <Button disabled={busy} onClick={() => void runImport("merge")}>
                Merge
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => void runImport("replace")}>
                Replace all
              </Button>
            </>
          ) : (
            <Button onClick={() => setValidation(null)}>Close</Button>
          )
        }
      >
        {validation && (
          <div className="flex flex-col gap-3 text-[13px]">
            {validation.ok ? (
              <>
                <Callout tone="info" icon={<Database />} title="Backup is valid">
                  {Object.entries(validation.counts)
                    .filter(([, n]) => n)
                    .map(([k, n]) => `${n} ${k}`)
                    .join(" · ") || "No items"}
                </Callout>
                <Checkbox checked={includeSettings} onChange={setIncludeSettings} label="Also restore settings" />
              </>
            ) : (
              <Callout tone="danger" title="This file can't be restored — nothing was changed">
                <ul className="list-disc ps-4">
                  {validation.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Callout>
            )}
          </div>
        )}
      </Dialog>
    </SettingsSection>
  );
}
