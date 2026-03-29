from datetime import datetime, timezone
from mimetypes import guess_type
from pathlib import Path
from threading import Lock, Thread
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.request import urlopen
from uuid import UUID, uuid4
import logging
import os
import random
import shutil

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import librosa
import numpy as np
from pydantic import BaseModel
from supabase import Client, create_client


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("tuneup.backend")

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()


SECTION_COLORS = {
    "INTRO": "#7400b8",
    "VERSE 1": "#6930c3",
    "CHORUS": "#5e60ce",
    "VERSE 2": "#5390d9",
    "BRIDGE": "#48bfe3",
    "OUTRO": "#64dfdf",
    "SECTION": "#56cfe1",
    "AUTO": "#80ffdb",
}

PITCH_RANGES = {
    "Guitar": (60.0, 420.0),
    "Bass": (30.0, 180.0),
    "Ukulele": (180.0, 500.0),
    "Drums": (40.0, 1200.0),
}

SONG_DATABASE = {
    "Happy": [{"title": "Happy", "artist": "Pharrell", "bpm": 160}],
    "Sad": [{"title": "Someone Like You", "artist": "Adele", "bpm": 67}],
    "Energetic": [{"title": "Eye of the Tiger", "artist": "Survivor", "bpm": 109}],
}

ANALYSIS_AUDIO_BUCKET = os.getenv("SUPABASE_AUDIO_BUCKET", "audio-uploads")
ANALYSIS_AUDIO_PREFIX = os.getenv("SUPABASE_AUDIO_PREFIX", "analysis")
LEGACY_TRACK_OWNER_PREFIX = "legacy-player:"
RECOVERABLE_JOB_STATUSES = ("pending", "processing")
ACTIVE_ANALYSIS_JOB_IDS: set[str] = set()
ACTIVE_ANALYSIS_JOB_IDS_LOCK = Lock()
CHROMA_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FALLBACK_CHORD_PROGRESSION = ["Em", "C", "G", "D"]
CHORD_LANE_ROWS = {
    "G": 0,
    "C": 1,
    "Am": 2,
    "F": 3,
    "Em": 1,
    "Dm": 2,
    "Bm": 0,
    "D": 0,
    "A": 2,
    "E": 1,
}
CHORD_TAB_SHAPES: Dict[str, List[Tuple[int, int]]] = {
    "C": [(1, 1), (2, 0), (3, 2), (4, 3)],
    "Cm": [(1, 4), (2, 5), (3, 5), (4, 3)],
    "C#": [(1, 2), (2, 1), (3, 3), (4, 4)],
    "D": [(0, 2), (1, 3), (2, 2), (3, 0)],
    "Dm": [(0, 1), (1, 3), (2, 2), (3, 0)],
    "E": [(0, 0), (1, 0), (2, 1), (3, 2)],
    "Em": [(1, 0), (2, 0), (3, 2), (4, 2)],
    "F": [(0, 1), (1, 1), (2, 2), (3, 3)],
    "F#": [(0, 2), (1, 2), (2, 3), (3, 4)],
    "G": [(0, 3), (1, 0), (2, 0), (5, 3)],
    "Gm": [(0, 3), (1, 3), (2, 3), (3, 5)],
    "A": [(0, 0), (1, 2), (2, 2), (3, 2)],
    "Am": [(0, 1), (1, 1), (2, 2), (3, 2)],
    "B": [(0, 2), (1, 4), (2, 4), (3, 4)],
    "Bm": [(0, 2), (1, 3), (2, 4), (3, 4)],
}
DEFAULT_TAB_SHAPE = [(1, 1), (2, 0), (3, 2), (4, 3)]


class MoodRequest(BaseModel):
    mood: str


class Marker(BaseModel):
    id: int
    label: str
    color: str
    x: float


class TrafficData(BaseModel):
    song_name: str
    duration: float
    markers: List[Marker]
    user_id: Optional[str] = None


class LeaderboardProfile(BaseModel):
    user_id: str
    display_name: str
    xp: int
    level: int
    streak_days: int = 0
    longest_streak: int = 0
    badges: List[str] = []
    completed_lessons: int = 0
    completed_songs: int = 0
    completed_quizzes: int = 0
    completed_lesson_ids: List[str] = []
    completed_song_ids: List[str] = []
    completed_quiz_ids: List[str] = []


def parse_allowed_origins() -> List[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "*")
    parts = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return parts or ["*"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")

    missing = [name for name, value in {"SUPABASE_URL": url, "SUPABASE_KEY": key}.items() if not value]
    if missing:
        raise RuntimeError(
            "Missing required Supabase environment variables: "
            + ", ".join(missing)
            + ". Set SUPABASE_URL and SUPABASE_KEY before starting the backend."
        )

    return create_client(url, key)


supabase: Client = init_supabase_client()


def remove_file(path: Path) -> None:
    if path.exists():
        path.unlink()


def parse_uuid(value: str, field_name: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be a valid UUID.") from exc


def coerce_optional_uuid(value: Optional[str]) -> Optional[str]:
    if not value or not value.strip():
        return None

    try:
        return str(UUID(value.strip()))
    except ValueError:
        return None


def normalize_legacy_user_id(value: Optional[str]) -> Optional[str]:
    if not value or not value.strip():
        return None

    raw_value = value.strip()
    return raw_value if raw_value.startswith("player-") else None


def legacy_track_owner_value(legacy_user_id: str) -> str:
    return f"{LEGACY_TRACK_OWNER_PREFIX}{legacy_user_id}"


def extract_legacy_track_owner(track_key: Optional[str]) -> Optional[str]:
    if not track_key or not track_key.startswith(LEGACY_TRACK_OWNER_PREFIX):
        return None

    return track_key.removeprefix(LEGACY_TRACK_OWNER_PREFIX)


def build_upload_path(file_name: str) -> Path:
    safe_name = Path(file_name or "upload.bin").name
    suffix = Path(safe_name).suffix or ".bin"
    return UPLOAD_DIR / f"{uuid4().hex}{suffix}"


def save_upload(file: UploadFile) -> Path:
    target_path = build_upload_path(file.filename or "upload.bin")
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return target_path


def safe_storage_filename(file_name: str) -> str:
    safe_name = Path(file_name or "upload.bin").name.strip() or "upload.bin"
    return safe_name.replace(" ", "_")


def ensure_audio_bucket() -> None:
    try:
        supabase.storage.get_bucket(ANALYSIS_AUDIO_BUCKET)
    except Exception:
        logger.info("Creating Supabase storage bucket '%s' for analysis audio.", ANALYSIS_AUDIO_BUCKET)
        supabase.storage.create_bucket(
            ANALYSIS_AUDIO_BUCKET,
            options={
                "public": True,
                "allowed_mime_types": [
                    "audio/mpeg",
                    "audio/mp4",
                    "audio/wav",
                    "audio/x-wav",
                    "audio/aac",
                    "audio/ogg",
                    "application/octet-stream",
                ],
            },
        )


def upload_audio_to_storage(file_path: Path, file_name: str, content_type: Optional[str]) -> dict:
    ensure_audio_bucket()

    storage_path = (
        f"{ANALYSIS_AUDIO_PREFIX}/"
        f"{datetime.now(timezone.utc).strftime('%Y/%m/%d')}/"
        f"{uuid4().hex}-{safe_storage_filename(file_name)}"
    )
    resolved_content_type = content_type or guess_type(file_name)[0] or "application/octet-stream"

    supabase.storage.from_(ANALYSIS_AUDIO_BUCKET).upload(
        storage_path,
        file_path,
        {
            "content-type": resolved_content_type,
            "upsert": "true",
            "cache-control": "3600",
        },
    )

    audio_url = supabase.storage.from_(ANALYSIS_AUDIO_BUCKET).get_public_url(storage_path)
    return {
        "storage_path": storage_path,
        "audio_url": audio_url,
    }


def remove_storage_object(storage_path: Optional[str]) -> None:
    if not storage_path:
        return

    try:
        supabase.storage.from_(ANALYSIS_AUDIO_BUCKET).remove([storage_path])
    except Exception:
        logger.exception("Failed to delete Supabase storage object %s.", storage_path)


def download_audio_for_analysis(audio_url: str, file_name: str) -> Path:
    target_path = build_upload_path(file_name or "analysis.bin")

    with urlopen(audio_url) as response, target_path.open("wb") as buffer:
        shutil.copyfileobj(response, buffer)

    return target_path


def build_section_marker(marker_time: float, label: str, marker_id: Optional[int] = None) -> dict:
    return {
        "id": marker_id if marker_id is not None else int(marker_time * 10000) + random.randint(0, 999),
        "label": label,
        "color": SECTION_COLORS.get(label, "#56cfe1"),
        "x": 0,
        "time": float(marker_time),
    }


def build_fallback_markers(duration_seconds: float) -> List[dict]:
    if duration_seconds <= 0:
        return []

    labels = ["VERSE 1", "CHORUS", "VERSE 2", "OUTRO"]
    anchors = [0.2, 0.4, 0.65, 0.85]
    markers: List[dict] = []

    for index, (ratio, label) in enumerate(zip(anchors, labels), start=1):
        marker_time = round(max(5.0, duration_seconds * ratio), 2)
        if marker_time >= duration_seconds:
            continue
        markers.append(build_section_marker(marker_time, label, int(marker_time * 1000) + index))

    return markers


def lane_row_for_chord(chord: str) -> int:
    if chord in CHORD_LANE_ROWS:
        return CHORD_LANE_ROWS[chord]

    root = chord[:2] if len(chord) > 1 and chord[1] in {"#", "b"} else chord[:1]
    normalized_root = {
        "Bb": "A#",
        "Db": "C#",
        "Eb": "D#",
        "Gb": "F#",
        "Ab": "G#",
    }.get(root, root)
    root_index = CHROMA_NOTE_NAMES.index(normalized_root) if normalized_root in CHROMA_NOTE_NAMES else 0
    return root_index % 4


def chord_template(root_index: int, is_minor: bool) -> np.ndarray:
    template = np.zeros(12, dtype=float)
    template[root_index] = 1.0
    template[(root_index + (3 if is_minor else 4)) % 12] = 0.82
    template[(root_index + 7) % 12] = 0.68
    norm = np.linalg.norm(template)
    return template / norm if norm > 0 else template


def classify_chord_vector(chroma_vector: np.ndarray) -> Tuple[str, float]:
    norm = np.linalg.norm(chroma_vector)
    if norm <= 1e-8:
        return "", 0.0

    normalized = chroma_vector / norm
    best_label = ""
    best_score = -1.0
    second_score = -1.0

    for root_index, note_name in enumerate(CHROMA_NOTE_NAMES):
        for is_minor in (False, True):
            template = chord_template(root_index, is_minor)
            score = float(np.dot(normalized, template))
            if score > best_score:
                second_score = best_score
                best_score = score
                best_label = f"{note_name}m" if is_minor else note_name
            elif score > second_score:
                second_score = score

    confidence = max(0.0, min(1.0, (best_score + max(0.0, best_score - max(second_score, 0.0))) / 2.0))
    return best_label, confidence


def build_beat_grid(duration_seconds: float, beat_times: np.ndarray, bpm: float) -> List[float]:
    grid = sorted(
        {
            round(float(timestamp), 3)
            for timestamp in beat_times
            if 0.0 <= float(timestamp) <= duration_seconds
        }
    )

    if not grid:
        beat_duration = 60.0 / max(72.0, min(160.0, bpm or 96.0))
        grid = [round(float(step), 3) for step in np.arange(0.0, duration_seconds + beat_duration, beat_duration)]
    elif grid[0] > 0.22:
        grid.insert(0, 0.0)

    if not grid:
        grid = [0.0]

    if grid[-1] < duration_seconds:
        grid.append(round(duration_seconds, 3))

    return grid


def merge_chord_events(events: List[dict]) -> List[dict]:
    merged: List[dict] = []

    for event in events:
        if not event.get("chord"):
            continue

        if not merged:
            merged.append(event)
            continue

        previous = merged[-1]
        if previous["chord"] == event["chord"] and (event["timeSec"] - previous["timeSec"]) <= 1.35:
            previous["confidence"] = max(previous["confidence"], event["confidence"])
            continue

        merged.append(event)

    return merged


def build_generic_chord_events(duration_seconds: float, beat_grid: List[float]) -> List[dict]:
    anchors = beat_grid[:-1] if len(beat_grid) > 1 else [0.0]
    if not anchors:
        anchors = [0.0]

    events: List[dict] = []
    step = 4

    for progression_index, beat_index in enumerate(range(0, len(anchors), step)):
        chord = FALLBACK_CHORD_PROGRESSION[progression_index % len(FALLBACK_CHORD_PROGRESSION)]
        events.append(
            {
                "timeSec": round(float(anchors[beat_index]), 2),
                "chord": chord,
                "laneRow": lane_row_for_chord(chord),
                "confidence": 0.0,
            }
        )

    if not events:
        chord = FALLBACK_CHORD_PROGRESSION[0]
        events.append(
            {
                "timeSec": 0.0,
                "chord": chord,
                "laneRow": lane_row_for_chord(chord),
                "confidence": 0.0,
            }
        )

    return events


def active_chord_at(time_sec: float, chord_events: List[dict]) -> str:
    active = chord_events[0]["chord"] if chord_events else FALLBACK_CHORD_PROGRESSION[0]

    for event in chord_events:
        if event["timeSec"] > time_sec:
            break
        active = event["chord"]

    return active


def build_generic_tab_notes(
    chord_events: List[dict],
    beat_grid: List[float],
    duration_seconds: float,
) -> List[dict]:
    notes: List[dict] = []
    anchor_beats = beat_grid[:-1] if len(beat_grid) > 1 else [0.0]

    for beat_index, time_sec in enumerate(anchor_beats):
        active_chord = active_chord_at(float(time_sec), chord_events)
        shape = CHORD_TAB_SHAPES.get(active_chord, DEFAULT_TAB_SHAPE)
        string_index, fret = shape[beat_index % len(shape)]
        next_time = beat_grid[beat_index + 1] if beat_index + 1 < len(beat_grid) else min(duration_seconds, float(time_sec) + 0.6)
        duration = max(0.18, min(0.72, (float(next_time) - float(time_sec)) * 0.82))
        notes.append(
            {
                "timeSec": round(float(time_sec), 2),
                "stringIndex": int(string_index),
                "fret": int(fret),
                "durationSec": round(duration, 2),
            }
        )

    return notes


def infer_song_difficulty(bpm: float, chord_count: int, tab_count: int) -> str:
    if bpm < 95 and chord_count <= 12 and tab_count <= 72:
        return "Easy"

    if bpm < 140 and chord_count <= 24 and tab_count <= 144:
        return "Medium"

    return "Hard"


def build_song_manifest(
    file_path: Path,
    title: str,
    artist: str,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> dict:
    if progress_callback:
        progress_callback("AI is transcribing your song...")

    y, sr = librosa.load(str(file_path), sr=None, mono=True)
    duration_seconds = float(librosa.get_duration(y=y, sr=sr))
    harmonic, _ = librosa.effects.hpss(y)

    if progress_callback:
        progress_callback("Detecting BPM and beat grid...")

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    bpm = float(tempo) if np.ndim(tempo) == 0 else float(tempo[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    beat_grid = build_beat_grid(duration_seconds, beat_times, bpm)

    if progress_callback:
        progress_callback("Inferring chord movement...")

    chord_candidates: List[dict] = []

    try:
        chroma = librosa.feature.chroma_cqt(y=harmonic, sr=sr)
        for beat_index, start_time in enumerate(beat_grid[:-1]):
            end_time = beat_grid[beat_index + 1]
            start_frame, end_frame = librosa.time_to_frames([start_time, end_time], sr=sr)
            if end_frame <= start_frame:
                continue

            segment = chroma[:, start_frame:end_frame]
            if segment.size == 0:
                continue

            chord_name, confidence = classify_chord_vector(np.mean(segment, axis=1))
            if not chord_name:
                continue

            chord_candidates.append(
                {
                    "timeSec": round(float(start_time), 2),
                    "chord": chord_name,
                    "laneRow": lane_row_for_chord(chord_name),
                    "confidence": float(confidence),
                }
            )
    except Exception:
        logger.exception("Chord detection failed, falling back to generic progression.")

    chord_events = merge_chord_events(chord_candidates)
    confidence_values = [event["confidence"] for event in chord_events if event.get("confidence") is not None]
    average_confidence = float(np.mean(confidence_values)) if confidence_values else 0.0
    fallback_used = average_confidence < 0.55 or len(chord_events) < 4

    if not chord_events or average_confidence < 0.32:
        chord_events = build_generic_chord_events(duration_seconds, beat_grid)
        fallback_used = True

    if progress_callback:
        progress_callback("Building a playable tab pattern...")

    tab_notes = build_generic_tab_notes(chord_events, beat_grid, duration_seconds)
    difficulty = infer_song_difficulty(bpm, len(chord_events), len(tab_notes))

    if progress_callback:
        progress_callback("Saving imported song...")

    song_manifest = {
        "title": title,
        "artist": artist,
        "difficulty": difficulty,
        "durationSec": round(duration_seconds, 2),
        "chordEvents": [
            {
                "timeSec": event["timeSec"],
                "chord": event["chord"],
                "laneRow": event["laneRow"],
            }
            for event in chord_events
        ],
        "tabNotes": tab_notes,
    }

    return {
        "bpm": round(bpm) if bpm else 0,
        "beatGrid": beat_grid,
        "confidence": round(average_confidence, 3),
        "fallbackUsed": fallback_used,
        "songManifest": song_manifest,
        "message": "AI transcription complete.",
    }


def build_analysis_result(
    file_path: Path,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> dict:
    if progress_callback:
        progress_callback("Loading full audio file from storage...")

    y, sr = librosa.load(str(file_path), sr=None)
    duration_seconds = float(librosa.get_duration(y=y, sr=sr))

    if progress_callback:
        progress_callback("Detecting BPM and groove...")

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    bpm = float(tempo) if np.ndim(tempo) == 0 else float(tempo[0])

    ai_markers: List[dict] = []

    if progress_callback:
        progress_callback("Mapping song sections across the full track...")

    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        bounds = librosa.segment.agglomerative(chroma, 6)
        bound_times = sorted(list(librosa.frames_to_time(bounds, sr=sr)))
        logger.info("Raw boundaries found: %s", bound_times)

        section_names = ["INTRO", "VERSE 1", "CHORUS", "VERSE 2", "BRIDGE", "OUTRO"]
        last_time = -10.0
        max_marker_time = max(10.0, duration_seconds - 5.0)
        name_index = 0

        for timestamp in bound_times:
            if 5.0 < timestamp < max_marker_time and (timestamp - last_time > 15.0):
                label_name = section_names[name_index] if name_index < len(section_names) else "SECTION"
                ai_markers.append(build_section_marker(timestamp, label_name))
                last_time = timestamp
                name_index += 1

        if len(ai_markers) == 0:
            logger.info("AI found no sections, adding duration-aware fallback markers.")
            ai_markers.extend(build_fallback_markers(duration_seconds))
    except Exception:
        logger.exception("Segmentation error while building analysis markers.")
        ai_markers.extend(build_fallback_markers(duration_seconds))

    if progress_callback:
        progress_callback("Finalizing full-track markers...")

    rounded_bpm = round(bpm)
    return {
        "bpm": rounded_bpm,
        "duration_seconds": round(duration_seconds, 2),
        "markers": ai_markers,
        "message": f"Tempo: {rounded_bpm} BPM | {len(ai_markers)} Sections",
    }


def insert_track(payload: dict) -> dict:
    response = supabase.table("tracks").insert(payload).execute()
    rows = response.data or []
    if not rows:
        raise RuntimeError("Supabase did not return the inserted track row.")
    return rows[0]


def insert_ai_analysis_job(payload: dict) -> dict:
    response = supabase.table("ai_analysis_jobs").insert(payload).execute()
    rows = response.data or []
    if not rows:
        raise RuntimeError("Supabase did not return the inserted analysis job row.")
    return rows[0]


def insert_song_lesson(payload: dict) -> dict:
    response = supabase.table("song_lessons").insert(payload).execute()
    rows = response.data or []
    if not rows:
        raise RuntimeError("Supabase did not return the inserted song lesson row.")
    return rows[0]


def fetch_analysis_job(job_id: str) -> Optional[dict]:
    response = (
        supabase.table("ai_analysis_jobs")
        .select("*")
        .eq("id", job_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def update_analysis_job(job_id: str, payload: dict) -> None:
    supabase.table("ai_analysis_jobs").update(payload).eq("id", job_id).execute()


def update_track(track_id: str, payload: dict) -> None:
    supabase.table("tracks").update(payload).eq("id", track_id).execute()


def replace_track_markers(track_id: str, markers: List[dict]) -> None:
    supabase.table("track_markers").delete().eq("track_id", track_id).execute()

    if not markers:
        return

    marker_rows = [
        {
            "track_id": track_id,
            "source_marker_id": marker.get("id"),
            "label": marker["label"],
            "start_time": marker.get("time"),
            "position_x": marker.get("x"),
            "color_hex": marker["color"],
        }
        for marker in markers
    ]
    supabase.table("track_markers").insert(marker_rows).execute()


def sync_user_achievements(user_id: str, badge_ids: List[str]) -> None:
    normalized_badge_ids = sorted({badge_id.strip() for badge_id in badge_ids if badge_id and badge_id.strip()})
    if not normalized_badge_ids:
        return

    valid_badges_response = (
        supabase.table("achievements")
        .select("id")
        .in_("id", normalized_badge_ids)
        .execute()
    )
    valid_badge_ids = [row["id"] for row in (valid_badges_response.data or [])]
    if not valid_badge_ids:
        return

    supabase.table("user_achievements").upsert(
        [
            {
                "user_id": user_id,
                "achievement_id": badge_id,
                "unlocked_at": now_iso(),
            }
            for badge_id in valid_badge_ids
        ],
        on_conflict="user_id,achievement_id",
    ).execute()


def sync_completed_progress_rows(
    *,
    progress_table: str,
    catalog_table: str,
    content_id_field: str,
    user_id: str,
    content_ids: List[str],
) -> None:
    normalized_ids = sorted({content_id.strip() for content_id in content_ids if content_id and content_id.strip()})
    if not normalized_ids:
        return

    valid_catalog_response = (
        supabase.table(catalog_table)
        .select("id")
        .in_("id", normalized_ids)
        .execute()
    )
    valid_ids = [row["id"] for row in (valid_catalog_response.data or [])]
    if not valid_ids:
        return

    supabase.table(progress_table).upsert(
        [
            {
                "user_id": user_id,
                content_id_field: content_id,
                "status": "completed",
                "completed_at": now_iso(),
            }
            for content_id in valid_ids
        ],
        on_conflict=f"user_id,{content_id_field}",
    ).execute()


def map_saved_traffic_entry(track_row: dict) -> dict:
    marker_rows = sorted(
        track_row.get("track_markers") or [],
        key=lambda item: item.get("created_at") or "",
    )
    markers = [
        {
            "id": marker.get("source_marker_id") if marker.get("source_marker_id") is not None else index + 1,
            "label": marker["label"],
            "color": marker["color_hex"],
            "x": marker.get("position_x") or 0,
        }
        for index, marker in enumerate(marker_rows)
    ]
    legacy_user_id = extract_legacy_track_owner(track_row.get("key"))

    return {
        "song_name": track_row["title"],
        "duration": track_row.get("duration_seconds") or 0,
        "markers": markers,
        "user_id": track_row.get("user_id") or legacy_user_id,
        "created_at": track_row.get("created_at"),
    }


def fetch_saved_traffic_records(user_id: Optional[str] = None, legacy_user_id: Optional[str] = None) -> List[dict]:
    query = (
        supabase.table("tracks")
        .select(
            "id,title,duration_seconds,user_id,key,created_at,"
            "track_markers(source_marker_id,label,start_time,position_x,color_hex,created_at)"
        )
        .eq("track_source", "saved-traffic")
        .order("created_at", desc=True)
    )

    if user_id:
        query = query.eq("user_id", user_id)
    elif legacy_user_id:
        query = query.eq("key", legacy_track_owner_value(legacy_user_id))

    response = query.execute()
    return [map_saved_traffic_entry(track_row) for track_row in (response.data or [])]


def acquire_analysis_job(job_id: str) -> bool:
    with ACTIVE_ANALYSIS_JOB_IDS_LOCK:
        if job_id in ACTIVE_ANALYSIS_JOB_IDS:
            return False

        ACTIVE_ANALYSIS_JOB_IDS.add(job_id)
        return True


def release_analysis_job(job_id: str) -> None:
    with ACTIVE_ANALYSIS_JOB_IDS_LOCK:
        ACTIVE_ANALYSIS_JOB_IDS.discard(job_id)


def analyze_audio_task(job_id: str, track_id: str, audio_url: str, file_name: str) -> None:
    if not acquire_analysis_job(job_id):
        return

    logger.info("Background analysis started for %s (%s).", file_name, job_id)
    file_path: Optional[Path] = None

    try:
        update_analysis_job(
            job_id,
            {
                "status": "processing",
                "progress_text": f"Preparing {file_name} for analysis...",
                "error_message": None,
                "completed_at": None,
            },
        )

        file_path = download_audio_for_analysis(audio_url, file_name)
        result = build_analysis_result(
            file_path,
            progress_callback=lambda message: update_analysis_job(
                job_id,
                {
                    "status": "processing",
                    "progress_text": message,
                    "completed_at": None,
                },
            ),
        )

        update_track(
            track_id,
            {
                "bpm": result["bpm"],
                "duration_seconds": result["duration_seconds"],
            },
        )
        replace_track_markers(track_id, result["markers"])
        update_analysis_job(
            job_id,
            {
                "status": "completed",
                "progress_text": "Analysis complete.",
                "result_payload": {
                    **result,
                    "audio_url": audio_url,
                    "job_kind": "track_analysis",
                },
                "error_message": None,
                "completed_at": now_iso(),
            },
        )
    except Exception as exc:
        logger.exception("Background analysis failed for %s.", job_id)
        update_analysis_job(
            job_id,
            {
                "status": "failed",
                "progress_text": "Analysis failed.",
                "result_payload": {
                    "audio_url": audio_url,
                    "job_kind": "track_analysis",
                },
                "error_message": str(exc),
                "completed_at": now_iso(),
            },
        )
    finally:
        if file_path is not None:
            remove_file(file_path)
        release_analysis_job(job_id)


def schedule_analysis_job(job_id: str, track_id: str, audio_url: str, file_name: str) -> None:
    worker = Thread(
        target=analyze_audio_task,
        args=(job_id, track_id, audio_url, file_name),
        daemon=True,
    )
    worker.start()


def analyze_song_import_task(
    job_id: str,
    track_id: str,
    audio_url: str,
    file_name: str,
    owner_user_id: Optional[str],
) -> None:
    if not acquire_analysis_job(job_id):
        return

    logger.info("Song import analysis started for %s (%s).", file_name, job_id)
    file_path: Optional[Path] = None

    try:
        update_analysis_job(
            job_id,
            {
                "status": "processing",
                "progress_text": "Preparing your track for AI transcription...",
                "error_message": None,
                "completed_at": None,
            },
        )

        file_path = download_audio_for_analysis(audio_url, file_name)
        title = Path(file_name).stem.replace("_", " ").strip() or "Imported Song"
        result = build_song_manifest(
            file_path,
            title=title,
            artist="AI Transcription",
            progress_callback=lambda message: update_analysis_job(
                job_id,
                {
                    "status": "processing",
                    "progress_text": message,
                    "completed_at": None,
                },
            ),
        )

        update_track(
            track_id,
            {
                "bpm": result["bpm"],
                "duration_seconds": result["songManifest"]["durationSec"],
            },
        )

        song_lesson = insert_song_lesson(
            {
                "id": str(uuid4()),
                "owner_user_id": owner_user_id,
                "title": result["songManifest"]["title"],
                "artist": result["songManifest"]["artist"],
                "difficulty_level": result["songManifest"]["difficulty"],
                "backing_track_url": audio_url,
                "duration_seconds": result["songManifest"]["durationSec"],
                "chord_events": result["songManifest"]["chordEvents"],
                "tab_notes": result["songManifest"]["tabNotes"],
                "is_imported": True,
            }
        )

        update_analysis_job(
            job_id,
            {
                "status": "completed",
                "progress_text": "AI transcription complete.",
                "result_payload": {
                    **result,
                    "audio_url": audio_url,
                    "songId": song_lesson["id"],
                    "job_kind": "song_import",
                    "owner_user_id": owner_user_id,
                },
                "error_message": None,
                "completed_at": now_iso(),
            },
        )
    except Exception as exc:
        logger.exception("Song import analysis failed for %s.", job_id)
        update_analysis_job(
            job_id,
            {
                "status": "failed",
                "progress_text": "AI transcription failed.",
                "result_payload": {
                    "audio_url": audio_url,
                    "job_kind": "song_import",
                    "owner_user_id": owner_user_id,
                },
                "error_message": str(exc),
                "completed_at": now_iso(),
            },
        )
    finally:
        if file_path is not None:
            remove_file(file_path)
        release_analysis_job(job_id)


def schedule_song_import_job(
    job_id: str,
    track_id: str,
    audio_url: str,
    file_name: str,
    owner_user_id: Optional[str],
) -> None:
    worker = Thread(
        target=analyze_song_import_task,
        args=(job_id, track_id, audio_url, file_name, owner_user_id),
        daemon=True,
    )
    worker.start()


def resume_incomplete_analysis_jobs() -> None:
    try:
        response = (
            supabase.table("ai_analysis_jobs")
            .select("id,track_id,status,result_payload,tracks!inner(audio_url,original_filename)")
            .in_("status", RECOVERABLE_JOB_STATUSES)
            .execute()
        )
    except Exception:
        logger.exception("Could not query incomplete Supabase analysis jobs during startup.")
        return

    for job in response.data or []:
        track_payload = job.get("tracks") or {}
        if isinstance(track_payload, list):
            track_payload = track_payload[0] if track_payload else {}
        persisted_payload = job.get("result_payload") or {}
        audio_url = track_payload.get("audio_url") or persisted_payload.get("audio_url")
        file_name = track_payload.get("original_filename") or f"{job['track_id']}.bin"

        if not audio_url:
            logger.warning("Job %s has no persisted audio URL, marking it failed.", job["id"])
            update_analysis_job(
                job["id"],
                {
                    "status": "failed",
                    "progress_text": "Analysis failed.",
                    "error_message": "Missing persisted audio URL for recovery.",
                    "completed_at": now_iso(),
                },
            )
            continue

        job_kind = persisted_payload.get("job_kind")
        owner_user_id = coerce_optional_uuid(persisted_payload.get("owner_user_id"))

        logger.info("Resuming Supabase-backed analysis job %s from storage.", job["id"])
        if job_kind == "song_import":
            schedule_song_import_job(job["id"], job["track_id"], audio_url, file_name, owner_user_id)
        else:
            schedule_analysis_job(job["id"], job["track_id"], audio_url, file_name)


@app.on_event("startup")
def startup_tasks() -> None:
    try:
        ensure_audio_bucket()
    except Exception:
        logger.exception("Supabase audio bucket initialization failed during startup.")

    resume_incomplete_analysis_jobs()


@app.get("/")
def read_root():
    return {
        "message": "TuneUp backend ready.",
        "storage": "supabase",
    }


@app.get("/healthz")
def healthz():
    try:
        supabase.table("tracks").select("id").limit(1).execute()
        return {
            "status": "ok",
            "storage": "supabase",
            "supabase_configured": True,
            "supabase_connected": True,
        }
    except Exception as exc:
        logger.exception("Supabase health check failed.")
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "storage": "supabase",
                "supabase_configured": True,
                "supabase_connected": False,
                "supabase_error": str(exc),
            },
        )


@app.post("/recommend")
def recommend_song(data: MoodRequest):
    songs = SONG_DATABASE.get(data.mood, [])
    if not songs:
        return {"status": "error", "message": "No songs found for that mood."}
    return {"status": "success", "recommendation": random.choice(songs)}


@app.post("/analyze-bpm")
async def analyze_bpm(file: UploadFile = File(...)):
    file_path = save_upload(file)
    try:
        y, sr = librosa.load(str(file_path), sr=None)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        bpm = float(tempo) if np.ndim(tempo) == 0 else float(tempo[0])

        return {"status": "success", "bpm": round(bpm, 1), "message": f"{round(bpm)} BPM"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
    finally:
        remove_file(file_path)


@app.post("/detect-pitch")
async def detect_pitch(file: UploadFile = File(...), instrument: str = Form("Guitar")):
    file_path = save_upload(file)
    try:
        y, sr = librosa.load(str(file_path), sr=22050, mono=True, duration=1.2)
        y, _ = librosa.effects.trim(y, top_db=28)

        if y.size < 2048:
            return {"status": "error", "message": "Signal too short"}

        fmin, fmax = PITCH_RANGES.get(instrument, PITCH_RANGES["Guitar"])
        pitches = librosa.yin(
            y,
            fmin=fmin,
            fmax=fmax,
            sr=sr,
            frame_length=2048,
            hop_length=128,
        )

        valid = pitches[np.isfinite(pitches)]
        if valid.size == 0:
            return {"status": "error", "message": "No stable pitch found"}

        median_pitch = float(np.median(valid))
        stable = valid[np.abs(valid - median_pitch) < max(4.0, median_pitch * 0.08)]
        detected_pitch = float(np.median(stable)) if stable.size > 0 else median_pitch

        return {
            "status": "success",
            "frequency": round(detected_pitch, 2),
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
    finally:
        remove_file(file_path)


@app.post("/save-traffic")
def save_traffic(data: TrafficData):
    track: Optional[dict] = None

    try:
        normalized_user_id = coerce_optional_uuid(data.user_id)
        legacy_user_id = None if normalized_user_id else normalize_legacy_user_id(data.user_id)
        track = insert_track(
            {
                "user_id": normalized_user_id,
                "title": data.song_name.strip() or "Untitled",
                "duration_seconds": data.duration,
                "track_source": "saved-traffic",
                "key": legacy_track_owner_value(legacy_user_id) if legacy_user_id else None,
            }
        )

        marker_rows = [
            {
                "track_id": track["id"],
                "source_marker_id": marker.id,
                "label": marker.label,
                "position_x": marker.x,
                "color_hex": marker.color,
            }
            for marker in data.markers
        ]

        if marker_rows:
            supabase.table("track_markers").insert(marker_rows).execute()

        return {
            "status": "success",
            "message": f"{data.song_name} saved successfully.",
            "storage": "supabase",
            "track_id": track["id"],
        }
    except Exception as exc:
        logger.exception("Failed to save traffic data.")
        if track is not None:
            try:
                supabase.table("tracks").delete().eq("id", track["id"]).execute()
            except Exception:
                logger.exception("Failed to roll back orphaned saved-traffic track %s.", track["id"])
        return {"status": "error", "message": str(exc)}


@app.get("/get-traffic")
def get_traffic(user_id: Optional[str] = None):
    try:
        normalized_user_id = coerce_optional_uuid(user_id)
        legacy_user_id = None if normalized_user_id else normalize_legacy_user_id(user_id)
        if user_id is not None and normalized_user_id is None and legacy_user_id is None:
            return []
        return fetch_saved_traffic_records(normalized_user_id, legacy_user_id)
    except Exception:
        logger.exception("Failed to fetch traffic records.")
        return []


@app.post("/sync-leaderboard")
def sync_leaderboard(profile: LeaderboardProfile):
    normalized_user_id = coerce_optional_uuid(profile.user_id)
    if normalized_user_id is None:
        logger.warning("Skipping Supabase leaderboard sync for legacy player id '%s'.", profile.user_id)
        return {
            "status": "accepted",
            "storage": "supabase",
            "mode": "legacy-player-skipped",
        }

    try:
        payload = {
            "username": profile.display_name.strip() or None,
            "total_xp": max(profile.xp, 0),
            "current_streak": max(profile.streak_days, 0),
            "longest_streak": max(profile.longest_streak, max(profile.streak_days, 0)),
        }
        supabase.table("users").update(payload).eq("id", normalized_user_id).execute()
        sync_user_achievements(normalized_user_id, profile.badges)
        sync_completed_progress_rows(
            progress_table="user_lesson_progress",
            catalog_table="lessons",
            content_id_field="lesson_id",
            user_id=normalized_user_id,
            content_ids=profile.completed_lesson_ids,
        )
        sync_completed_progress_rows(
            progress_table="user_song_progress",
            catalog_table="song_lessons",
            content_id_field="song_lesson_id",
            user_id=normalized_user_id,
            content_ids=profile.completed_song_ids,
        )
        sync_completed_progress_rows(
            progress_table="user_theory_activity_progress",
            catalog_table="theory_activities",
            content_id_field="theory_activity_id",
            user_id=normalized_user_id,
            content_ids=profile.completed_quiz_ids,
        )
        return {"status": "success", "storage": "supabase"}
    except Exception as exc:
        logger.exception("Failed to sync leaderboard profile.")
        return {"status": "error", "message": str(exc)}


@app.get("/leaderboard")
def get_leaderboard(limit: int = 8):
    safe_limit = max(1, min(limit, 20))

    try:
        response = (
            supabase.table("users")
            .select(
                "id,username,total_xp,current_level,current_streak,longest_streak,updated_at,"
                "user_achievements(achievement_id,unlocked_at),"
                "user_lesson_progress(lesson_id,status),"
                "user_song_progress(song_lesson_id,status),"
                "user_theory_activity_progress(theory_activity_id,status)"
            )
            .order("total_xp", desc=True)
            .limit(safe_limit)
            .execute()
        )
        leaderboard_rows = response.data or []

        leaderboard = [
            {
                "user_id": row["id"],
                "display_name": row.get("username") or "Player",
                "xp": row.get("total_xp") or 0,
                "level": row.get("current_level") or 1,
                "streak_days": row.get("current_streak") or 0,
                "longest_streak": row.get("longest_streak") or 0,
                "badges": [
                    badge["achievement_id"]
                    for badge in sorted(
                        row.get("user_achievements") or [],
                        key=lambda item: item.get("unlocked_at") or "",
                    )
                ],
                "completed_lessons": sum(
                    1 for item in (row.get("user_lesson_progress") or []) if item.get("status") == "completed"
                ),
                "completed_songs": sum(
                    1 for item in (row.get("user_song_progress") or []) if item.get("status") == "completed"
                ),
                "completed_quizzes": sum(
                    1
                    for item in (row.get("user_theory_activity_progress") or [])
                    if item.get("status") == "completed"
                ),
                "updated_at": row.get("updated_at"),
            }
            for row in leaderboard_rows
        ]

        return {"status": "success", "leaderboard": leaderboard, "storage": "supabase"}
    except Exception as exc:
        logger.exception("Failed to fetch leaderboard.")
        return {"status": "error", "leaderboard": [], "message": str(exc)}


@app.post("/upload-audio")
async def upload_audio(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
):
    file_name = file.filename or f"{uuid4().hex}.bin"
    file_path = save_upload(file)
    normalized_user_id = coerce_optional_uuid(user_id)
    storage_path: Optional[str] = None
    track: Optional[dict] = None

    try:
        storage_payload = upload_audio_to_storage(file_path, file_name, file.content_type)
        storage_path = storage_payload["storage_path"]
        audio_url = storage_payload["audio_url"]

        track = insert_track(
            {
                "user_id": normalized_user_id,
                "title": Path(file_name).stem or "Untitled",
                "original_filename": file_name,
                "audio_url": audio_url,
                "duration_seconds": 0,
                "track_source": "uploaded",
            }
        )
        job = insert_ai_analysis_job(
            {
                "track_id": track["id"],
                "status": "pending",
                "progress_text": "Upload complete. Background scan queued.",
                "result_payload": {
                    "job_kind": "track_analysis",
                    "audio_url": audio_url,
                    "storage_path": storage_path,
                },
            }
        )
    except Exception as exc:
        logger.exception("Could not create Supabase track/job rows for upload.")
        if track is not None:
            try:
                supabase.table("tracks").delete().eq("id", track["id"]).execute()
            except Exception:
                logger.exception("Failed to clean up orphaned track %s.", track["id"])
        remove_storage_object(storage_path)
        remove_file(file_path)
        raise HTTPException(status_code=500, detail="Could not start the background scan.") from exc
    finally:
        remove_file(file_path)

    schedule_analysis_job(job["id"], track["id"], track["audio_url"], file_name)

    return {
        "status": "accepted",
        "task_id": job["id"],
        "progress_text": job.get("progress_text") or "Background scan started.",
        "message": "Upload complete. You can poll this task for progress.",
        "track_id": track["id"],
    }


@app.post("/analyze-audio")
async def analyze_audio(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
):
    file_name = file.filename or f"{uuid4().hex}.bin"
    file_path = save_upload(file)
    normalized_user_id = coerce_optional_uuid(user_id)
    storage_path: Optional[str] = None
    track: Optional[dict] = None

    try:
        storage_payload = upload_audio_to_storage(file_path, file_name, file.content_type)
        storage_path = storage_payload["storage_path"]
        audio_url = storage_payload["audio_url"]

        track = insert_track(
            {
                "user_id": normalized_user_id,
                "title": Path(file_name).stem or "Imported Song",
                "original_filename": file_name,
                "audio_url": audio_url,
                "duration_seconds": 0,
                "track_source": "uploaded",
            }
        )
        job = insert_ai_analysis_job(
            {
                "track_id": track["id"],
                "status": "pending",
                "progress_text": "Upload complete. AI transcription queued.",
                "result_payload": {
                    "job_kind": "song_import",
                    "audio_url": audio_url,
                    "storage_path": storage_path,
                    "owner_user_id": normalized_user_id,
                },
            }
        )
    except Exception as exc:
        logger.exception("Could not create song import job rows for upload.")
        if track is not None:
            try:
                supabase.table("tracks").delete().eq("id", track["id"]).execute()
            except Exception:
                logger.exception("Failed to clean up orphaned song import track %s.", track["id"])
        remove_storage_object(storage_path)
        remove_file(file_path)
        raise HTTPException(status_code=500, detail="Could not start AI transcription.") from exc
    finally:
        remove_file(file_path)

    schedule_song_import_job(job["id"], track["id"], track["audio_url"], file_name, normalized_user_id)

    return {
        "status": "accepted",
        "task_id": job["id"],
        "progress_text": job.get("progress_text") or "AI transcription started.",
        "message": "Audio uploaded. Poll this task while AI builds your chord chart.",
        "track_id": track["id"],
    }


@app.get("/task-status/{task_id}")
def task_status(task_id: str):
    normalized_task_id = parse_uuid(task_id, "task_id")
    payload = fetch_analysis_job(normalized_task_id)

    if not payload:
        raise HTTPException(status_code=404, detail="Task not found.")

    if payload["status"] == "completed":
        return {
            "status": "completed",
            "task_id": normalized_task_id,
            "progress_text": payload.get("progress_text") or "Analysis complete.",
            "result": payload.get("result_payload"),
            "updated_at": payload.get("updated_at"),
        }

    if payload["status"] == "failed":
        return {
            "status": "failed",
            "task_id": normalized_task_id,
            "progress_text": payload.get("progress_text") or "Analysis failed.",
            "message": payload.get("error_message") or "The scan failed.",
            "updated_at": payload.get("updated_at"),
        }

    return {
        "status": "processing",
        "task_id": normalized_task_id,
        "progress_text": payload.get("progress_text") or "Analysis is still running...",
        "updated_at": payload.get("updated_at"),
    }


@app.post("/analyze-full")
async def analyze_full(file: UploadFile = File(...)):
    file_path = save_upload(file)
    logger.info("Synchronous analysis started for %s.", file.filename)

    try:
        result = build_analysis_result(file_path)
        return {"status": "success", **result}
    except Exception as exc:
        logger.exception("Synchronous analysis failed.")
        return {"status": "error", "message": str(exc)}
    finally:
        remove_file(file_path)
