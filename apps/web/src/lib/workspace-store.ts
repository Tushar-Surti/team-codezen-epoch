"use client";

import { create } from "zustand";

import type { Simulation } from "./contract.gen";
import { REVISIONS, type RevisionKey } from "./revisions";

export type Draft = {
  key: RevisionKey;
  fixIds: string[];
  simulation: Simulation | null;
  status: "idle" | "simulating" | "error";
  error?: string;
};

type WorkspaceState = {
  analysisId: string | null;
  playhead: number;
  hoverTime: number | null;
  selectedFlagId: string | null;
  drafts: Draft[];
  activeDraft: RevisionKey;
  reset: (analysisId: string) => void;
  setPlayhead: (t: number) => void;
  setHoverTime: (t: number | null) => void;
  selectFlag: (id: string | null) => void;
  setActiveDraft: (key: RevisionKey) => void;
  /** Toggle a fix in the working revision (creates the first revision if only White exists). */
  toggleFix: (fixId: string) => RevisionKey;
  newRevision: () => RevisionKey | null;
  setSimulation: (key: RevisionKey, sim: Simulation | null, status: Draft["status"], error?: string) => void;
};

const WHITE: Draft = { key: "white", fixIds: [], simulation: null, status: "idle" };

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  analysisId: null,
  playhead: 0,
  hoverTime: null,
  selectedFlagId: null,
  drafts: [WHITE],
  activeDraft: "white",
  reset: (analysisId) =>
    set({ analysisId, playhead: 0, hoverTime: null, selectedFlagId: null, drafts: [WHITE], activeDraft: "white" }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setHoverTime: (t) => set({ hoverTime: t }),
  selectFlag: (id) => set({ selectedFlagId: id }),
  setActiveDraft: (key) => set({ activeDraft: key }),
  toggleFix: (fixId) => {
    const { drafts, activeDraft } = get();
    let working = drafts.find((d) => d.key === activeDraft && d.key !== "white");
    let next = drafts;
    if (!working) {
      // Editing the White draft starts the next revision color.
      const last = drafts[drafts.length - 1];
      const key = REVISIONS[Math.min(REVISIONS.length - 1, drafts.length)].key;
      working = { key, fixIds: [...last.fixIds], simulation: null, status: "idle" };
      next = [...drafts, working];
    }
    const has = working.fixIds.includes(fixId);
    const updated: Draft = {
      ...working,
      fixIds: has ? working.fixIds.filter((f) => f !== fixId) : [...working.fixIds, fixId],
    };
    set({ drafts: next.map((d) => (d.key === updated.key ? updated : d)), activeDraft: updated.key });
    return updated.key;
  },
  newRevision: () => {
    const { drafts } = get();
    if (drafts.length >= REVISIONS.length) return null;
    const last = drafts[drafts.length - 1];
    const key = REVISIONS[drafts.length].key;
    set({
      drafts: [...drafts, { key, fixIds: [...last.fixIds], simulation: last.simulation, status: "idle" }],
      activeDraft: key,
    });
    return key;
  },
  setSimulation: (key, sim, status, error) =>
    set({ drafts: get().drafts.map((d) => (d.key === key ? { ...d, simulation: sim, status, error } : d)) }),
}));
