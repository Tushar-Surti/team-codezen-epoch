"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FilePlus2, FolderOpen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, Button, Panel, Segmented } from "@/components/ui";
import { type AnalysisSummary, api } from "@/lib/api";
import { CATEGORY_LABEL, LANGUAGE_LABEL, MODE_LABEL, fmtTime, pct } from "@/lib/format";

const SAMPLE = "sample-hinglish-tech";
type Filter = "all" | "user" | "fixture";

/** A value with a thin bar behind it, so a column of percentages scans at a glance. */
function Meter({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center justify-end gap-2.5">
      <span aria-hidden className="h-[3px] w-10 overflow-hidden rounded-full bg-surface-2">
        <span className="block h-full rounded-full bg-ink-3" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </span>
      <span className="tnum w-10 text-right">{pct(value)}</span>
    </span>
  );
}

function Row({ r }: { r: AnalysisSummary }) {
  return (
    <tr className="group border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-surface-2/60">
      <td className="max-w-[440px] py-3 pr-4 pl-5">
        <Link href={`/a/${r.id}`} className="block truncate font-[500] text-ink group-hover:underline" title={r.title}>
          {r.title}
        </Link>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          {MODE_LABEL[r.input_mode] ?? r.input_mode}
          {r.origin === "fixture" && <Badge size="xs">Sample</Badge>}
          {r.synthetic && (
            <Badge tone="warn" size="xs">
              Development data
            </Badge>
          )}
          {r.has_actual && (
            <Badge tone="ai" size="xs">
              Has YouTube curve
            </Badge>
          )}
        </span>
      </td>
      <td className="py-3 pr-4 whitespace-nowrap text-ink-2">
        {CATEGORY_LABEL[r.category] ?? r.category}
        <span className="block text-[12px] text-ink-3">{LANGUAGE_LABEL[r.language] ?? r.language}</span>
      </td>
      <td className="tc py-3 pr-4 text-right whitespace-nowrap text-ink-2">{fmtTime(r.duration_seconds)}</td>
      <td className="py-3 pr-4 text-right whitespace-nowrap">
        <Meter value={r.intro_retention} />
      </td>
      <td className="py-3 pr-4 text-right whitespace-nowrap">
        <Meter value={r.apv} />
      </td>
      <td className="max-w-[300px] py-3 pr-5">
        {r.worst_flag ? (
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-drop" />
            <span className="truncate text-drop-text" title={r.worst_flag}>
              {r.worst_flag}
            </span>
          </span>
        ) : (
          <span className="text-ink-3">None above noise</span>
        )}
        {r.flags > 1 && <span className="mt-0.5 block pl-[15px] text-[12px] text-ink-3">{r.flags - 1} more flagged</span>}
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <tr key={i} className="border-b border-line last:border-b-0">
          <td className="py-3.5 pr-4 pl-5">
            <span className="block h-3.5 w-3/4 animate-pulse rounded bg-surface-2" />
            <span className="mt-2 block h-3 w-24 animate-pulse rounded bg-surface-2" />
          </td>
          {[0, 1, 2, 3, 4].map((c) => (
            <td key={c} className="py-3.5 pr-4">
              <span className="ml-auto block h-3.5 w-14 animate-pulse rounded bg-surface-2" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function ProjectsPage() {
  const { data, error, isLoading, refetch, isRefetching } = useQuery({ queryKey: ["analyses"], queryFn: api.list });
  const [filter, setFilter] = useState<Filter>("all");

  const rows = data?.filter((r) => filter === "all" || r.origin === filter) ?? [];
  const counts = { user: data?.filter((r) => r.origin === "user").length ?? 0, fixture: data?.filter((r) => r.origin === "fixture").length ?? 0 };

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="Projects"
        description="Every script, rough cut and published video you’ve run through Retent AI."
        actions={
          <>
            <Button href={`/a/${SAMPLE}`} variant="secondary">
              Open the sample
            </Button>
            <Button href="/new">
              <FilePlus2 size={16} aria-hidden /> New analysis
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 px-8 py-6 compact:px-6">
        {data && data.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<Filter>
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: `All · ${data.length}` },
                { value: "user", label: `Yours · ${counts.user}` },
                { value: "fixture", label: `Samples · ${counts.fixture}` },
              ]}
            />
            <p className="text-[12.5px] text-ink-3">Intro is retention at 0:30. APV is average percentage viewed.</p>
          </div>
        )}

        {error ? (
          <Panel className="flex flex-col items-start gap-3" role="alert">
            <span className="flex items-center gap-2 text-[15px] font-[600]">
              <AlertTriangle size={17} className="text-drop" aria-hidden /> Couldn’t reach the API
            </span>
            <p className="max-w-[64ch] text-[13.5px] text-ink-2">
              Start it with <code className="tc rounded bg-surface-2 px-1.5 py-0.5 text-[12.5px]">pnpm dev:api</code>, then try again.{" "}
              <span className="text-ink-3">({(error as Error).message})</span>
            </p>
            <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isRefetching}>
              Try again
            </Button>
          </Panel>
        ) : data && data.length === 0 ? (
          <Panel className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-3">
              <FolderOpen size={19} aria-hidden />
            </span>
            <p className="text-[16px] font-[600]">No analyses yet</p>
            <p className="max-w-[48ch] text-[13.5px] text-ink-2">
              Paste a script, drop in a rough cut or link a published video. The first prediction takes under a minute.
            </p>
            <Button href="/new" className="mt-1">
              <FilePlus2 size={16} aria-hidden /> Analyze your first script
            </Button>
          </Panel>
        ) : (
          <Panel padded={false} className="overflow-x-auto" aria-label="Analyses">
            <table className="w-full min-w-[860px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line">
                  {["Title", "Type", "Length", "Intro", "APV", "Biggest drop"].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`eyebrow py-2.5 pr-4 font-[500] ${i === 0 ? "pl-5" : ""} ${i >= 2 && i <= 4 ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <SkeletonRows /> : rows.map((r) => <Row key={r.id} r={r} />)}
                {data && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-ink-3">
                      Nothing here yet. Your own analyses show up in this list once you run one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </div>
  );
}
