"""Share collected data through the team's private Hugging Face dataset repo.

Each machine collects from its own connection (YouTube rate-limits per IP), pushes its records,
and pulls everyone else's before training. Only JSON records are shared: D1 (metadata, "Most
replayed", captions), D2 digitized curves with their source URLs, D3 SponsorBlock segments, and the
probe log so nobody re-probes the same videos. Media files and screenshot images stay local.

Needs in .env:  HF_TOKEN=hf_...   RETENT_HF_DATASET=<org-or-user>/retent-data

Run:
  uv run --package retent-ml python -m retent_ml.hub push
  uv run --package retent-ml python -m retent_ml.hub pull
"""

from __future__ import annotations

import argparse
import os
import socket

from dotenv import load_dotenv

from retent_ml.collect import ROOT

RAW = ROOT / "data" / "raw"
PATTERNS = ["d1/*.json", "d2/*.json", "d3/*.json"]


def _config() -> tuple[str, str]:
    load_dotenv(ROOT / ".env")
    token, repo = os.environ.get("HF_TOKEN"), os.environ.get("RETENT_HF_DATASET")
    if not token or not repo:
        raise SystemExit("Set HF_TOKEN and RETENT_HF_DATASET in .env first.")
    return token, repo


def push() -> None:
    from huggingface_hub import HfApi

    token, repo = _config()
    api = HfApi(token=token)
    api.create_repo(repo, repo_type="dataset", private=True, exist_ok=True)
    # Probe logs are per machine so concurrent pushes never overwrite each other.
    log = RAW / "d1" / "_probed.jsonl"
    if log.exists():
        api.upload_file(path_or_fileobj=str(log), path_in_repo=f"probed/{socket.gethostname()}.jsonl",
                        repo_id=repo, repo_type="dataset")
    api.upload_folder(folder_path=str(RAW), repo_id=repo, repo_type="dataset", allow_patterns=PATTERNS,
                      commit_message=f"records from {socket.gethostname()}")
    print(f"pushed data/raw → {repo}")


def pull() -> None:
    from huggingface_hub import snapshot_download

    token, repo = _config()
    path = snapshot_download(repo, repo_type="dataset", token=token, local_dir=str(RAW),
                             allow_patterns=PATTERNS + ["probed/*.jsonl"])
    # Merge other machines' probe logs into ours so the collector skips their videos too.
    log = RAW / "d1" / "_probed.jsonl"
    log.parent.mkdir(parents=True, exist_ok=True)
    seen = set(log.read_text(encoding="utf-8").splitlines()) if log.exists() else set()
    added = 0
    with log.open("a", encoding="utf-8") as out:
        for other in (RAW / "probed").glob("*.jsonl"):
            if other.stem == socket.gethostname():
                continue
            for line in other.read_text(encoding="utf-8").splitlines():
                if line.strip() and line not in seen:
                    out.write(line + "\n")
                    seen.add(line)
                    added += 1
    print(f"pulled {repo} → {path}; merged {added} probe-log lines")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["push", "pull"])
    args = ap.parse_args()
    push() if args.action == "push" else pull()


if __name__ == "__main__":
    main()
