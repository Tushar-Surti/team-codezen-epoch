import type { Analysis, Simulation } from "./contract.gen";
import { fmtTime } from "./format";

function tc(seconds: number, fps = 30, hourOffset = 1): string {
  const total = Math.max(0, Math.round(seconds * fps)) + hourOffset * 3600 * fps;
  const f = total % fps;
  const s = Math.floor(total / fps);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`;
}

/** DaVinci Resolve: Timeline → Import → Timeline Markers from EDL (timeline starts at 01:00:00:00). */
export function markersEdl(a: Analysis, fps = 30): string {
  const lines = [`TITLE: ${a.meta.title.slice(0, 60)} (Retent AI)`, "FCM: NON-DROP FRAME", ""];
  a.flags.forEach((f, i) => {
    const n = String(i + 1).padStart(3, "0");
    const start = tc(f.start, fps);
    const end = tc(f.start + 1 / fps, fps);
    const fix = a.fixes.find((x) => x.flag_id === f.id);
    const color = f.severity >= 4 ? "ResolveColorRed" : f.severity >= 3 ? "ResolveColorOrange" : "ResolveColorYellow";
    const name = `${f.title}${fix ? ` → ${fix.title}` : ""}`.replace(/\|/g, "/");
    const dur = Math.max(1, Math.round((f.end - f.start) * fps));
    lines.push(`${n}  001      V     C        ${start} ${end} ${start} ${end}  `);
    lines.push(` |C:${color} |M:${name} |D:${dur}`);
    lines.push("");
  });
  return lines.join("\n");
}

export function flagsCsv(a: Analysis): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["start", "end", "severity", "viewers_lost_per_1000", "flag", "fix", "gain_viewers_at_payoff", "gain_intro_pts"]];
  for (const f of a.flags) {
    const fix = a.fixes.find((x) => x.flag_id === f.id);
    rows.push([
      fmtTime(f.start), fmtTime(f.end), String(f.severity), String(f.viewers_lost), f.title, fix?.title ?? "",
      fix?.delta?.viewers_at_payoff != null ? String(fix.delta.viewers_at_payoff) : "",
      fix?.delta ? (fix.delta.intro_retention * 100).toFixed(1) : "",
    ]);
  }
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

/** YouTube chapters: first must be 0:00, at least three, each ≥ 10 s. */
export function youtubeChapters(a: Analysis): string {
  const chapters = a.sections.filter((s) => s.kind === "chapter");
  const src = chapters.length >= 3 ? chapters : a.sections;
  const rows = src
    .filter((s, i) => i === 0 || s.end - s.start >= 10)
    .map((s, i) => `${fmtTime(i === 0 ? 0 : s.start)} ${s.title.replace(/ · /g, " & ")}`);
  return rows.join("\n");
}

export function revisedScript(a: Analysis, sim: Simulation | null, draftName: string): string {
  if (!sim) return a.sentences.map((s) => s.text).join("\n");
  const original = new Map(a.sentences.map((s) => [s.id, s.text]));
  const header = `${a.meta.title}\n${draftName.toUpperCase()} REVISION (Retent AI). Lines marked * changed.\n\n`;
  return header + sim.sentences.map((s) => `${original.get(s.id) === s.text ? "  " : "* "}${s.text}`).join("\n");
}

export function download(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
