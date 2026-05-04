import importlib
import re
import sys
from datetime import datetime, timedelta, timezone
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
    monkeypatch.setenv("SUPABASE_AUDIO_BUCKET", "audio-uploads")
    monkeypatch.setenv("SUPABASE_AUDIO_PREFIX", "analysis")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:8081,http://localhost:19006")

    dummy_supabase = DummySupabase()
    monkeypatch.setattr(supabase_pkg, "create_client", lambda *_args, **_kwargs: dummy_supabase)

    sys.modules.pop("config", None)
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


def test_health_returns_process_liveness_without_secrets(client):
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "tuneup-backend"
    assert body["version"] == "unknown"
    assert body["environment"] == "development"
    assert "timestamp" in body

    serialized = str(body)
    assert "service-key" not in serialized
    assert "SUPABASE_KEY" not in serialized
    assert "SUPABASE_URL" not in serialized


def test_ready_returns_safe_readiness_structure(client):
    response = client.get("/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"] == {
        "config": "ok",
        "supabase": "skipped",
        "storage": "skipped",
    }
    assert "timestamp" in body


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
    assert response.json()["resultAvailable"] is False


def test_task_status_returns_404_for_missing_job(client, backend_module, monkeypatch):
    monkeypatch.setattr(backend_module, "fetch_analysis_job", lambda _task_id: None)

    response = client.get("/task-status/550e8400-e29b-41d4-a716-446655440000")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "task_not_found"


def test_task_status_expires_stale_processing_job(client, backend_module, monkeypatch):
    updated_payloads = []
    stale_updated_at = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()

    monkeypatch.setattr(backend_module, "ANALYSIS_JOB_TIMEOUT_SECONDS", 1)
    monkeypatch.setattr(
        backend_module,
        "fetch_analysis_job",
        lambda _task_id: {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "status": "processing",
            "progress_text": "Analyzing audio...",
            "result_payload": {"job_kind": "track_analysis"},
            "updated_at": stale_updated_at,
        },
    )
    monkeypatch.setattr(
        backend_module,
        "update_analysis_job",
        lambda _job_id, payload: updated_payloads.append(payload),
    )

    response = client.get("/task-status/550e8400-e29b-41d4-a716-446655440000")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "timed_out"
    assert body["state"] == "expired"
    assert body["error"] == backend_module.SAFE_ANALYSIS_TIMEOUT_MESSAGE
    assert updated_payloads[-1]["status"] == "timed_out"


def test_completed_job_without_result_returns_failed_status(client, backend_module, monkeypatch):
    updated_payloads = []

    monkeypatch.setattr(
        backend_module,
        "fetch_analysis_job",
        lambda _task_id: {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "status": "completed",
            "progress_text": "Analysis complete.",
            "result_payload": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    monkeypatch.setattr(
        backend_module,
        "update_analysis_job",
        lambda _job_id, payload: updated_payloads.append(payload),
    )

    response = client.get("/task-status/550e8400-e29b-41d4-a716-446655440000")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["resultAvailable"] is False
    assert body["error"] == backend_module.SAFE_ANALYSIS_FAILURE_MESSAGE
    assert updated_payloads[-1]["status"] == "failed"


def test_task_status_completed_job_exposes_result_payload(client, backend_module, monkeypatch):
    result_payload = {
        "bpm": 120,
        "duration_seconds": 12.5,
        "markers": [{"id": 1, "label": "VERSE", "color": "#ffffff", "x": 0, "time": 5.0}],
        "message": "Tempo: 120 BPM | 1 Sections",
        "job_kind": "track_analysis",
    }

    monkeypatch.setattr(
        backend_module,
        "fetch_analysis_job",
        lambda _task_id: {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "status": "completed",
            "progress_text": "Analysis complete.",
            "result_payload": result_payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    response = client.get("/task-status/550e8400-e29b-41d4-a716-446655440000")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["state"] == "succeeded"
    assert body["resultAvailable"] is True
    assert body["result"] == result_payload
    assert body["error"] is None


def test_upload_audio_returns_trackable_job_id(client, backend_module, monkeypatch):
    scheduled_jobs = []
    job_id = "550e8400-e29b-41d4-a716-446655440000"

    monkeypatch.setattr(backend_module, "save_upload", lambda _file: Path("/tmp/fake.wav"))
    monkeypatch.setattr(backend_module, "remove_file", lambda _path: None)
    monkeypatch.setattr(
        backend_module,
        "upload_audio_to_storage",
        lambda *_args, **_kwargs: {
            "storage_path": "analysis/test.wav",
            "audio_url": "https://storage.example/analysis/test.wav",
        },
    )
    monkeypatch.setattr(
        backend_module,
        "insert_track",
        lambda payload: {"id": "track-1", "audio_url": payload["audio_url"], **payload},
    )
    monkeypatch.setattr(
        backend_module,
        "insert_ai_analysis_job",
        lambda payload: {"id": job_id, **payload},
    )
    monkeypatch.setattr(
        backend_module,
        "schedule_analysis_job",
        lambda *args: scheduled_jobs.append(args) or True,
    )

    response = client.post(
        "/upload-audio",
        files={"file": ("scan.mp3", b"audio", "audio/mpeg")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "accepted"
    assert body["task_id"] == job_id
    assert body["jobId"] == job_id
    assert scheduled_jobs


@pytest.mark.parametrize(
    ("file_name", "content_type", "expected_extension"),
    [
        ("Halestorm - Bad Romance (Lady Gaga) [Cover].mp3", "audio/mpeg", ".mp3"),
        (
            "onlymp3.to - everafter___asap__lyric_video_-YAJpQ3fnHFk-192k-1706283803[rebalanced].mp3",
            "audio/mpeg",
            ".mp3",
        ),
        ("song with spaces.MP3", "audio/mpeg", ".mp3"),
        ("bad/name.mp3", "audio/mpeg", ".mp3"),
        ("song-without-extension", "audio/mpeg", ".mp3"),
    ],
)
def test_storage_object_key_uses_uuid_and_safe_extension(
    backend_module, file_name, content_type, expected_extension
):
    storage_key = backend_module.build_storage_object_key(file_name, content_type)

    assert re.fullmatch(
        rf"analysis/\d{{4}}/\d{{2}}/\d{{2}}/[0-9a-f]{{32}}{re.escape(expected_extension)}",
        storage_key,
    )
    assert Path(file_name).name not in storage_key
    assert not any(character in storage_key for character in " []()\\\"'")


def test_analyze_audio_returns_structured_storage_error(client, backend_module, monkeypatch):
    monkeypatch.setattr(backend_module, "save_upload", lambda _file: Path("/tmp/fake.mp3"))
    monkeypatch.setattr(backend_module, "remove_file", lambda _path: None)
    monkeypatch.setattr(
        backend_module,
        "upload_audio_to_storage",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            backend_module.StorageUploadError("storage rejected key")
        ),
    )

    response = client.post(
        "/analyze-audio",
        files={
            "file": (
                "Halestorm - Bad Romance (Lady Gaga) [Cover].mp3",
                b"audio",
                "audio/mpeg",
            )
        },
    )

    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "audio_storage_upload_failed"
    assert "Halestorm" not in str(body)


def test_analyze_audio_accepts_tuning_metadata(client, backend_module, monkeypatch):
    scheduled_jobs = []
    inserted_jobs = []

    monkeypatch.setattr(backend_module, "save_upload", lambda _file: Path("/tmp/fake.mp3"))
    monkeypatch.setattr(backend_module, "remove_file", lambda _path: None)
    monkeypatch.setattr(
        backend_module,
        "upload_audio_to_storage",
        lambda *_args, **_kwargs: {
            "storage_path": "analysis/2026/05/02/test.mp3",
            "audio_url": "https://storage.example/analysis/2026/05/02/test.mp3",
        },
    )
    monkeypatch.setattr(
        backend_module,
        "insert_track",
        lambda payload: {"id": "track-1", "audio_url": payload["audio_url"], **payload},
    )
    monkeypatch.setattr(
        backend_module,
        "insert_ai_analysis_job",
        lambda payload: inserted_jobs.append(payload) or {"id": "job-1", **payload},
    )
    monkeypatch.setattr(
        backend_module,
        "schedule_song_import_job",
        lambda *args: scheduled_jobs.append(args) or True,
    )

    response = client.post(
        "/analyze-audio",
        files={"file": ("song.mp3", b"audio", "audio/mpeg")},
        data={
            "instrument": "guitar",
            "tuning_id": "guitar_drop_c_sharp",
            "tuning_name": "Drop C#",
            "string_notes": "C#2,G#2,C#3,F#3,A#3,D#4",
        },
    )

    assert response.status_code == 200
    tuning = inserted_jobs[0]["result_payload"]["tuning"]
    assert inserted_jobs[0]["result_payload"]["instrument"] == "guitar"
    assert tuning == {
        "id": "guitar_drop_c_sharp",
        "name": "Drop C#",
        "stringNotes": ["C#2", "G#2", "C#3", "F#3", "A#3", "D#4"],
    }
    assert scheduled_jobs[0][-1]["tuning"] == tuning


def test_analyze_audio_rejects_invalid_instrument(client, backend_module, monkeypatch):
    monkeypatch.setattr(backend_module, "save_upload", lambda _file: Path("/tmp/fake.mp3"))

    response = client.post(
        "/analyze-audio",
        files={"file": ("song.mp3", b"audio", "audio/mpeg")},
        data={"instrument": "piano"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_instrument"


def test_tab_mapping_uses_selected_tuning(backend_module):
    chord_events = [{"timeSec": 0, "chord": "C", "laneRow": 1}]
    beat_grid = [0, 1]

    standard_notes = backend_module.build_generic_tab_notes(
        chord_events,
        beat_grid,
        1,
        backend_module.build_tuning_metadata(
            "guitar",
            "guitar_standard",
            "Standard",
            "E2,A2,D3,G3,B3,E4",
        ),
    )
    drop_c_notes = backend_module.build_generic_tab_notes(
        chord_events,
        beat_grid,
        1,
        backend_module.build_tuning_metadata(
            "guitar",
            "guitar_drop_c_sharp",
            "Drop C#",
            "C#2,G#2,C#3,F#3,A#3,D#4",
        ),
    )

    assert standard_notes[0]["stringIndex"] != drop_c_notes[0]["stringIndex"] or (
        standard_notes[0]["fret"] != drop_c_notes[0]["fret"]
    )


def test_generate_tab_position_candidates_supports_standard_drop_c_and_bass(backend_module):
    standard_guitar = [
        backend_module.note_name_to_midi(note)
        for note in ["E2", "A2", "D3", "G3", "B3", "E4"]
    ]
    drop_c_sharp = [
        backend_module.note_name_to_midi(note)
        for note in ["C#2", "G#2", "C#3", "F#3", "A#3", "D#4"]
    ]
    standard_bass = [
        backend_module.note_name_to_midi(note)
        for note in ["E1", "A1", "D2", "G2"]
    ]

    assert (5, 0) in backend_module.generate_tab_position_candidates(
        backend_module.note_name_to_midi("E4"),
        standard_guitar,
    )
    assert (5, 0) in backend_module.generate_tab_position_candidates(
        backend_module.note_name_to_midi("D#4"),
        drop_c_sharp,
    )
    assert (0, 0) in backend_module.generate_tab_position_candidates(
        backend_module.note_name_to_midi("E1"),
        standard_bass,
    )


def test_balanced_tab_mapping_prefers_playable_fretted_position_over_open_string(backend_module):
    drop_c_sharp = [
        backend_module.note_name_to_midi(note)
        for note in ["C#2", "G#2", "C#3", "F#3", "A#3", "D#4"]
    ]
    target_midi = backend_module.note_name_to_midi("D#4")

    low_position = backend_module.choose_tuned_tab_position(
        target_midi,
        drop_c_sharp,
        mapping_style="low_position",
    )
    balanced = backend_module.choose_tuned_tab_position(
        target_midi,
        drop_c_sharp,
        previous_position=(3, 7),
        phrase_anchor_fret=7,
    )

    assert low_position == (5, 0)
    assert balanced[1] >= 5
    assert balanced != low_position


def test_repeated_and_nearby_notes_stay_in_stable_region(backend_module):
    drop_c_sharp = [
        backend_module.note_name_to_midi(note)
        for note in ["C#2", "G#2", "C#3", "F#3", "A#3", "D#4"]
    ]
    first = backend_module.choose_tuned_tab_position(
        backend_module.note_name_to_midi("C3"),
        drop_c_sharp,
        phrase_anchor_fret=5,
    )
    repeated = backend_module.choose_tuned_tab_position(
        backend_module.note_name_to_midi("C3"),
        drop_c_sharp,
        previous_position=first,
        phrase_anchor_fret=5,
    )
    nearby = backend_module.choose_tuned_tab_position(
        backend_module.note_name_to_midi("D3"),
        drop_c_sharp,
        previous_position=repeated,
        phrase_anchor_fret=5,
    )

    assert repeated == first
    assert abs(nearby[1] - repeated[1]) <= 4


def test_generic_tab_notes_default_to_standard_and_reduce_open_low_bias(backend_module):
    chord_events = [{"timeSec": 0, "chord": "C", "laneRow": 1}]
    beat_grid = [0, 1, 2, 3, 4, 5, 6]

    notes = backend_module.build_generic_tab_notes(chord_events, beat_grid, 6)
    frets = [note["fret"] for note in notes]

    assert notes
    assert all(0 <= note["fret"] <= 24 for note in notes)
    assert all(0 <= note["stringIndex"] <= 5 for note in notes)
    assert sum(1 for fret in frets if fret <= 2) < len(frets)


def test_tab_mapping_respects_max_fret(backend_module):
    standard_guitar = [
        backend_module.note_name_to_midi(note)
        for note in ["E2", "A2", "D3", "G3", "B3", "E4"]
    ]

    candidates = backend_module.generate_tab_position_candidates(
        backend_module.note_name_to_midi("E5"),
        standard_guitar,
        max_fret=12,
    )

    assert candidates
    assert all(fret <= 12 for _string_index, fret in candidates)


def test_unknown_tuning_lowers_tab_confidence_and_warns(backend_module, tmp_path, monkeypatch):
    audio_path = tmp_path / "song.wav"
    audio_path.write_bytes(b"fake")
    monkeypatch.setattr(backend_module.librosa, "load", lambda *_args, **_kwargs: (np.ones(4096), 22050))
    monkeypatch.setattr(backend_module.librosa, "get_duration", lambda **_kwargs: 12.0)
    monkeypatch.setattr(backend_module.librosa.effects, "hpss", lambda y: (y, y))
    monkeypatch.setattr(backend_module.librosa.onset, "onset_strength", lambda **_kwargs: np.ones(8))
    monkeypatch.setattr(backend_module.librosa.beat, "beat_track", lambda **_kwargs: (120.0, np.array([0, 10, 20])))
    monkeypatch.setattr(backend_module.librosa, "frames_to_time", lambda frames, **_kwargs: np.array([0.0, 1.0, 2.0]))
    monkeypatch.setattr(backend_module.librosa.feature, "chroma_cqt", lambda **_kwargs: np.ones((12, 32)))
    monkeypatch.setattr(backend_module.librosa, "time_to_frames", lambda times, **_kwargs: np.array([0, 8]))
    monkeypatch.setattr(backend_module, "classify_chord_vector", lambda _segment: ("C", 0.6))

    result = backend_module.build_song_manifest(
        audio_path,
        "Unknown Tuning Song",
        "TuneUp Fixture",
        tuning_metadata=backend_module.build_tuning_metadata(
            "guitar",
            "guitar_custom_unknown",
            "Custom / Unknown",
            None,
        ),
    )

    assert result["songManifest"]["aiDraft"] is True
    assert result["songManifest"]["tuning"]["id"] == "guitar_custom_unknown"
    assert result["songManifest"]["tabNotes"] == []
    assert result["confidence"]["tabs"] < 0.4
    assert any("Unknown tuning" in warning for warning in result["warnings"])


def test_analysis_success_marks_job_completed_with_retrievable_result(backend_module, monkeypatch):
    updated_payloads = []
    updated_tracks = []
    replaced_markers = []

    analysis_result = {
        "bpm": 128,
        "duration_seconds": 42.0,
        "markers": [{"id": 1, "label": "CHORUS", "color": "#ffffff", "x": 0, "time": 10.0}],
        "message": "Tempo: 128 BPM | 1 Sections",
    }

    monkeypatch.setattr(backend_module, "acquire_analysis_job", lambda _job_id: True)
    monkeypatch.setattr(backend_module, "release_analysis_job", lambda _job_id: None)
    monkeypatch.setattr(
        backend_module,
        "update_analysis_job",
        lambda _job_id, payload: updated_payloads.append(payload),
    )
    monkeypatch.setattr(
        backend_module,
        "download_audio_for_analysis",
        lambda *_args, **_kwargs: Path("/tmp/fake.wav"),
    )
    monkeypatch.setattr(
        backend_module,
        "run_with_timeout",
        lambda operation, **_kwargs: operation(),
    )
    monkeypatch.setattr(
        backend_module,
        "build_analysis_result",
        lambda *_args, **_kwargs: analysis_result,
    )
    monkeypatch.setattr(
        backend_module,
        "update_track",
        lambda _track_id, payload: updated_tracks.append(payload),
    )
    monkeypatch.setattr(
        backend_module,
        "replace_track_markers",
        lambda _track_id, markers: replaced_markers.append(markers),
    )
    monkeypatch.setattr(backend_module, "remove_file", lambda _path: None)

    backend_module.analyze_audio_task(
        "550e8400-e29b-41d4-a716-446655440000",
        "track-1",
        "https://storage.example/analysis/test.wav",
        "test.wav",
    )

    completed_payload = updated_payloads[-1]
    assert completed_payload["status"] == "completed"
    assert completed_payload["progress_text"] == "Analysis complete."
    assert completed_payload["result_payload"]["bpm"] == 128
    assert completed_payload["result_payload"]["job_kind"] == "track_analysis"
    assert (
        completed_payload["result_payload"]["audio_url"]
        == "https://storage.example/analysis/test.wav"
    )
    assert completed_payload["error_message"] is None
    assert updated_tracks[-1] == {"bpm": 128, "duration_seconds": 42.0}
    assert replaced_markers[-1] == analysis_result["markers"]


def test_analysis_exception_marks_job_failed(backend_module, monkeypatch):
    updated_payloads = []

    monkeypatch.setattr(backend_module, "acquire_analysis_job", lambda _job_id: True)
    monkeypatch.setattr(backend_module, "release_analysis_job", lambda _job_id: None)
    monkeypatch.setattr(
        backend_module,
        "update_analysis_job",
        lambda _job_id, payload: updated_payloads.append(payload),
    )
    monkeypatch.setattr(
        backend_module,
        "download_audio_for_analysis",
        lambda *_args, **_kwargs: Path("/tmp/fake.wav"),
    )
    monkeypatch.setattr(
        backend_module,
        "build_analysis_result",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("decoder exploded")),
    )
    monkeypatch.setattr(backend_module, "remove_file", lambda _path: None)

    backend_module.analyze_audio_task(
        "550e8400-e29b-41d4-a716-446655440000",
        "track-1",
        "https://storage.example/analysis/test.wav",
        "test.wav",
    )

    assert updated_payloads[-1]["status"] == "failed"
    assert updated_payloads[-1]["error_message"] == backend_module.SAFE_ANALYSIS_FAILURE_MESSAGE
    assert "decoder exploded" not in updated_payloads[-1]["error_message"]


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
