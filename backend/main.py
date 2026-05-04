import logging
import random
import re
import shutil
import socket
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from datetime import datetime, timezone
from mimetypes import guess_type
from pathlib import Path
from threading import Lock, Thread
from typing import Callable, Dict, List, Optional, Tuple
from urllib.error import URLError
from urllib.request import urlopen
from uuid import UUID, uuid4

import librosa
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from supabase import Client, create_client

from config import get_settings

settings = get_settings()

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("tuneup.backend")

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()

REMOTE_AUDIO_TIMEOUT_SECONDS = 20
SYNC_ANALYSIS_TIMEOUT_SECONDS = 45
BACKGROUND_ANALYSIS_TIMEOUT_SECONDS = 120
ANALYSIS_JOB_TIMEOUT_SECONDS = settings.analysis_job_timeout_seconds

JOB_STATUS_PENDING = "pending"
JOB_STATUS_PROCESSING = "processing"
JOB_STATUS_COMPLETED = "completed"
JOB_STATUS_FAILED = "failed"
JOB_STATUS_TIMED_OUT = "timed_out"
TERMINAL_JOB_STATUSES = {JOB_STATUS_COMPLETED, JOB_STATUS_FAILED, JOB_STATUS_TIMED_OUT}
UNFINISHED_JOB_STATUSES = {JOB_STATUS_PENDING, JOB_STATUS_PROCESSING}
SAFE_ANALYSIS_FAILURE_MESSAGE = "Audio analysis failed. Please try another file or try again."
SAFE_ANALYSIS_TIMEOUT_MESSAGE = "Audio analysis timed out. Please try another file or try again."
SUPPORTED_AUDIO_EXTENSIONS = {
    ".aac",
    ".flac",
    ".m4a",
    ".mp3",
    ".mp4",
    ".ogg",
    ".wav",
    ".webm",
}
SUPPORTED_AUDIO_MIME_PREFIX = "audio/"
STORAGE_AUDIO_EXTENSIONS = {".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav", ".webm"}
CONTENT_TYPE_AUDIO_EXTENSIONS = {
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/m4a": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
    "audio/opus": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
}


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

ANALYSIS_AUDIO_BUCKET = settings.supabase_audio_bucket
ANALYSIS_AUDIO_PREFIX = settings.supabase_audio_prefix
LEGACY_TRACK_OWNER_PREFIX = "legacy-player:"
RECOVERABLE_JOB_STATUSES = (JOB_STATUS_PENDING, JOB_STATUS_PROCESSING)
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
DEFAULT_AI_DRAFT_WARNING = "AI-generated tabs are drafts and may require correction."
TUNING_PRESETS = {
    "guitar_standard": {
        "instrument": "guitar",
        "name": "Standard",
        "stringNotes": ["E2", "A2", "D3", "G3", "B3", "E4"],
    },
    "guitar_drop_d": {
        "instrument": "guitar",
        "name": "Drop D",
        "stringNotes": ["D2", "A2", "D3", "G3", "B3", "E4"],
    },
    "guitar_half_step_down": {
        "instrument": "guitar",
        "name": "Half Step Down",
        "stringNotes": ["Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4"],
    },
    "guitar_drop_c_sharp": {
        "instrument": "guitar",
        "name": "Drop C#",
        "stringNotes": ["C#2", "G#2", "C#3", "F#3", "A#3", "D#4"],
    },
    "guitar_custom_unknown": {
        "instrument": "guitar",
        "name": "Custom / Unknown",
        "stringNotes": [],
        "isUnknown": True,
    },
    "bass_standard": {
        "instrument": "bass",
        "name": "Standard Bass",
        "stringNotes": ["E1", "A1", "D2", "G2"],
    },
    "bass_drop_d": {
        "instrument": "bass",
        "name": "Drop D Bass",
        "stringNotes": ["D1", "A1", "D2", "G2"],
    },
    "bass_half_step_down": {
        "instrument": "bass",
        "name": "Half Step Down Bass",
        "stringNotes": ["Eb1", "Ab1", "Db2", "Gb2"],
    },
    "bass_custom_unknown": {
        "instrument": "bass",
        "name": "Custom / Unknown",
        "stringNotes": [],
        "isUnknown": True,
    },
}
DEFAULT_TUNING_ID_BY_INSTRUMENT = {
    "guitar": "guitar_standard",
    "bass": "bass_standard",
}


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


class StorageUploadError(RuntimeError):
    """Raised when the backend cannot store uploaded audio safely."""


def error_payload(code: str, message: str, details: Optional[dict] = None) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
        }
    }


def api_exception(
    status_code: int, code: str, message: str, details: Optional[dict] = None
) -> HTTPException:
    return HTTPException(status_code=status_code, detail=error_payload(code, message, details))


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    detail = exc.detail

    if isinstance(detail, dict) and "error" in detail:
        content = detail
    elif isinstance(detail, dict) and "code" in detail and "message" in detail:
        content = {"error": detail}
    else:
        content = error_payload("http_error", str(detail))

    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=error_payload(
            "validation_error",
            "The request payload is invalid.",
            {"issues": exc.errors()},
        ),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(_: Request, exc: Exception):
    logger.exception("Unhandled backend error.")
    return JSONResponse(
        status_code=500,
        content=error_payload(
            "internal_server_error",
            "TuneUp backend hit an unexpected error.",
            {"type": exc.__class__.__name__},
        ),
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_with_timeout(
    operation: Callable[[], dict],
    *,
    timeout_seconds: int,
    timeout_message: str,
) -> dict:
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(operation)

    try:
        return future.result(timeout=timeout_seconds)
    except FuturesTimeoutError as exc:
        future.cancel()
        raise TimeoutError(timeout_message) from exc
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def init_supabase_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_key)


supabase: Client = init_supabase_client()


def remove_file(path: Path) -> None:
    if path.exists():
        path.unlink()


def parse_uuid(value: str, field_name: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise api_exception(400, "invalid_uuid", f"{field_name} must be a valid UUID.") from exc


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


def validate_audio_upload(file_name: str, content_type: Optional[str]) -> None:
    suffix = Path(file_name or "").suffix.lower()
    has_supported_extension = suffix in SUPPORTED_AUDIO_EXTENSIONS
    has_supported_content_type = bool(
        content_type and content_type.lower().startswith(SUPPORTED_AUDIO_MIME_PREFIX)
    )

    if not has_supported_extension and not has_supported_content_type:
        raise api_exception(
            415,
            "unsupported_audio_type",
            "Upload a supported audio file such as MP3, M4A, WAV, AAC, OGG, or FLAC.",
        )


def normalize_instrument(value: Optional[str]) -> str:
    normalized = (value or "guitar").strip().lower()
    if normalized not in {"guitar", "bass"}:
        raise api_exception(
            422,
            "invalid_instrument",
            "instrument must be guitar or bass.",
        )
    return normalized


def parse_string_notes(value: Optional[str]) -> List[str]:
    if not value or not value.strip():
        return []

    notes = [part.strip() for part in value.split(",")]
    if any(not note for note in notes):
        raise api_exception(
            422,
            "invalid_string_notes",
            "string_notes must be comma-separated note names with no empty entries.",
        )

    note_pattern = r"^(?:[A-G](?:#|b)?)(?:-?\d)$"
    if any(re.match(note_pattern, note) is None for note in notes):
        raise api_exception(
            422,
            "invalid_string_notes",
            "string_notes must look like E2,A2,D3,G3,B3,E4.",
        )

    return notes


def build_tuning_metadata(
    instrument: Optional[str],
    tuning_id: Optional[str],
    tuning_name: Optional[str],
    string_notes: Optional[str],
) -> dict:
    normalized_instrument = normalize_instrument(instrument)
    requested_tuning_id = (tuning_id or DEFAULT_TUNING_ID_BY_INSTRUMENT[normalized_instrument]).strip()
    preset = TUNING_PRESETS.get(requested_tuning_id)

    if preset and preset["instrument"] != normalized_instrument:
        raise api_exception(
            422,
            "invalid_tuning",
            "tuning_id does not match the selected instrument.",
        )

    parsed_string_notes = parse_string_notes(string_notes)

    if preset:
        string_note_values = parsed_string_notes or list(preset["stringNotes"])
        name = (tuning_name or preset["name"]).strip() or preset["name"]
        is_unknown = bool(preset.get("isUnknown"))
    else:
        string_note_values = parsed_string_notes
        name = (tuning_name or "Custom / Unknown").strip() or "Custom / Unknown"
        is_unknown = True

    expected_string_count = 4 if normalized_instrument == "bass" else 6
    if string_note_values and len(string_note_values) != expected_string_count:
        raise api_exception(
            422,
            "invalid_string_notes",
            f"{normalized_instrument} tuning must include {expected_string_count} string notes.",
        )

    return {
        "instrument": normalized_instrument,
        "tuning": {
            "id": requested_tuning_id,
            "name": name,
            "stringNotes": string_note_values,
        },
        "isUnknown": is_unknown or not string_note_values,
    }


def save_upload(file: UploadFile) -> Path:
    target_path = build_upload_path(file.filename or "upload.bin")
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    if not target_path.exists() or target_path.stat().st_size == 0:
        remove_file(target_path)
        raise api_exception(400, "empty_audio_upload", "Upload a non-empty audio file.")

    return target_path


def normalize_audio_extension(file_name: str, content_type: Optional[str]) -> str:
    suffix = Path(Path(file_name or "").name).suffix.lower()
    if suffix in STORAGE_AUDIO_EXTENSIONS:
        return suffix

    normalized_content_type = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized_content_type in CONTENT_TYPE_AUDIO_EXTENSIONS:
        return CONTENT_TYPE_AUDIO_EXTENSIONS[normalized_content_type]

    guessed_type = guess_type(Path(file_name or "").name)[0]
    if guessed_type:
        guessed_extension = CONTENT_TYPE_AUDIO_EXTENSIONS.get(guessed_type.lower())
        if guessed_extension:
            return guessed_extension

    return ".bin"


def build_storage_object_key(file_name: str, content_type: Optional[str]) -> str:
    safe_extension = normalize_audio_extension(file_name, content_type)
    return (
        f"{ANALYSIS_AUDIO_PREFIX}/"
        f"{datetime.now(timezone.utc).strftime('%Y/%m/%d')}/"
        f"{uuid4().hex}{safe_extension}"
    )


def ensure_audio_bucket() -> None:
    try:
        supabase.storage.get_bucket(ANALYSIS_AUDIO_BUCKET)
    except Exception:
        logger.info(
            "Creating Supabase storage bucket '%s' for analysis audio.", ANALYSIS_AUDIO_BUCKET
        )
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
                    "audio/flac",
                    "audio/m4a",
                    "audio/ogg",
                    "audio/webm",
                    "application/octet-stream",
                ],
            },
        )


def upload_audio_to_storage(file_path: Path, file_name: str, content_type: Optional[str]) -> dict:
    ensure_audio_bucket()

    storage_path = build_storage_object_key(file_name, content_type)
    resolved_content_type = content_type or guess_type(file_name)[0] or "application/octet-stream"

    try:
        supabase.storage.from_(ANALYSIS_AUDIO_BUCKET).upload(
            storage_path,
            file_path,
            {
                "content-type": resolved_content_type,
                "upsert": "true",
                "cache-control": "3600",
            },
        )
    except Exception as exc:
        logger.exception("Failed to upload audio to Supabase Storage.")
        raise StorageUploadError("Could not store the uploaded audio file.") from exc

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

    try:
        with (
            urlopen(audio_url, timeout=REMOTE_AUDIO_TIMEOUT_SECONDS) as response,
            target_path.open("wb") as buffer,
        ):
            shutil.copyfileobj(response, buffer)
    except (TimeoutError, URLError, socket.timeout) as exc:
        remove_file(target_path)
        raise TimeoutError("Timed out while downloading audio for analysis.") from exc

    return target_path


def build_section_marker(marker_time: float, label: str, marker_id: Optional[int] = None) -> dict:
    return {
        "id": (
            marker_id
            if marker_id is not None
            else int(marker_time * 10000) + random.randint(0, 999)
        ),
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

    for index, (ratio, label) in enumerate(zip(anchors, labels, strict=False), start=1):
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
    root_index = (
        CHROMA_NOTE_NAMES.index(normalized_root) if normalized_root in CHROMA_NOTE_NAMES else 0
    )
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

    confidence = max(
        0.0, min(1.0, (best_score + max(0.0, best_score - max(second_score, 0.0))) / 2.0)
    )
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
        grid = [
            round(float(step), 3)
            for step in np.arange(0.0, duration_seconds + beat_duration, beat_duration)
        ]
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


def note_name_to_midi(note: str) -> Optional[int]:
    match = re.match(r"^([A-G](?:#|b)?)(-?\d)$", note.strip())
    if not match:
        return None

    raw_name, octave_text = match.groups()
    name = {
        "Bb": "A#",
        "Db": "C#",
        "Eb": "D#",
        "Gb": "F#",
        "Ab": "G#",
    }.get(raw_name, raw_name)
    if name not in CHROMA_NOTE_NAMES:
        return None

    return (int(octave_text) + 1) * 12 + CHROMA_NOTE_NAMES.index(name)


def chord_tone_midis(chord: str, preferred_octave: int) -> List[int]:
    root = chord[:2] if len(chord) > 1 and chord[1] in {"#", "b"} else chord[:1]
    normalized_root = {
        "Bb": "A#",
        "Db": "C#",
        "Eb": "D#",
        "Gb": "F#",
        "Ab": "G#",
    }.get(root, root)
    if normalized_root not in CHROMA_NOTE_NAMES:
        normalized_root = "E"

    root_index = CHROMA_NOTE_NAMES.index(normalized_root)
    suffix = chord[len(root):]
    is_minor = suffix.startswith("m") and not suffix.startswith("maj")
    intervals = [0, 3 if is_minor else 4, 7]
    root_midi = ((preferred_octave + 1) * 12) + root_index
    return [root_midi + interval for interval in intervals]


MAX_GENERATED_TAB_FRET = 24
TAB_MAPPING_STYLE_BALANCED = "balanced"


def generate_tab_position_candidates(
    target_midi: int,
    string_midis: List[int],
    max_fret: int = MAX_GENERATED_TAB_FRET,
) -> List[Tuple[int, int]]:
    candidates: List[Tuple[int, int]] = []

    for string_index, open_midi in enumerate(string_midis):
        fret = target_midi - open_midi
        if 0 <= fret <= max_fret:
            candidates.append((string_index, int(fret)))

    return candidates


def choose_phrase_anchor_fret(
    target_midis: List[int],
    string_midis: List[int],
    mapping_style: str = TAB_MAPPING_STYLE_BALANCED,
) -> int:
    if mapping_style == "low_position":
        return 2
    if mapping_style == "mid_position":
        return 9

    anchor_options = [2, 5, 7, 9, 12] if len(string_midis) > 4 else [2, 5, 7, 9]
    preferred_anchor = 7 if len(string_midis) > 4 else 5
    best_anchor = preferred_anchor
    best_score = float("inf")

    for anchor in anchor_options:
        score = abs(anchor - preferred_anchor) * 0.2
        covered = 0

        for target_midi in target_midis:
            candidates = generate_tab_position_candidates(target_midi, string_midis)
            if not candidates:
                continue

            covered += 1
            score += min(
                abs(fret - anchor) + (3.2 if fret == 0 and anchor >= 5 else 0.0)
                for _string_index, fret in candidates
            )

        score += (len(target_midis) - covered) * 20
        if score < best_score:
            best_score = score
            best_anchor = anchor

    return best_anchor


def score_tab_position_candidate(
    candidate: Tuple[int, int],
    previous_position: Optional[Tuple[int, int]],
    phrase_anchor_fret: int,
    mapping_style: str = TAB_MAPPING_STYLE_BALANCED,
) -> float:
    string_index, fret = candidate
    score = abs(fret - phrase_anchor_fret) * (0.2 if mapping_style == "low_position" else 0.55)

    if fret == 0:
        score += 0.0 if mapping_style == "low_position" else 3.8
    elif fret <= 2 and mapping_style == TAB_MAPPING_STYLE_BALANCED and phrase_anchor_fret >= 5:
        score += 1.3

    if fret > 17:
        score += (fret - 17) * 1.2

    if previous_position is not None:
        previous_string, previous_fret = previous_position
        score += abs(fret - previous_fret) * 0.8
        score += abs(string_index - previous_string) * 0.5

        if candidate == previous_position:
            score -= 2.5
        if fret == 0 and previous_fret >= 3:
            score += 3.0
        if abs(fret - previous_fret) > 7:
            score += 2.4

    return score


def choose_tuned_tab_position(
    target_midi: int,
    string_midis: List[int],
    previous_position: Optional[Tuple[int, int]] = None,
    phrase_anchor_fret: Optional[int] = None,
    mapping_style: str = TAB_MAPPING_STYLE_BALANCED,
) -> Tuple[int, int]:
    # This is still heuristic draft tab mapping: selected tuning gives the right
    # open-string pitches, while scoring tries to keep riffs in playable regions.
    candidates = generate_tab_position_candidates(target_midi, string_midis)
    best_position = (0, 0)
    best_score = float("inf")
    anchor_fret = phrase_anchor_fret if phrase_anchor_fret is not None else choose_phrase_anchor_fret([target_midi], string_midis, mapping_style)

    for candidate in candidates:
        score = score_tab_position_candidate(candidate, previous_position, anchor_fret, mapping_style)
        if score < best_score:
            best_score = score
            best_position = candidate

    if best_score != float("inf"):
        return best_position

    fallback_string = max(0, min(len(string_midis) - 1, len(string_midis) // 2))
    return fallback_string, 0


def build_generic_tab_notes(
    chord_events: List[dict],
    beat_grid: List[float],
    duration_seconds: float,
    tuning_metadata: Optional[dict] = None,
) -> List[dict]:
    notes: List[dict] = []
    anchor_beats = beat_grid[:-1] if len(beat_grid) > 1 else [0.0]
    tuning = (tuning_metadata or {}).get("tuning") if tuning_metadata else None
    string_notes = tuning.get("stringNotes") if isinstance(tuning, dict) else []
    string_midis = [
        midi
        for note in (string_notes or [])
        if (midi := note_name_to_midi(str(note))) is not None
    ]
    if not string_midis:
        string_midis = [
            midi
            for note in TUNING_PRESETS["guitar_standard"]["stringNotes"]
            if (midi := note_name_to_midi(str(note))) is not None
        ]
    preferred_octave = 2 if len(string_midis) <= 4 else 3
    target_midis_by_beat = [
        chord_tone_midis(active_chord_at(float(time_sec), chord_events), preferred_octave)[beat_index % 3]
        for beat_index, time_sec in enumerate(anchor_beats)
    ]
    phrase_anchor_fret = choose_phrase_anchor_fret(target_midis_by_beat, string_midis)
    previous_position: Optional[Tuple[int, int]] = None
    previous_time: Optional[float] = None

    for beat_index, time_sec in enumerate(anchor_beats):
        if previous_time is not None and float(time_sec) - previous_time > 2.5:
            previous_position = None

        target_midi = target_midis_by_beat[beat_index]
        string_index, fret = choose_tuned_tab_position(
            target_midi,
            string_midis,
            previous_position,
            phrase_anchor_fret,
        )
        previous_position = (string_index, fret)
        previous_time = float(time_sec)
        next_time = (
            beat_grid[beat_index + 1]
            if beat_index + 1 < len(beat_grid)
            else min(duration_seconds, float(time_sec) + 0.6)
        )
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
    tuning_metadata: Optional[dict] = None,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> dict:
    tuning_metadata = tuning_metadata or build_tuning_metadata("guitar", "guitar_standard", None, None)
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
    confidence_values = [
        event["confidence"] for event in chord_events if event.get("confidence") is not None
    ]
    average_confidence = float(np.mean(confidence_values)) if confidence_values else 0.0
    fallback_used = average_confidence < 0.55 or len(chord_events) < 4

    if not chord_events or average_confidence < 0.32:
        chord_events = build_generic_chord_events(duration_seconds, beat_grid)
        fallback_used = True

    if progress_callback:
        progress_callback("Building a playable tab pattern...")

    tab_notes = [] if tuning_metadata.get("isUnknown") else build_generic_tab_notes(
        chord_events,
        beat_grid,
        duration_seconds,
        tuning_metadata,
    )
    difficulty = infer_song_difficulty(bpm, len(chord_events), len(tab_notes))
    tab_confidence = 0.18 if tuning_metadata.get("isUnknown") else min(0.48, average_confidence * 0.72)
    chord_confidence = min(0.78, max(0.32, average_confidence if chord_events else 0.2))
    section_confidence = 0.58 if len(beat_grid) > 2 else 0.25
    overall_confidence = round(float(np.mean([chord_confidence, tab_confidence, section_confidence])), 3)
    confidence_payload = {
        "overall": overall_confidence,
        "chords": round(chord_confidence, 3),
        "tabs": round(tab_confidence, 3),
        "sections": round(section_confidence, 3),
    }
    warnings = [DEFAULT_AI_DRAFT_WARNING]
    if tab_notes:
        warnings.append(
            "Fret positions are estimated from detected pitch and selected tuning. Please review before practicing."
        )
    if fallback_used:
        warnings.append("TuneUp used fallback tab mapping. Please review before practicing.")
    if tuning_metadata.get("isUnknown"):
        warnings.append("Unknown tuning selected. Generated fret positions may need manual correction.")
    if tab_confidence < 0.4:
        warnings.append(
            "Tab confidence is low. Chords and sections may be more reliable than exact fret positions."
        )

    if progress_callback:
        progress_callback("Saving imported song...")

    song_manifest = {
        "title": title,
        "artist": artist,
        "instrument": tuning_metadata["instrument"],
        "tuning": tuning_metadata["tuning"],
        "difficulty": difficulty,
        "durationSec": round(duration_seconds, 2),
        "aiDraft": True,
        "confidence": confidence_payload,
        "warnings": warnings,
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
        "confidence": confidence_payload,
        "fallbackUsed": fallback_used,
        "warnings": warnings,
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
                label_name = (
                    section_names[name_index] if name_index < len(section_names) else "SECTION"
                )
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
    response = supabase.table("ai_analysis_jobs").select("*").eq("id", job_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def update_analysis_job(job_id: str, payload: dict) -> None:
    supabase.table("ai_analysis_jobs").update(payload).eq("id", job_id).execute()


def update_track(track_id: str, payload: dict) -> None:
    supabase.table("tracks").update(payload).eq("id", track_id).execute()


def finalize_analysis_job_failure(
    *,
    job_id: str,
    status: str,
    progress_text: str,
    error_message: str,
    result_payload: Optional[dict] = None,
) -> None:
    update_analysis_job(
        job_id,
        {
            "status": status,
            "progress_text": progress_text,
            "result_payload": result_payload,
            "error_message": error_message,
            "completed_at": now_iso(),
        },
    )


def parse_job_timestamp(value: object) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def job_age_seconds(job: dict) -> Optional[float]:
    timestamp = parse_job_timestamp(job.get("updated_at")) or parse_job_timestamp(
        job.get("created_at")
    )
    if timestamp is None:
        return None

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    return (datetime.now(timezone.utc) - timestamp).total_seconds()


def is_stale_unfinished_job(job: dict) -> bool:
    if job.get("status") not in UNFINISHED_JOB_STATUSES:
        return False

    age_seconds = job_age_seconds(job)
    return age_seconds is not None and age_seconds > ANALYSIS_JOB_TIMEOUT_SECONDS


def expire_stale_analysis_job(job: dict) -> dict:
    job_id = job["id"]
    logger.warning("Marking stale analysis job %s as timed out.", job_id)
    result_payload = (
        job.get("result_payload") if isinstance(job.get("result_payload"), dict) else {}
    )
    result_payload = {
        **result_payload,
        "timeout_seconds": ANALYSIS_JOB_TIMEOUT_SECONDS,
    }
    finalize_analysis_job_failure(
        job_id=job_id,
        status=JOB_STATUS_TIMED_OUT,
        progress_text="Analysis timed out.",
        error_message=SAFE_ANALYSIS_TIMEOUT_MESSAGE,
        result_payload=result_payload,
    )
    return {
        **job,
        "status": JOB_STATUS_TIMED_OUT,
        "progress_text": "Analysis timed out.",
        "error_message": SAFE_ANALYSIS_TIMEOUT_MESSAGE,
        "result_payload": result_payload,
        "completed_at": now_iso(),
    }


def completed_job_has_result(job: dict) -> bool:
    result_payload = job.get("result_payload")
    return isinstance(result_payload, dict) and bool(result_payload)


def ensure_completed_job_result(job: dict) -> dict:
    if job.get("status") != JOB_STATUS_COMPLETED or completed_job_has_result(job):
        return job

    logger.error("Analysis job %s completed without a retrievable result payload.", job["id"])
    finalize_analysis_job_failure(
        job_id=job["id"],
        status=JOB_STATUS_FAILED,
        progress_text="Analysis failed.",
        error_message=SAFE_ANALYSIS_FAILURE_MESSAGE,
        result_payload=(
            job.get("result_payload") if isinstance(job.get("result_payload"), dict) else None
        ),
    )
    return {
        **job,
        "status": JOB_STATUS_FAILED,
        "progress_text": "Analysis failed.",
        "error_message": SAFE_ANALYSIS_FAILURE_MESSAGE,
        "completed_at": now_iso(),
    }


def job_progress_value(status: str) -> int:
    if status == JOB_STATUS_PENDING:
        return 5
    if status == JOB_STATUS_PROCESSING:
        return 45
    if status in TERMINAL_JOB_STATUSES:
        return 100
    return 0


def job_status_alias(status: str) -> str:
    return {
        JOB_STATUS_PENDING: "queued",
        JOB_STATUS_PROCESSING: "running",
        JOB_STATUS_COMPLETED: "succeeded",
        JOB_STATUS_FAILED: "failed",
        JOB_STATUS_TIMED_OUT: "expired",
    }.get(status, status)


def build_job_status_response(job: dict, task_id: str) -> dict:
    status = job.get("status") or JOB_STATUS_PROCESSING
    result_available = status == JOB_STATUS_COMPLETED and completed_job_has_result(job)

    if status == JOB_STATUS_COMPLETED:
        message = job.get("progress_text") or "Analysis complete."
        error_message = None
    elif status == JOB_STATUS_FAILED:
        message = job.get("progress_text") or "Analysis failed."
        error_message = job.get("error_message") or SAFE_ANALYSIS_FAILURE_MESSAGE
    elif status == JOB_STATUS_TIMED_OUT:
        message = job.get("progress_text") or "Analysis timed out."
        error_message = job.get("error_message") or SAFE_ANALYSIS_TIMEOUT_MESSAGE
    elif status == JOB_STATUS_PENDING:
        message = job.get("progress_text") or "Analysis queued."
        error_message = None
    else:
        message = job.get("progress_text") or "Analysis is still running..."
        error_message = None

    return {
        "status": status,
        "state": job_status_alias(status),
        "task_id": task_id,
        "jobId": task_id,
        "progress": job_progress_value(status),
        "progress_text": message,
        "message": error_message or message,
        "error": error_message,
        "resultAvailable": result_available,
        "updated_at": job.get("updated_at"),
        "finished_at": job.get("completed_at"),
        **({"result": job.get("result_payload")} if result_available else {}),
    }


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
    normalized_badge_ids = sorted(
        {badge_id.strip() for badge_id in badge_ids if badge_id and badge_id.strip()}
    )
    if not normalized_badge_ids:
        return

    valid_badges_response = (
        supabase.table("achievements").select("id").in_("id", normalized_badge_ids).execute()
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
    normalized_ids = sorted(
        {content_id.strip() for content_id in content_ids if content_id and content_id.strip()}
    )
    if not normalized_ids:
        return

    valid_catalog_response = (
        supabase.table(catalog_table).select("id").in_("id", normalized_ids).execute()
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
            "id": (
                marker.get("source_marker_id")
                if marker.get("source_marker_id") is not None
                else index + 1
            ),
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


def fetch_saved_traffic_records(
    user_id: Optional[str] = None, legacy_user_id: Optional[str] = None
) -> List[dict]:
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
        result = run_with_timeout(
            lambda: build_analysis_result(
                file_path,
                progress_callback=lambda message: update_analysis_job(
                    job_id,
                    {
                        "status": "processing",
                        "progress_text": message,
                        "completed_at": None,
                    },
                ),
            ),
            timeout_seconds=BACKGROUND_ANALYSIS_TIMEOUT_SECONDS,
            timeout_message="Background analysis timed out before the track scan finished.",
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
    except TimeoutError as exc:
        logger.exception("Background analysis timed out for %s.", job_id)
        finalize_analysis_job_failure(
            job_id=job_id,
            status="timed_out",
            progress_text="Analysis timed out.",
            error_message=SAFE_ANALYSIS_TIMEOUT_MESSAGE,
            result_payload={
                "audio_url": audio_url,
                "job_kind": "track_analysis",
                "failure_type": exc.__class__.__name__,
            },
        )
    except Exception as exc:
        logger.exception("Background analysis failed for %s.", job_id)
        finalize_analysis_job_failure(
            job_id=job_id,
            status="failed",
            progress_text="Analysis failed.",
            error_message=SAFE_ANALYSIS_FAILURE_MESSAGE,
            result_payload={
                "audio_url": audio_url,
                "job_kind": "track_analysis",
                "failure_type": exc.__class__.__name__,
            },
        )
    finally:
        if file_path is not None:
            remove_file(file_path)
        release_analysis_job(job_id)


def schedule_analysis_job(job_id: str, track_id: str, audio_url: str, file_name: str) -> bool:
    try:
        worker = Thread(
            target=analyze_audio_task,
            args=(job_id, track_id, audio_url, file_name),
            daemon=True,
        )
        worker.start()
        return True
    except Exception as exc:
        logger.exception("Could not start background analysis worker for %s.", job_id)
        finalize_analysis_job_failure(
            job_id=job_id,
            status=JOB_STATUS_FAILED,
            progress_text="Analysis failed to start.",
            error_message=SAFE_ANALYSIS_FAILURE_MESSAGE,
            result_payload={
                "audio_url": audio_url,
                "job_kind": "track_analysis",
                "failure_type": exc.__class__.__name__,
            },
        )
        return False


def analyze_song_import_task(
    job_id: str,
    track_id: str,
    audio_url: str,
    file_name: str,
    owner_user_id: Optional[str],
    tuning_metadata: Optional[dict] = None,
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
        result = run_with_timeout(
            lambda: build_song_manifest(
                file_path,
                title=title,
                artist="AI Transcription",
                tuning_metadata=tuning_metadata,
                progress_callback=lambda message: update_analysis_job(
                    job_id,
                    {
                        "status": "processing",
                        "progress_text": message,
                        "completed_at": None,
                    },
                ),
            ),
            timeout_seconds=BACKGROUND_ANALYSIS_TIMEOUT_SECONDS,
            timeout_message="AI transcription timed out before the import finished.",
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
                    "instrument": result["songManifest"].get("instrument"),
                    "tuning": result["songManifest"].get("tuning"),
                },
                "error_message": None,
                "completed_at": now_iso(),
            },
        )
    except TimeoutError as exc:
        logger.exception("Song import analysis timed out for %s.", job_id)
        finalize_analysis_job_failure(
            job_id=job_id,
            status="timed_out",
            progress_text="AI transcription timed out.",
            error_message=SAFE_ANALYSIS_TIMEOUT_MESSAGE,
            result_payload={
                "audio_url": audio_url,
                "job_kind": "song_import",
                "owner_user_id": owner_user_id,
                "tuning": tuning_metadata,
                "failure_type": exc.__class__.__name__,
            },
        )
    except Exception as exc:
        logger.exception("Song import analysis failed for %s.", job_id)
        finalize_analysis_job_failure(
            job_id=job_id,
            status="failed",
            progress_text="AI transcription failed.",
            error_message=SAFE_ANALYSIS_FAILURE_MESSAGE,
            result_payload={
                "audio_url": audio_url,
                "job_kind": "song_import",
                "owner_user_id": owner_user_id,
                "tuning": tuning_metadata,
                "failure_type": exc.__class__.__name__,
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
    tuning_metadata: Optional[dict] = None,
) -> bool:
    try:
        worker = Thread(
            target=analyze_song_import_task,
            args=(job_id, track_id, audio_url, file_name, owner_user_id, tuning_metadata),
            daemon=True,
        )
        worker.start()
        return True
    except Exception as exc:
        logger.exception("Could not start song import analysis worker for %s.", job_id)
        finalize_analysis_job_failure(
            job_id=job_id,
            status=JOB_STATUS_FAILED,
            progress_text="AI transcription failed to start.",
            error_message=SAFE_ANALYSIS_FAILURE_MESSAGE,
            result_payload={
                "audio_url": audio_url,
                "job_kind": "song_import",
                "owner_user_id": owner_user_id,
                "tuning": tuning_metadata,
                "failure_type": exc.__class__.__name__,
            },
        )
        return False


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
                    "error_message": SAFE_ANALYSIS_FAILURE_MESSAGE,
                    "completed_at": now_iso(),
                },
            )
            continue

        job_kind = persisted_payload.get("job_kind")
        owner_user_id = coerce_optional_uuid(persisted_payload.get("owner_user_id"))

        logger.info("Resuming Supabase-backed analysis job %s from storage.", job["id"])
        if job_kind == "song_import":
            tuning_payload = (
                persisted_payload.get("tuning")
                if isinstance(persisted_payload.get("tuning"), dict)
                else {}
            )
            string_notes = tuning_payload.get("stringNotes") or TUNING_PRESETS["guitar_standard"]["stringNotes"]
            tuning_metadata = {
                "instrument": persisted_payload.get("instrument") or "guitar",
                "tuning": {
                    "id": tuning_payload.get("id") or "guitar_standard",
                    "name": tuning_payload.get("name") or "Standard",
                    "stringNotes": string_notes,
                },
                "isUnknown": not bool(string_notes) or "custom_unknown" in str(tuning_payload.get("id")),
            }
            schedule_song_import_job(
                job["id"], job["track_id"], audio_url, file_name, owner_user_id, tuning_metadata
            )
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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "tuneup-backend",
        "version": "unknown",
        "environment": settings.app_env,
        "timestamp": now_iso(),
    }


@app.get("/ready")
def ready():
    return {
        "status": "ok",
        "service": "tuneup-backend",
        "checks": {
            "config": "ok",
            "supabase": "skipped",
            "storage": "skipped",
        },
        "timestamp": now_iso(),
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
                **error_payload(
                    "supabase_unavailable",
                    "Supabase is unreachable from the backend health check.",
                    {"type": exc.__class__.__name__},
                ),
            },
        )


@app.post("/recommend")
def recommend_song(data: MoodRequest):
    songs = SONG_DATABASE.get(data.mood, [])
    if not songs:
        raise api_exception(404, "recommendation_not_found", "No songs found for that mood.")
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
        logger.exception("BPM analysis failed.")
        raise api_exception(
            500, "bpm_analysis_failed", "Could not analyze BPM.", {"type": exc.__class__.__name__}
        ) from exc
    finally:
        remove_file(file_path)


@app.post("/detect-pitch")
async def detect_pitch(file: UploadFile = File(...), instrument: str = Form("Guitar")):
    file_path = save_upload(file)
    try:
        y, sr = librosa.load(str(file_path), sr=22050, mono=True, duration=1.2)
        y, _ = librosa.effects.trim(y, top_db=28)

        if y.size < 2048:
            raise api_exception(
                422, "signal_too_short", "Signal too short for reliable pitch detection."
            )

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
            raise api_exception(
                422, "pitch_not_found", "No stable pitch was found in the recording."
            )

        median_pitch = float(np.median(valid))
        stable = valid[np.abs(valid - median_pitch) < max(4.0, median_pitch * 0.08)]
        detected_pitch = float(np.median(stable)) if stable.size > 0 else median_pitch

        return {
            "status": "success",
            "frequency": round(detected_pitch, 2),
        }
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        logger.exception("Pitch detection failed.")
        raise api_exception(
            500,
            "pitch_detection_failed",
            "Pitch detection failed.",
            {"type": exc.__class__.__name__},
        ) from exc
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
                logger.exception(
                    "Failed to roll back orphaned saved-traffic track %s.", track["id"]
                )
        raise api_exception(
            500,
            "traffic_save_failed",
            "Could not save the Studio analysis.",
            {"type": exc.__class__.__name__},
        ) from exc


@app.get("/get-traffic")
def get_traffic(user_id: Optional[str] = None):
    try:
        normalized_user_id = coerce_optional_uuid(user_id)
        legacy_user_id = None if normalized_user_id else normalize_legacy_user_id(user_id)
        if user_id is not None and normalized_user_id is None and legacy_user_id is None:
            raise api_exception(
                400, "invalid_user_id", "user_id must be a valid UUID or legacy player id."
            )
        return fetch_saved_traffic_records(normalized_user_id, legacy_user_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to fetch traffic records.")
        raise api_exception(
            500,
            "traffic_fetch_failed",
            "Could not load Studio saves.",
            {"type": exc.__class__.__name__},
        ) from exc


@app.post("/sync-leaderboard")
def sync_leaderboard(profile: LeaderboardProfile):
    normalized_user_id = coerce_optional_uuid(profile.user_id)
    if normalized_user_id is None:
        logger.warning(
            "Skipping Supabase leaderboard sync for legacy player id '%s'.", profile.user_id
        )
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
        raise api_exception(
            500,
            "leaderboard_sync_failed",
            "Could not sync leaderboard profile.",
            {"type": exc.__class__.__name__},
        ) from exc


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
                    1
                    for item in (row.get("user_lesson_progress") or [])
                    if item.get("status") == "completed"
                ),
                "completed_songs": sum(
                    1
                    for item in (row.get("user_song_progress") or [])
                    if item.get("status") == "completed"
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
        raise api_exception(
            500,
            "leaderboard_fetch_failed",
            "Could not fetch the leaderboard.",
            {"type": exc.__class__.__name__},
        ) from exc


@app.post("/upload-audio")
async def upload_audio(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
):
    file_name = file.filename or f"{uuid4().hex}.bin"
    validate_audio_upload(file_name, file.content_type)
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
    except StorageUploadError as exc:
        remove_file(file_path)
        raise api_exception(
            502,
            "audio_storage_upload_failed",
            "Could not store the uploaded audio file. Please try again.",
        ) from exc
    except Exception as exc:
        logger.exception("Could not create Supabase track/job rows for upload.")
        if track is not None:
            try:
                supabase.table("tracks").delete().eq("id", track["id"]).execute()
            except Exception:
                logger.exception("Failed to clean up orphaned track %s.", track["id"])
        remove_storage_object(storage_path)
        remove_file(file_path)
        raise api_exception(
            500, "background_scan_start_failed", "Could not start the background scan."
        ) from exc
    finally:
        remove_file(file_path)

    worker_started = schedule_analysis_job(job["id"], track["id"], track["audio_url"], file_name)

    return {
        "status": "accepted",
        "task_id": job["id"],
        "jobId": job["id"],
        "progress_text": (
            "Background scan started."
            if worker_started
            else "Upload complete, but analysis failed to start."
        ),
        "message": "Upload complete. You can poll this task for progress.",
        "track_id": track["id"],
    }


@app.post("/analyze-audio")
async def analyze_audio(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
    instrument: Optional[str] = Form(None),
    tuning_id: Optional[str] = Form(None),
    tuning_name: Optional[str] = Form(None),
    string_notes: Optional[str] = Form(None),
):
    file_name = file.filename or f"{uuid4().hex}.bin"
    validate_audio_upload(file_name, file.content_type)
    tuning_metadata = build_tuning_metadata(instrument, tuning_id, tuning_name, string_notes)
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
                    "instrument": tuning_metadata["instrument"],
                    "tuning": tuning_metadata["tuning"],
                },
            }
        )
    except StorageUploadError as exc:
        remove_file(file_path)
        raise api_exception(
            502,
            "audio_storage_upload_failed",
            "Could not store the uploaded audio file. Please try again.",
        ) from exc
    except Exception as exc:
        logger.exception("Could not create song import job rows for upload.")
        if track is not None:
            try:
                supabase.table("tracks").delete().eq("id", track["id"]).execute()
            except Exception:
                logger.exception("Failed to clean up orphaned song import track %s.", track["id"])
        remove_storage_object(storage_path)
        remove_file(file_path)
        raise api_exception(
            500, "song_import_start_failed", "Could not start AI transcription."
        ) from exc
    finally:
        remove_file(file_path)

    worker_started = schedule_song_import_job(
        job["id"], track["id"], track["audio_url"], file_name, normalized_user_id, tuning_metadata
    )

    return {
        "status": "accepted",
        "task_id": job["id"],
        "jobId": job["id"],
        "progress_text": (
            "AI transcription started."
            if worker_started
            else "Upload complete, but AI transcription failed to start."
        ),
        "message": "Audio uploaded. Poll this task while AI builds your chord chart.",
        "track_id": track["id"],
    }


@app.get("/task-status/{task_id}")
def task_status(task_id: str):
    normalized_task_id = parse_uuid(task_id, "task_id")
    payload = fetch_analysis_job(normalized_task_id)

    if not payload:
        raise api_exception(404, "task_not_found", "Task not found.")

    payload_with_id = {**payload, "id": payload.get("id") or normalized_task_id}

    if is_stale_unfinished_job(payload_with_id):
        payload_with_id = expire_stale_analysis_job(payload_with_id)

    payload_with_id = ensure_completed_job_result(payload_with_id)
    return build_job_status_response(payload_with_id, normalized_task_id)


@app.post("/analyze-full")
async def analyze_full(file: UploadFile = File(...)):
    file_path = save_upload(file)
    logger.info("Synchronous analysis started for %s.", file.filename)

    try:
        result = run_with_timeout(
            lambda: build_analysis_result(file_path),
            timeout_seconds=SYNC_ANALYSIS_TIMEOUT_SECONDS,
            timeout_message="The analysis job exceeded the synchronous time limit.",
        )
        return {"status": "success", **result}
    except TimeoutError as exc:
        logger.exception("Synchronous analysis timed out.")
        raise api_exception(504, "analysis_timed_out", str(exc)) from exc
    except Exception as exc:
        logger.exception("Synchronous analysis failed.")
        raise api_exception(
            500,
            "analysis_failed",
            "Could not analyze the uploaded track.",
            {"type": exc.__class__.__name__},
        ) from exc
    finally:
        remove_file(file_path)
