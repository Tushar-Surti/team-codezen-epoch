"""Semantic pass (LLM reads the script) and fix writing (LLM writes the edit text).

The semantic pass returns labels keyed by sentence id: segment roles, the hook, the title's
promises with where they are first touched and where they pay off, curiosity loops, and section
titles. These replace the keyword-cue features where available; the engine still predicts.

Fix writing fills in `new_text` for insert/rewrite ops in the script's own language and voice,
then the simulator re-scores each fix with the real text.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from retent_core.contract import EditOp, EditOpKind, Engine, Fix, Flag, Provenance
from retent_core.features import TimedSentence
from retent_core.llm import complete_json
import re

from retent_core.text import fmt_time

# "in 15 seconds", "2 minute mein", "१० सेकंड में": a timing promise the script can't back up.
TIME_PROMISE = re.compile(r"\d+\s*(seconds?|secs?|minutes?|mins?|second|minute|सेकंड|मिनट)", re.I)
_SENT = re.compile(r"(?<=[.!?।])\s+")


def _sanitize(text: str) -> str:
    """Drop sentences that promise a specific timing; keep the rest of the line."""
    parts = [p for p in _SENT.split(text.strip()) if p]
    kept = [p for p in parts if not TIME_PROMISE.search(p)]
    return " ".join(kept) if kept else text

READ_VERSION = "read-v1"
WRITE_VERSION = "write-v3"

ROLES = ["hook", "greeting", "setup", "payoff", "tangent", "sponsor", "cta", "recap", "outro", "filler"]

READ_SCHEMA = {
    "type": "object",
    "properties": {
        "spans": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "from": {"type": "string"}, "to": {"type": "string"},
                    "role": {"type": "string", "enum": ROLES},
                },
                "required": ["from", "to", "role"], "additionalProperties": False,
            },
        },
        "hook": {
            "type": "object",
            "properties": {
                "sentence_id": {"type": ["string", "null"]},
                "strength": {"type": "number"},
                "why": {"type": "string"},
            },
            "required": ["sentence_id", "strength", "why"], "additionalProperties": False,
        },
        "promises": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "source": {"type": "string", "enum": ["title", "thumbnail"]},
                    "first_touch": {"type": ["string", "null"]},
                    "payoff": {"type": ["string", "null"]},
                },
                "required": ["text", "source", "first_touch", "payoff"], "additionalProperties": False,
            },
        },
        "loops": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "open": {"type": "string"}, "close": {"type": ["string", "null"]}, "what": {"type": "string"},
                },
                "required": ["open", "close", "what"], "additionalProperties": False,
            },
        },
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"start": {"type": "string"}, "title": {"type": "string"}},
                "required": ["start", "title"], "additionalProperties": False,
            },
        },
    },
    "required": ["spans", "hook", "promises", "loops", "sections"],
    "additionalProperties": False,
}

READ_SYSTEM = """You are a senior YouTube script editor reading a creator's script line by line.
Your labels feed a retention model, so be precise and literal. Lines may be English, Hindi (Devanagari) or Hinglish.

Return JSON only, using the line ids exactly as given.
- spans: contiguous runs of lines with a non-content role. Leave ordinary content unlabeled.
  hook = the line(s) that give the viewer a concrete reason to keep watching (a stake, a question, a preview of the payoff).
  greeting = hellos, channel intros, "welcome back". setup = context before the main content starts.
  payoff = where the title's main question is actually answered (e.g. the verdict). tangent = off-topic detours.
  sponsor = paid reads. cta = like/subscribe/comment/link asks. recap = summary of what was said.
  outro = sign-off or wrap-up language. filler = lines that add nothing.
- hook: the first real hook line (null if none in the first minute), strength 0-1, and one short reason.
- promises: what the title (and thumbnail text, if given) promise the viewer. For each, the first line that addresses
  it (first_touch) and the line where it is actually delivered (payoff); null if never.
- loops: explicit teases of later content ("stay till the end", "I'll show you in a minute", "end tak dekhna") with the
  line that closes them, or null if never closed.
- sections: 3 to 8 topic sections in order, each with its first line id and a 2-4 word title in the script's language.
Do not invent lines. Prefer fewer, correct labels over many guesses."""


@dataclass
class Semantic:
    roles: dict[str, str] = field(default_factory=dict)  # sentence id → role
    hook_id: str | None = None
    hook_strength: float = 0.0
    hook_why: str = ""
    promises: list[dict] = field(default_factory=list)
    loops: list[dict] = field(default_factory=list)
    sections: list[dict] = field(default_factory=list)
    provenance: Provenance | None = None
    known_ids: set[str] | None = None  # every line the pass saw (unlabelled lines are plain content)

    def to_json(self) -> dict:
        return {"roles": self.roles, "hook_id": self.hook_id, "hook_strength": self.hook_strength,
                "hook_why": self.hook_why, "promises": self.promises, "loops": self.loops,
                "sections": self.sections, "known_ids": sorted(self.known_ids or []),
                "provenance": self.provenance.model_dump() if self.provenance else None}

    @classmethod
    def from_json(cls, d: dict) -> "Semantic":
        return cls(roles=d.get("roles", {}), hook_id=d.get("hook_id"), hook_strength=d.get("hook_strength", 0.0),
                   hook_why=d.get("hook_why", ""), promises=d.get("promises", []), loops=d.get("loops", []),
                   sections=d.get("sections", []), known_ids=set(d.get("known_ids") or []) or None,
                   provenance=Provenance(**d["provenance"]) if d.get("provenance") else None)


def _lines(sents: list[TimedSentence]) -> str:
    return "\n".join(f"{s.id} [{fmt_time(s.start)}] {s.text}" for s in sents)


def read_script(sents: list[TimedSentence], title: str, thumbnail_text: str | None, category: str,
                engine: Engine | str = Engine.auto) -> Semantic:
    user = (f"Title: {title}\nThumbnail text: {thumbnail_text or '(none)'}\nCategory: {category}\n\n"
            f"Script lines:\n{_lines(sents)}")
    data, prov = complete_json(role="read", engine=engine, system=READ_SYSTEM, user=user, schema=READ_SCHEMA,
                               prompt_version=READ_VERSION, effort="low")
    ids = [s.id for s in sents]
    pos = {sid: i for i, sid in enumerate(ids)}
    sem = Semantic(provenance=prov, known_ids=set(ids))
    for span in data.get("spans", []):
        a, b = pos.get(span["from"]), pos.get(span["to"])
        if a is None or b is None:
            continue
        for i in range(min(a, b), max(a, b) + 1):
            sem.roles[ids[i]] = span["role"]
    hook = data.get("hook") or {}
    if hook.get("sentence_id") in pos:
        sem.hook_id = hook["sentence_id"]
        sem.hook_strength = float(hook.get("strength") or 0)
        sem.hook_why = hook.get("why") or ""
        sem.roles.setdefault(sem.hook_id, "hook")
    sem.promises = [p for p in data.get("promises", [])
                    if p.get("first_touch") in (None, *pos) and p.get("payoff") in (None, *pos)]
    sem.loops = [lp for lp in data.get("loops", []) if lp.get("open") in pos and lp.get("close") in (None, *pos)]
    sem.sections = [s for s in data.get("sections", []) if s.get("start") in pos]
    return sem


# ── Fix writing ──────────────────────────────────────────────────────────────

WRITE_SCHEMA = {
    "type": "object",
    "properties": {
        "fixes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "rationale": {"type": "string"},
                    "texts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"op": {"type": "integer"}, "new_text": {"type": "string"}},
                            "required": ["op", "new_text"], "additionalProperties": False,
                        },
                    },
                },
                "required": ["id", "title", "rationale", "texts"], "additionalProperties": False,
            },
        },
    },
    "required": ["fixes"], "additionalProperties": False,
}

WRITE_SYSTEM = """You are the script doctor on a YouTube creator's team. You write the exact replacement lines
for fixes a retention model has already chosen. Rules:
- Write in the creator's own language, script and voice. If the script is Hinglish in Latin letters, write Hinglish in
  Latin letters; if it is Devanagari Hindi, write Devanagari; if English, English. Match their energy and slang.
- One or two spoken sentences per line, short enough to say in under 8 seconds. No emojis, no hashtags.
- Never invent facts, numbers, prices, results or content that are not in the script. A tease must point at something
  the script really delivers later (name it: "the low-light test", "my final pick"), never at new material.
- Never promise a timing you can't keep ("in 15 seconds", "right now") unless the answer really comes that soon.
- To close an unpaid tease, either point it at what the script actually ends with, or drop the tease.
- Titles: imperative, specific, under 8 words ("Open on the low-light verdict"). Rationale: one plain sentence, evidence first.
Return JSON only. For each fix, give text for every op index listed as needing text."""


def write_fixes(sents: list[TimedSentence], title: str, flags: list[Flag], fixes: list[Fix],
                engine: Engine | str = Engine.auto, payoff_id: str | None = None) -> tuple[list[Fix], Provenance | None]:
    """Fill in `new_text` for insert/rewrite ops. Returns updated fixes (unchanged ones pass through)."""
    by_id = {s.id: s for s in sents}
    order = [s.id for s in sents]
    flag_by_id = {f.id: f for f in flags}
    jobs = []
    for fx in fixes:
        need = [i for i, op in enumerate(fx.ops) if op.op in (EditOpKind.insert, EditOpKind.rewrite)]
        if not need:
            continue
        flag = flag_by_id.get(fx.flag_id)
        ctx_ids: list[str] = []
        for op in fx.ops:
            anchor = op.sentence_ids[0] if op.sentence_ids else (op.after_sentence_id or order[0])
            k = order.index(anchor) if anchor in order else 0
            ctx_ids += order[max(0, k - 2): k + 3]
        ctx = "\n".join(f"{i} [{fmt_time(by_id[i].start)}] {by_id[i].text}" for i in dict.fromkeys(ctx_ids))
        ops_desc = "\n".join(
            f"  op {i}: {op.op}" + (f" lines {', '.join(op.sentence_ids)}" if op.sentence_ids else "")
            + (f" after {op.after_sentence_id or 'the very start'}" if op.op == EditOpKind.insert else "")
            + (f" — intent: {op.note}" if op.note else "")
            + (" (needs text)" if i in need else "")
            for i, op in enumerate(fx.ops))
        jobs.append(f"Fix {fx.id} for flag \"{flag.title if flag else fx.flag_id}\": {flag.detail if flag else ''}\n"
                    f"Current fix title: {fx.title}\nOps:\n{ops_desc}\nContext lines:\n{ctx}")
    if not jobs:
        return fixes, None
    voice = "\n".join(s.text for s in sents[:14])
    payoff = by_id.get(payoff_id or "")
    facts = (f"The title's answer is delivered at {fmt_time(payoff.start)} of {fmt_time(sents[-1].end)}: "
             f"\u201c{payoff.text}\u201d. Any tease must say the answer comes later (e.g. by the end), never sooner.\n\n"
             if payoff else "")
    user = (f"Video title: {title}\n\nHow the creator talks (opening lines):\n{voice}\n\n{facts}"
            f"Fixes to write:\n\n" + "\n\n".join(jobs))
    data, prov = complete_json(role="write", engine=engine, system=WRITE_SYSTEM, user=user, schema=WRITE_SCHEMA,
                               prompt_version=WRITE_VERSION, effort="medium")
    written = {f["id"]: f for f in data.get("fixes", [])}
    out: list[Fix] = []
    for fx in fixes:
        w = written.get(fx.id)
        if not w:
            out.append(fx)
            continue
        texts = {t["op"]: _sanitize(t["new_text"]) for t in w.get("texts", []) if t.get("new_text", "").strip()}
        ops = [EditOp(**{**op.model_dump(), "new_text": texts.get(i, op.new_text)}) for i, op in enumerate(fx.ops)]
        out.append(fx.model_copy(update={"ops": ops, "title": w.get("title") or fx.title,
                                         "rationale": w.get("rationale") or fx.rationale, "provenance": prov}))
    return out, prov
