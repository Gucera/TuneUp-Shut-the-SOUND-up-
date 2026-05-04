import importlib
import sys
from types import SimpleNamespace

import pytest
import supabase as supabase_pkg
from analysis_accuracy_helpers import (
    assert_bpm_close,
    assert_contains_chord,
    assert_frequency_close,
    assert_song_manifest_shape,
    assert_track_markers_are_valid,
    generate_click_track,
    generate_major_chord_track,
    generate_sine_wave,
    load_expected_fixture,
    wav_bytes,
    write_wav,
)
from fastapi.testclient import TestClient


class DummyStorageBucket:
    def upload(self, *_args, **_kwargs):
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

    def from_(self, _name: str):
        return DummyStorageBucket()


class DummyQuery:
    def select(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=[])


class DummySupabase:
    storage = DummyStorage()

    def table(self, _table_name: str):
        return DummyQuery()


@pytest.fixture()
def backend_module(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "service-key")
    monkeypatch.setenv("SUPABASE_AUDIO_BUCKET", "audio-uploads")
    monkeypatch.setenv("SUPABASE_AUDIO_PREFIX", "analysis")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:8081,http://localhost:19006")

    monkeypatch.setattr(supabase_pkg, "create_client", lambda *_args, **_kwargs: DummySupabase())

    sys.modules.pop("config", None)
    sys.modules.pop("main", None)
    return importlib.import_module("main")


@pytest.fixture()
def client(backend_module):
    with TestClient(backend_module.app) as test_client:
        yield test_client


def test_click_track_bpm_detection_stays_within_baseline_tolerance(client):
    expected = load_expected_fixture("click_120_bpm")
    audio = generate_click_track(expected["bpm"])

    response = client.post(
        "/analyze-bpm",
        files={"file": ("synthetic_click_120_bpm.wav", wav_bytes(audio), "audio/wav")},
    )

    assert response.status_code == 200
    actual_bpm = response.json()["bpm"]
    assert_bpm_close(actual_bpm, expected["bpm"], expected["bpmTolerance"])


def test_sine_wave_pitch_detection_stays_within_baseline_tolerance(client):
    expected = load_expected_fixture("sine_a2_110hz")
    audio = generate_sine_wave(expected["dominantFrequencyHz"])

    response = client.post(
        "/detect-pitch",
        files={"file": ("synthetic_sine_a2_110hz.wav", wav_bytes(audio), "audio/wav")},
        data={"instrument": "Guitar"},
    )

    assert response.status_code == 200
    actual_frequency = response.json()["frequency"]
    assert_frequency_close(
        actual_frequency,
        expected["dominantFrequencyHz"],
        expected["frequencyToleranceHz"],
    )


def test_c_major_synthetic_chord_manifest_contains_expected_chord(backend_module, tmp_path):
    expected = load_expected_fixture("c_major_chord")
    audio_path = tmp_path / "synthetic_c_major_120_bpm.wav"
    audio = generate_major_chord_track((261.63, 329.63, 392.0), bpm=expected["bpm"])
    write_wav(audio_path, audio)

    result = backend_module.build_song_manifest(audio_path, "Synthetic C Major", "TuneUp Fixture")
    manifest = result["songManifest"]

    assert_bpm_close(result["bpm"], expected["bpm"], expected["bpmTolerance"])
    assert_contains_chord(manifest["chordEvents"], expected["allowedChordLabels"])
    assert_song_manifest_shape(manifest)


def test_analysis_result_and_song_manifest_shapes_are_frontend_safe(backend_module, tmp_path):
    click_expected = load_expected_fixture("click_120_bpm")
    click_path = tmp_path / "synthetic_click_120_bpm.wav"
    write_wav(click_path, generate_click_track(click_expected["bpm"]))

    analysis_result = backend_module.build_analysis_result(click_path)

    assert_bpm_close(
        analysis_result["bpm"],
        click_expected["bpm"],
        click_expected["bpmTolerance"],
    )
    assert analysis_result["duration_seconds"] > 0
    assert_track_markers_are_valid(analysis_result["markers"])

    chord_expected = load_expected_fixture("c_major_chord")
    chord_path = tmp_path / "synthetic_c_major_120_bpm.wav"
    write_wav(
        chord_path,
        generate_major_chord_track((261.63, 329.63, 392.0), bpm=chord_expected["bpm"]),
    )

    song_result = backend_module.build_song_manifest(
        chord_path,
        "Synthetic C Major",
        "TuneUp Fixture",
    )

    assert isinstance(song_result["bpm"], int)
    assert isinstance(song_result["beatGrid"], list)
    assert song_result["beatGrid"]
    assert_song_manifest_shape(song_result["songManifest"])
