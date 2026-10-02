"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";

import { api } from "@/lib/api";
import { revision } from "@/lib/revisions";
import { useWorkspace } from "@/lib/workspace-store";

import { CurvePanel } from "./CurvePanel";
import { ExportSheet, useExportSheet } from "./ExportSheet";
import { FixQueue } from "./FixQueue";
import { Lanes } from "./Lanes";
import { MetricsLedger } from "./MetricsLedger";
import { ProjectBar } from "./ProjectBar";
import { ScriptPage } from "./ScriptPage";

/** Re-simulate the working revision whenever its set of fixes changes. */
function useDraftSimulation(analysisId: string) {
  const { drafts, setSimulation } = useWorkspace();
  const lastRun = useRef(new Map<string, string>());
  useEffect(() => {
    for (const d of drafts) {
      if (d.key === "white") continue;
      const sig = d.fixIds.slice().sort().join(",");
      if (lastRun.current.get(d.key) === sig) continue;
      lastRun.current.set(d.key, sig);
      if (!d.fixIds.length) {
        setSimulation(d.key, null, "idle");
        continue;
      }
      setSimulation(d.key, d.simulation, "simulating");
      api
        .simulate(analysisId, d.fixIds)
        .then((sim) => {
          if (lastRun.current.get(d.key) === sig) setSimulation(d.key, sim, "idle");
        })
        .catch((e: Error) => setSimulation(d.key, d.simulation, "error", e.message));
    }
  }, [drafts, analysisId, setSimulation]);
}

export function Workspace({ id }: { id: string }) {
  const { data: analysis, error, isLoading } = useQuery({ queryKey: ["analysis", id], queryFn: () => api.get(id) });
  const { reset, selectedFlagId, drafts, activeDraft } = useWorkspace();
  const exportSheet = useExportSheet();

  useEffect(() => reset(id), [id, reset]);
  useDraftSimulation(id);

  if (isLoading) {
    return <div className="grid h-full place-items-center text-[14px] text-ink-3">Opening the script…</div>;
  }
  if (error || !analysis) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 text-pen" aria-hidden />
          <p className="text-[16px] font-[620]">Couldn’t open this analysis.</p>
          <p className="mt-1 text-[14px] text-ink-2">
            {(error as Error)?.message ?? "It may have been removed."} Check that the API is running on port 8000, then reload.
          </p>
        </div>
      </div>
    );
  }

  const draft = drafts.find((d) => d.key === activeDraft && d.key !== "white") ?? null;
  const sim = draft?.simulation ?? null;
  const focusFlag = analysis.flags.find((f) => f.id === selectedFlagId) ?? analysis.flags[0] ?? null;
  const uncalibrated = analysis.warnings.find((w) => w.code === "uncalibrated");

  return (
    <div className="flex h-full min-w-0 flex-col">
      <ProjectBar analysis={analysis} onExport={exportSheet.open} />
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Left: curve, lanes, script */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto">
          <section className="px-6 pt-4" aria-label="Predicted retention curve">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[15px] font-[620]">Predicted retention</h2>
              <p className="flex items-center gap-4 text-[12px] text-ink-3">
                <span className="flex items-center gap-1.5"><span className="h-[2px] w-3.5 bg-ink" />White draft</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 bg-ink/10" />likely range</span>
                {draft?.simulation && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-[2px] w-3.5" style={{ background: revision(draft.key).ink }} />
                    {revision(draft.key).name} draft
                  </span>
                )}
              </p>
            </div>
            <div className="h-[clamp(240px,34vh,360px)]">
              <CurvePanel analysis={analysis} focusFlag={focusFlag} />
            </div>
            {uncalibrated && <p className="mt-1 max-w-[80ch] text-[12px] text-ink-3">{uncalibrated.message}</p>}
          </section>
          <section className="px-6 pt-4" aria-label="Timeline lanes">
            <Lanes analysis={analysis} />
          </section>
          <section className="px-6 pt-6 pb-16" aria-label="Script">
            <ScriptPage analysis={analysis} sim={sim} draftKey={draft?.key ?? null} />
          </section>
        </div>

        {/* Right: metrics ledger + fix queue */}
        <aside className="flex min-h-0 flex-col border-l border-rule bg-paper" aria-label="Metrics and fixes">
          <div className="border-b border-rule px-5 pt-4 pb-3">
            <MetricsLedger analysis={analysis} sim={sim} draftKey={draft?.key ?? null} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-10">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[15px] font-[620]">Drops and fixes</h2>
              <span className="tnum text-[12px] text-ink-3">{analysis.flags.length} found</span>
            </div>
            <FixQueue analysis={analysis} />
          </div>
        </aside>
      </div>
      <ExportSheet {...exportSheet.props} analysis={analysis} sim={sim} draftKey={draft?.key ?? null} />
    </div>
  );
}
