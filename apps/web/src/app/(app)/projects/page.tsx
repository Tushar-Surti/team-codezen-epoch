"use client";

import { useQuery } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";
import Link from "next/link";

import { api } from "@/lib/api";
import { CATEGORY_LABEL, LANGUAGE_LABEL, MODE_LABEL, fmtTime, pct } from "@/lib/format";

export default function ProjectsPage() {
  const { data, error, isLoading } = useQuery({ queryKey: ["analyses"], queryFn: api.list });
  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-end justify-between gap-6 border-b border-rule px-8 pt-8 pb-5">
        <div>
          <h1 className="text-[26px] leading-tight font-[650] wdth-wide">Scripts</h1>
          <p className="mt-1 text-[14px] text-ink-2">Every script and cut you’ve run through Retent AI, worst drop first.</p>
        </div>
        <Link
          href="/new"
          className="inline-flex items-center gap-2 rounded-[7px] bg-ink px-4 py-2 text-[14px] font-[600] text-paper transition-colors duration-200 hover:bg-primary-hover"
        >
          <FilePlus2 size={16} aria-hidden /> New analysis
        </Link>
      </header>
      <div className="px-8 py-6">
        {isLoading && <p className="text-[14px] text-ink-3">Loading scripts…</p>}
        {error && (
          <p className="text-[14px] text-pen-text">
            Couldn’t reach the API. Start it with <code className="font-script">pnpm dev:api</code> and reload.
          </p>
        )}
        {data && (
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-rule-strong text-[12.5px] text-ink-3">
                <th className="py-2 pr-4 font-[560]">Title</th>
                <th className="py-2 pr-4 font-[560]">Type</th>
                <th className="py-2 pr-4 text-right font-[560]">Length</th>
                <th className="py-2 pr-4 text-right font-[560]">Intro</th>
                <th className="py-2 pr-4 text-right font-[560]">APV</th>
                <th className="py-2 font-[560]">Biggest drop</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="group border-b border-rule transition-colors duration-150 hover:bg-paper-sunk/60">
                  <td className="max-w-[420px] py-3 pr-4">
                    <Link href={`/a/${r.id}`} className="block truncate font-[600] text-ink group-hover:underline" title={r.title}>
                      {r.title}
                    </Link>
                    <span className="text-[12px] text-ink-3">
                      {MODE_LABEL[r.input_mode]}
                      {r.synthetic && " · development data"}
                      {r.has_actual && " · has actual curve"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-ink-2">
                    {CATEGORY_LABEL[r.category]} · {LANGUAGE_LABEL[r.language]}
                  </td>
                  <td className="tnum py-3 pr-4 text-right text-ink-2">{fmtTime(r.duration_seconds)}</td>
                  <td className="tnum py-3 pr-4 text-right">{pct(r.intro_retention)}</td>
                  <td className="tnum py-3 pr-4 text-right">{pct(r.apv)}</td>
                  <td className="max-w-[320px] truncate py-3 text-pen-text">{r.worst_flag ?? <span className="text-ink-3">None above noise</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
