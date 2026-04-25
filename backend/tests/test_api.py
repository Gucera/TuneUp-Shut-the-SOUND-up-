import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import supabase as supabase_pkg
from fastapi.testclient import TestClient


class DummyStorageBucket:
    def upload(self, *args, **kwargs):
        return None

    def get_public_url(self, storage_path: str):
        return f"https://storage.example/{storage_path}"

    def remove(self, items):
        return items


class DummyStorage:
    def get_bucket(self, name: str):
        return {"name": name}

    def create_bucket(self, name: str, options=None):
        return {"name": name, "options": options or {}}

    def from_(self, name: str):
        return DummyStorageBucket()


class DummyQuery:
    def __init__(self, client: "DummySupabase", table_name: str):
        self.client = client
        self.table_name = table_name
        self.operation = "select"
        self.payload = None

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def upsert(self, payload, **_kwargs):
        self.operation = "upsert"
        self.payload = payload
        return self

    def execute(self):
        handler = self.client.handlers.get((self.table_name, self.operation))
        if handler:
            return handler(self)
        return SimpleNamespace(data=[])


class DummySupabase:
    def __init__(self):
        self.handlers = {}
        self.storage = DummyStorage()

    def table(self, table_name: str):
        return DummyQuery(self, table_name)


@pytest.fixture()
def backend_module(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "service-key")

    dummy_supabase = DummySupabase()
    monkeypatch.setattr(supabase_pkg, "create_client", lambda *_args, **_kwargs: dummy_supabase)

    sys.modules.pop("main", None)
    backend_main = importlib.import_module("main")
    backend_main.supabase = dummy_supabase

    return backend_main


@pytest.fixture()
def client(backend_module):
    with TestClient(backend_module.app) as test_client:
        yield test_client


def test_healthz_returns_ok(client, backend_module):
    backend_module.supabase.handlers[("tracks", "select")] = lambda _query: SimpleNamespace(
        data=[{"id": "track-1"}]
    )

    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "storage": "supabase",
        "supabase_configured": True,
        "supabase_connected": True,
    }


def test_recommend_song_returns_standardized_not_found(client):
    response = client.post("/recommend", json={"mood": "Unknown"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "recommendation_not_found"


def test_detect_pitch_returns_signal_too_short(client, backend_module, monkeypatch):
    monkeypatch.setattr(backend_module, "save_upload", lambda _file: Path("/tmp/fake.wav"))
    monkeypatch.setattr(backend_module, "remove_file", lambda _path: None)
    monkeypatch.setattr(
        backend_module.librosa, "load", lambda *_args, **_kwargs: (np.zeros(1024), 22050)
    )
    monkeypatch.setattr(
        backend_module.librosa.effects, "trim", lambda signal, **_kwargs: (signal, None)
    )

    response = client.post(
        "/detect-pitch",
        files={"file": ("short.wav", b"audio", "audio/wav")},
        data={"instrument": "Guitar"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "signal_too_short"


def test_detect_pitch_returns_frequency_on_success(client, backend_module, monkeypatch):
    monkeypatch.setattr(backend_module, "save_upload", lambda _file: Path("/tmp/fake.wav"))
    monkeypatch.setattr(backend_module, "remove_file", lambda _path: None)
    monkeypatch.setattr(
        backend_module.librosa, "load", lambda *_args, **_kwargs: (np.ones(4096), 22050)
    )
    monkeypatch.setattr(
        backend_module.librosa.effects, "trim", lambda signal, **_kwargs: (signal, None)
    )
    monkeypatch.setattr(
        backend_module.librosa,
        "yin",
        lambda *_args, **_kwargs: np.array([110.0, 110.4, 109.8, np.nan, 110.2]),
    )

    response = client.post(
        "/detect-pitch",
        files={"file": ("note.wav", b"audio", "audio/wav")},
        data={"instrument": "Bass"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["frequency"] == pytest.approx(110.2, abs=0.5)


def test_save_traffic_persists_track_and_markers(client, backend_module, monkeypatch):
    inserted_marker_rows = []

    monkeypatch.setattr(
        backend_module, "insert_track", lambda payload: {"id": "track-1", **payload}
    )
    backend_module.supabase.handlers[("track_markers", "insert")] = (
        lambda query: inserted_marker_rows.extend(query.payload)
        or SimpleNamespace(data=query.payload)
    )

    response = client.post(
        "/save-traffic",
        json={
            "song_name": "Test Song",
            "duration": 123.4,
            "user_id": None,
            "markers": [
                {"id": 1, "label": "VERSE", "color": "#ffffff", "x": 42.0},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert response.json()["track_id"] == "track-1"
    assert inserted_marker_rows[0]["track_id"] == "track-1"


def test_get_traffic_rejects_invalid_user_id(client):
    response = client.get("/get-traffic", params={"user_id": "not-a-uuid"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_user_id"


def test_task_status_returns_timed_out_payload(client, backend_module, monkeypatch):
    monkeypatch.setattr(
        backend_module,
        "fetch_analysis_job",
        lambda _task_id: {
            "status": "timed_out",
            "progress_text": "Analysis timed out.",
            "error_message": "The scan timed out.",
            "updated_at": "2026-04-01T12:00:00Z",
        },
    )

    response = client.get("/task-status/550e8400-e29b-41d4-a716-446655440000")

    assert response.status_code == 200
    assert response.json()["status"] == "timed_out"
    assert response.json()["message"] == "The scan timed out."


def test_analyze_full_returns_timeout_error_envelope(client, backend_module, monkeypatch):
    monkeypatch.setattr(backend_module, "save_upload", lambda _file: Path("/tmp/fake.wav"))
    monkeypatch.setattr(backend_module, "remove_file", lambda _path: None)
    monkeypatch.setattr(
        backend_module,
        "run_with_timeout",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            TimeoutError("The analysis job exceeded the synchronous time limit.")
        ),
    )

    response = client.post(
        "/analyze-full",
        files={"file": ("analysis.wav", b"audio", "audio/wav")},
    )

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "analysis_timed_out"
