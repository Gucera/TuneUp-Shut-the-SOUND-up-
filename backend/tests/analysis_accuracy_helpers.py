import io
import json
import wave
from pathlib import Path
from typing import Any

import numpy as np

FIXTURE_ROOT = Path(__file__).parent / "fixtures"
EXPECTED_PATH = FIXTURE_ROOT / "expected" / "audio_accuracy.json"
SAMPLE_RATE = 22_050


def load_expected_fixture(name: str) -> dict[str, Any]:
    with EXPECTED_PATH.open("r", encoding="utf-8") as expected_file:
        fixtures = json.load(expected_file)

    return fixtures[name]["expected"]


def _to_wav_bytes(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    normalized = np.asarray(samples, dtype=np.float32)
    normalized = np.clip(normalized, -1.0, 1.0)
    pcm = (normalized * 32767).astype("<i2")

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm.tobytes())

    return buffer.getvalue()


def write_wav(path: Path, samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
    path.write_bytes(_to_wav_bytes(samples, sample_rate))


def generate_click_track(
    bpm: float,
    *,
    duration_seconds: float = 8.0,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    samples = np.zeros(int(duration_seconds * sample_rate), dtype=np.float32)
    beat_interval_seconds = 60.0 / bpm
    click_length = int(0.025 * sample_rate)
    click_time = np.arange(click_length, dtype=np.float32) / sample_rate
    click = 0.9 * np.sin(2 * np.pi * 1800 * click_time) * np.hanning(click_length)

    for beat_time in np.arange(0.0, duration_seconds, beat_interval_seconds):
        start = int(beat_time * sample_rate)
        end = min(start + click_length, samples.size)
        if end > start:
            samples[start:end] += click[: end - start]

    return np.clip(samples, -1.0, 1.0)


def generate_sine_wave(
    frequency_hz: float,
    *,
    duration_seconds: float = 1.5,
    sample_rate: int = SAMPLE_RATE,
    amplitude: float = 0.5,
) -> np.ndarray:
    time = np.linspace(0.0, duration_seconds, int(duration_seconds * sample_rate), endpoint=False)
    return (amplitude * np.sin(2 * np.pi * frequency_hz * time)).astype(np.float32)


def generate_major_chord_track(
    frequencies_hz: tuple[float, float, float],
    *,
    bpm: float = 120.0,
    duration_seconds: float = 8.0,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    time = np.linspace(0.0, duration_seconds, int(duration_seconds * sample_rate), endpoint=False)
    chord = np.zeros_like(time, dtype=np.float32)
    for frequency in frequencies_hz:
        chord += np.sin(2 * np.pi * frequency * time).astype(np.float32)

    chord = 0.24 * chord / max(1, len(frequencies_hz))
    click_track = 0.25 * generate_click_track(
        bpm,
        duration_seconds=duration_seconds,
        sample_rate=sample_rate,
    )
    return np.clip(chord + click_track, -1.0, 1.0)


def wav_bytes(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    return _to_wav_bytes(samples, sample_rate)


def assert_bpm_close(actual: float, expected: float, tolerance: float) -> None:
    difference = abs(actual - expected)
    assert difference <= tolerance, (
        f"Expected BPM {actual:.2f} to be within +/-{tolerance:.2f} of {expected:.2f}; "
        f"difference was {difference:.2f}."
    )


def assert_frequency_close(actual_hz: float, expected_hz: float, tolerance_hz: float) -> None:
    difference = abs(actual_hz - expected_hz)
    assert difference <= tolerance_hz, (
        f"Expected frequency {actual_hz:.2f} Hz to be within +/-{tolerance_hz:.2f} Hz "
        f"of {expected_hz:.2f} Hz; difference was {difference:.2f} Hz."
    )


def assert_contains_chord(actual_events: list[dict[str, Any]], allowed_labels: list[str]) -> None:
    labels = [event.get("chord") for event in actual_events]
    assert any(
        label in allowed_labels for label in labels
    ), f"Expected at least one chord label in {allowed_labels}, got {labels}."


def assert_track_markers_are_valid(markers: list[dict[str, Any]]) -> None:
    assert isinstance(markers, list), "Expected markers to be a list."
    for index, marker in enumerate(markers):
        assert isinstance(marker, dict), f"Expected markers[{index}] to be an object."
        assert (
            isinstance(marker.get("label"), str) and marker["label"]
        ), f"Expected markers[{index}].label to be a non-empty string."
        assert isinstance(
            marker.get("time"), int | float
        ), f"Expected markers[{index}].time to be numeric."
        assert marker["time"] >= 0, f"Expected markers[{index}].time to be non-negative."


def assert_song_manifest_shape(manifest: dict[str, Any]) -> None:
    assert isinstance(manifest, dict), "Expected song manifest to be an object."
    chord_events = manifest.get("chordEvents")
    tab_notes = manifest.get("tabNotes")

    assert isinstance(chord_events, list), "Expected chordEvents to be a list."
    assert isinstance(tab_notes, list), "Expected tabNotes to be a list."
    assert chord_events or tab_notes, "Expected manifest to contain playable content."

    for index, event in enumerate(chord_events):
        assert isinstance(
            event.get("timeSec"), int | float
        ), f"Expected chordEvents[{index}].timeSec to be numeric."
        assert event["timeSec"] >= 0, f"Expected chordEvents[{index}].timeSec to be non-negative."
        assert (
            isinstance(event.get("chord"), str) and event["chord"]
        ), f"Expected chordEvents[{index}].chord to be a non-empty string."
        assert isinstance(
            event.get("laneRow"), int
        ), f"Expected chordEvents[{index}].laneRow to be an integer."
        assert (
            0 <= event["laneRow"] <= 3
        ), f"Expected chordEvents[{index}].laneRow to be between 0 and 3."

    for index, note in enumerate(tab_notes):
        assert isinstance(
            note.get("timeSec"), int | float
        ), f"Expected tabNotes[{index}].timeSec to be numeric."
        assert note["timeSec"] >= 0, f"Expected tabNotes[{index}].timeSec to be non-negative."
        assert isinstance(
            note.get("stringIndex"), int
        ), f"Expected tabNotes[{index}].stringIndex to be an integer."
        assert (
            0 <= note["stringIndex"] <= 5
        ), f"Expected tabNotes[{index}].stringIndex to be between 0 and 5."
        assert isinstance(
            note.get("fret"), int
        ), f"Expected tabNotes[{index}].fret to be an integer."
        assert note["fret"] >= 0, f"Expected tabNotes[{index}].fret to be non-negative."
