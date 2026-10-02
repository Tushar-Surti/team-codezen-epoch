"""In-process analysis jobs with stage-by-stage progress events (streamed to the UI over SSE)."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable

from retent_core.contract import Provenance, Stage, StageEvent

Emit = Callable[[Stage, str, str, float, Provenance | None], Awaitable[None]]


class Job:
    def __init__(self, analysis_id: str):
        self.id = uuid.uuid4().hex[:12]
        self.analysis_id = analysis_id
        self.events: list[StageEvent] = []
        self.done = False
        self.error: str | None = None
        self._cond = asyncio.Condition()

    async def emit(self, stage: Stage, status: str, message: str, progress: float = 0.0,
                   provenance: Provenance | None = None) -> None:
        async with self._cond:
            self.events.append(StageEvent(job_id=self.id, stage=stage, status=status, message=message,
                                          progress=progress, provenance=provenance))
            self._cond.notify_all()

    async def finish(self, error: str | None = None) -> None:
        async with self._cond:
            self.done, self.error = True, error
            self._cond.notify_all()

    async def stream(self) -> AsyncIterator[StageEvent]:
        sent = 0
        while True:
            async with self._cond:
                while sent >= len(self.events) and not self.done:
                    await self._cond.wait()
                pending = self.events[sent:]
                finished = self.done
            for ev in pending:
                yield ev
            sent += len(pending)
            if finished and sent >= len(self.events):
                return


class Jobs:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}

    def create(self, analysis_id: str) -> Job:
        job = Job(analysis_id)
        self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)
