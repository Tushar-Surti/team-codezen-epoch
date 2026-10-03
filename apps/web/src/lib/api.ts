import type { Analysis, AnalyzeRequest, JobAccepted, Simulation, StageEvent } from "./contract.gen";
import type { Explanation } from "./eval";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type AnalysisSummary = {
  id: string;
  title: string;
  category: string;
  language: string;
  input_mode: string;
  duration_seconds: number;
  intro_retention: number;
  apv: number;
  flags: number;
  worst_flag: string | null;
  synthetic: boolean;
  origin: "user" | "fixture";
  created_at: string;
  has_actual: boolean;
};

export type ActualCurve = {
  source: string;
  points: { start_time: number; end_time: number; value: number }[];
  /** Where our prediction and this curve agree and differ, and why. */
  explain?: Explanation;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  list: () => fetch(`${API_URL}/api/analyses`).then((r) => json<AnalysisSummary[]>(r)),
  get: (id: string) => fetch(`${API_URL}/api/analyses/${id}`).then((r) => json<Analysis>(r)),
  actual: (id: string) => fetch(`${API_URL}/api/analyses/${id}/actual`).then((r) => json<ActualCurve>(r)),
  simulate: (analysisId: string, fixIds: string[]) =>
    fetch(`${API_URL}/api/simulate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysis_id: analysisId, fix_ids: fixIds }),
    }).then((r) => json<Simulation>(r)),
  analyze: (req: Partial<AnalyzeRequest> & Pick<AnalyzeRequest, "title" | "category">) =>
    fetch(`${API_URL}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }).then((r) => json<JobAccepted>(r)),
  upload: (form: FormData, onProgress: (fraction: number) => void) =>
    new Promise<JobAccepted>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/api/analyze/upload`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let body: { detail?: string } & Partial<JobAccepted> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON error */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as JobAccepted);
        else reject(new Error(body.detail ?? `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Upload failed: is the API running?"));
      xhr.send(form);
    }),
  mediaUrl: (analysisId: string) => `${API_URL}/api/media/${analysisId}`,
  events: (jobId: string, onStage: (ev: StageEvent) => void, onEnd: (error: string | null) => void) => {
    const es = new EventSource(`${API_URL}/api/jobs/${jobId}/events`);
    es.addEventListener("stage", (e) => onStage(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("end", (e) => {
      es.close();
      onEnd(JSON.parse((e as MessageEvent).data).error ?? null);
    });
    es.onerror = () => {
      es.close();
      onEnd("Lost connection to the analysis service.");
    };
    return () => es.close();
  },
};
