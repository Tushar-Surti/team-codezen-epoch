/** The WGA revision-color sequence. White is the original draft; each revision takes the next color. */
export const REVISIONS = [
  { key: "white", name: "White", ink: "var(--ink)", paper: "transparent" },
  { key: "blue", name: "Blue", ink: "var(--rev-blue)", paper: "var(--rev-blue-paper)" },
  { key: "pink", name: "Pink", ink: "var(--rev-pink)", paper: "var(--rev-pink-paper)" },
  { key: "gold", name: "Goldenrod", ink: "var(--rev-gold)", paper: "var(--rev-gold-paper)" },
  { key: "green", name: "Green", ink: "var(--rev-green)", paper: "var(--rev-green-paper)" },
] as const;

export type RevisionKey = (typeof REVISIONS)[number]["key"];

export function revision(key: RevisionKey) {
  return REVISIONS.find((r) => r.key === key)!;
}

export const SEVERITY_COLOR = ["", "var(--sev-1)", "var(--sev-2)", "var(--sev-3)", "var(--sev-4)", "var(--sev-5)"];
