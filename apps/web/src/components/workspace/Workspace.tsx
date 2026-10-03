"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, Panel, Segmented, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { revision } from "@/lib/revisions";
import { useWorkspace } from "@/lib/workspace-store";

import { CurvePanel } from "./CurvePanel";
import { CurveTable } from "./CurveTable";
import { ExportSheet, useExportSheet } from "./ExportSheet";
import { FixQueue } from "./FixQueue";
import { Lanes } from "./Lanes";
import { MetricsLedger } from "./MetricsLedger";
import { ProjectBar } from "./ProjectBar";
import { RoughCutPlayer } from "./RoughCutPlayer";
import { YouTubeCheck } from "./YouTubeCheck";
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

function LegendSwatch({ color, band }: { color: string; band?: boolean }) {
  return band ? (
    <span aria-hidden className="h-2.5 w-3.5 rounded-[2px]" style={{ background: color }} />
  ) : (
    <span aria-hidden className="h-[2px] w-3.5 rounded-full" style={{ background: color }} />
  );
}

export function Workspace({ id }: { id: string }) {
  const { data: analysis, error, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["analysis", id], queryFn: () => api.get(id) });
  const { data: actual } = useQuery({
    queryKey: ["actual", id],
    queryFn: () => api.actual(id),
    enabled: !!analysis && analysis.meta.input_mode === "url",
    retry: false,
  });
  const [view, setView] = useState<"retention" | "youtube">("retention");
  const { reset, selectedFlagId, drafts, activeDraft } = useWorkspace();
  const exportSheet = useExportSheet();

  useEffect(() => reset(id), [id, reset]);
  useDraftSimulation(id);

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center">
        <p className="flex items-center gap-2.5 text-[13.5px] text-ink-3">
          <Spinner /> Opening the analysis…
        </p>
      </div>
    );
  }
  if (error || !analysis) {
    return (
      <div className="grid h-full place-items-center p-8">
        <Panel className="flex max-w-md flex-col items-center gap-3 p-8 text-center" role="alert">
          <span className="grid size-10 place-items-center rounded-full bg-drop-wash text-drop">
            <AlertTriangle size={18} aria-hidden />
          </span>
          <p className="text-[16px] font-[600]">Couldn’t open this analysis</p>
          <p className="text-[13.5px] text-ink-2">
            {(error as Error)?.message ?? "It may have been removed."} Check that the API is running on port 8000.
          </p>
          <div className="mt-1 flex gap-2">
            <Button variant="secondary" onClick={() => refetch()} loading={isRefetching}>
              Try again
            </Button>
            <Button href="/projects" variant="ghost">
              Back to projects
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const draft = drafts.find((d) => d.key === activeDraft && d.key !== "white") ?? null;
  const sim = draft?.simulation ?? null;
  const top = analysis.flags[0] && analysis.flags[0].viewers_lost >= 5 ? analysis.flags[0] : null;
  const focusFlag = analysis.flags.find((f) => f.id === selectedFlagId) ?? top;
  const uncalibrated = analysis.warnings.find((w) => w.code === "uncalibrated");

  return (
    <div className="flex h-full min-w-0 flex-col">
      <ProjectBar analysis={analysis} onExport={exportSheet.open} />
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Curve and lanes stay pinned; only the script scrolls, so the drop you're reading stays in view. */}
        <div className="flex min-h-0 min-w-0 flex-col gap-(--gap-ws) overflow-y-auto p-(--gap-ws) xl:overflow-hidden">
          <Panel className="shrink-0" aria-labelledby="curve-heading">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex items-center gap-3">
                <h2 id="curve-heading" className="panel-title">
                  {view === "youtube" ? "Blind check against YouTube" : "Predicted retention"}
                </h2>
                {actual && (
                  <Segmented
                    label="Curve view"
                    size="sm"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "retention", label: "Retention" },
                      { value: "youtube", label: "vs YouTube" },
                    ]}
                  />
                )}
              </div>
              {view === "retention" && (
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
                  <span className="flex items-center gap-1.5">
                    <LegendSwatch color="var(--ink)" />
                    White draft
                  </span>
                  <span className="flex items-center gap-1.5">
                    <LegendSwatch color="color-mix(in srgb, var(--ink) 10%, transparent)" band />
                    Likely range
                  </span>
                  <span className="flex items-center gap-1.5">
                    <LegendSwatch color="var(--drop-wash-strong)" band />
                    Drop
                  </span>
                  {draft?.simulation && (
                    <span className="flex items-center gap-1.5">
                      <LegendSwatch color={revision(draft.key).ink} />
                      {revision(draft.key).name} draft
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="h-[clamp(220px,30vh,330px)]">
              {view === "youtube" && actual ? (
                <YouTubeCheck analysis={analysis} actual={actual} />
              ) : (
                <CurvePanel analysis={analysis} focusFlag={focusFlag} />
              )}
            </div>
            {uncalibrated && <p className="mt-1 max-w-[80ch] text-[12px] text-ink-3">{uncalibrated.message}</p>}
            <div className="mt-3">
              <Lanes analysis={analysis} />
            </div>
            <CurveTable analysis={analysis} sim={sim} draftKey={draft?.key ?? null} />
          </Panel>

          <Panel padded={false} className="min-h-[360px] xl:min-h-0 xl:flex-1 xl:overflow-y-auto" aria-label="Script">
            <ScriptPage analysis={analysis} sim={sim} draftKey={draft?.key ?? null} />
          </Panel>
        </div>

        {/* Inspector: metrics, then the fix queue */}
        <aside
          className="flex min-h-0 flex-col border-line bg-surface max-xl:border-t xl:border-l"
          aria-label="Metrics and fixes"
        >
          {analysis.meta.input_mode === "video" && (
            <div className="border-b border-line px-5 pt-4 pb-4">
              <RoughCutPlayer analysisId={analysis.id} />
            </div>
          )}
          <div className="border-b border-line px-5 pt-4 pb-3">
            <MetricsLedger analysis={analysis} sim={sim} draftKey={draft?.key ?? null} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-10">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="panel-title">Drops and fixes</h2>
              <span className="tc text-[12px] text-ink-3">{analysis.flags.length} found</span>
            </div>
            <FixQueue analysis={analysis} />
          </div>
        </aside>
      </div>
      <ExportSheet {...exportSheet.props} analysis={analysis} sim={sim} draftKey={draft?.key ?? null} />
    </div>
  );
}
