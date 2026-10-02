"use client";

import { Clapperboard, FileSpreadsheet, FileText, ListOrdered, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

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
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const base = slug(analysis.meta.title);
  const draftName = draftKey ? revision(draftKey).name : "White";
  const items = [
    {
      icon: Clapperboard, title: "Timeline markers for DaVinci Resolve",
      body: "EDL markers at every drop, colored by severity. Timeline → Import → Timeline Markers from EDL.",
      run: () => download(`${base}-markers.edl`, markersEdl(analysis)),
    },
    {
      icon: FileText, title: `${draftName} revision script`,
      body: sim ? "The edited script with * on every changed line, ready for the shoot or the editor." : "Apply fixes first to export a revision; this exports the White draft.",
      run: () => download(`${base}-${draftName.toLowerCase()}.txt`, revisedScript(analysis, sim, draftName)),
    },
    {
      icon: ListOrdered, title: "YouTube chapters",
      body: "Chapter lines to paste into the description, from the detected sections.",
      run: () => download(`${base}-chapters.txt`, youtubeChapters(analysis)),
    },
    {
      icon: FileSpreadsheet, title: "Drops and fixes (CSV)",
      body: "Every flag with timing, severity, viewers lost and the fix's simulated gain.",
      run: () => download(`${base}-drops.csv`, flagsCsv(analysis), "text/csv"),
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-label="Export"
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-[64px] right-6 z-40 w-[380px] rounded-[9px] border border-rule bg-paper-raised p-2 shadow-[0_18px_50px_-18px_rgb(23_23_26/0.35)]"
        >
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <h2 className="text-[14px] font-[640]">Hand it to your editor</h2>
            <button onClick={close} aria-label="Close export" className="rounded-[5px] p-1 text-ink-3 hover:bg-paper-sunk hover:text-ink">
              <X size={16} />
            </button>
          </div>
          <ul>
            {items.map(({ icon: Icon, title, body, run }) => (
              <li key={title}>
                <button
                  onClick={run}
                  className="flex w-full gap-3 rounded-[7px] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-paper-sunk"
                >
                  <Icon size={18} strokeWidth={1.6} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
                  <span>
                    <span className="block text-[13.5px] font-[600] text-ink">{title}</span>
                    <span className="block text-[12.5px] leading-snug text-ink-3">{body}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
