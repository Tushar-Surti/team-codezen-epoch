"""Groq client behaviour without the network: parsing, JSON mode, and backoff on 429."""

import httpx
import pytest

from retent_core import groq


class FakeResponse:
    def __init__(self, status: int, body: dict, headers: dict | None = None):
        self.status_code, self._body, self.headers = status, body, headers or {}
        self.text = str(body)

    def json(self):
        return self._body


@pytest.fixture(autouse=True)
def key(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test")
    monkeypatch.setattr(groq.time, "sleep", lambda s: None)


def test_transcribe_parses_segments(monkeypatch, tmp_path):
    audio = tmp_path / "a.webm"
    audio.write_bytes(b"x")
    calls = []

    def fake_post(url, **kw):
        calls.append(kw["data"])
        return FakeResponse(200, {"segments": [{"start": 0, "end": 2.5, "text": " Hello "}, {"start": 2.5, "end": 3, "text": " "}]})

    monkeypatch.setattr(httpx, "post", fake_post)
    assert groq.transcribe(audio, "hi") == [{"start": 0.0, "end": 2.5, "text": "Hello"}]
    assert calls[0]["language"] == "hi" and calls[0]["response_format"] == "verbose_json"


def test_backoff_then_success(monkeypatch):
    responses = iter([FakeResponse(429, {}, {"retry-after": "1"}), FakeResponse(503, {}),
                      FakeResponse(200, {"choices": [{"message": {"content": '{"ok": true}'}}]})])
    monkeypatch.setattr(httpx, "post", lambda url, **kw: next(responses))
    assert groq.chat_json([{"role": "user", "content": "hi"}]) == {"ok": True}


def test_errors_surface(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda url, **kw: FakeResponse(400, {"error": "bad"}))
    with pytest.raises(groq.GroqError):
        groq.chat_json([{"role": "user", "content": "hi"}])
    monkeypatch.setattr(httpx, "post", lambda url, **kw: FakeResponse(200, {"choices": [{"message": {"content": "nope"}}]}))
    with pytest.raises(groq.GroqError):
        groq.chat_json([{"role": "user", "content": "hi"}])


def test_missing_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY")
    assert not groq.available()
    with pytest.raises(groq.GroqError):
        groq.chat_json([])
