"use client";

import { Clapperboard, FileSpreadsheet, FileText, ListOrdered, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import type { Analysis, Simulation } from "@/lib/contract.gen";
import { download, flagsCsv, markersEdl, revisedScript, youtubeChapters } from "@/lib/exporters";
import { revision, type RevisionKey } from "@/lib/revisions";

export function useExportSheet() {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, props: { isOpen, close } };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "retent";

export function ExportSheet({
  isOpen, close, analysis, sim, draftKey,
}: { isOpen: boolean; close: () => void; analysis: Analysis; sim: Simulation | null; draftKey: RevisionKey | null }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Remember what opened the sheet so focus can go back there.
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("[data-export-item]")?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [isOpen, close]);

  const base = slug(analysis.meta.title);
  const draftName = draftKey ? revision(draftKey).name : "White";
  const items = [
    {
      icon: Clapperboard, title: "Timeline markers for DaVinci Resolve",
      body: "EDL markers at every drop, colored by severity. Timeline → Import → Timeline Markers from EDL.",
      file: ".edl",
      run: () => download(`${base}-markers.edl`, markersEdl(analysis)),
    },
    {
      icon: FileText, title: `${draftName} revision script`,
      body: sim ? "The edited script with * on every changed line, ready for the shoot or the editor." : "Apply fixes first to export a revision; this exports the White draft.",
      file: ".txt",
      run: () => download(`${base}-${draftName.toLowerCase()}.txt`, revisedScript(analysis, sim, draftName)),
    },
    {
      icon: ListOrdered, title: "YouTube chapters",
      body: "Chapter lines to paste into the description, from the detected sections.",
      file: ".txt",
      run: () => download(`${base}-chapters.txt`, youtubeChapters(analysis)),
    },
    {
      icon: FileSpreadsheet, title: "Drops and fixes",
      body: "Every flag with timing, severity, viewers lost and the fix's simulated gain.",
      file: ".csv",
      run: () => download(`${base}-drops.csv`, flagsCsv(analysis), "text/csv"),
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div aria-hidden className="fixed inset-0 z-30" onClick={close} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="false"
            aria-labelledby="export-title"
            initial={{ opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.985 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-[92px] right-6 z-40 w-[min(400px,calc(100vw-48px))] origin-top-right rounded-panel border border-line bg-surface p-1.5 shadow-overlay"
          >
            <div className="flex items-center justify-between gap-3 py-1.5 pr-1 pl-3">
              <h2 id="export-title" className="panel-title">
                Export for your editor
              </h2>
              <Button variant="ghost" size="sm" icon onClick={close} aria-label="Close export">
                <X size={15} aria-hidden />
              </Button>
            </div>
            <ul className="flex flex-col">
              {items.map(({ icon: Icon, title, body, file, run }) => (
                <li key={title}>
                  <button
                    type="button"
                    data-export-item
                    onClick={run}
                    className="flex w-full gap-3 rounded-control px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-control border border-line bg-surface-2 text-ink-2">
                      <Icon size={16} strokeWidth={1.7} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13.5px] font-[600] text-ink">{title}</span>
                        <span className="tc shrink-0 text-[11px] text-ink-3">{file}</span>
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
