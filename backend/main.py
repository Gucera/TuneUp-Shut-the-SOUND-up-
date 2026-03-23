from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, List, Optional
from uuid import UUID, uuid4
import logging
import os
import random
import shutil

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
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


def model_to_dict(model: Any) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


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


def coerce_optional_user_id(user_id: Optional[str]) -> Optional[str]:
    if not user_id or not user_id.strip():
        return None

    try:
        return str(UUID(user_id.strip()))
    except ValueError:
        logger.warning("Ignoring legacy non-UUID user id '%s' while frontend auth migration is still in progress.", user_id)
        return None


def build_upload_path(file_name: str) -> Path:
    safe_name = Path(file_name or "upload.bin").name
    suffix = Path(safe_name).suffix or ".bin"
    return UPLOAD_DIR / f"{uuid4().hex}{suffix}"


def save_upload(file: UploadFile) -> Path:
    target_path = build_upload_path(file.filename or "upload.bin")
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return target_path


def build_section_marker(marker_time: float, label: str, marker_id: Optional[int] = None) -> dict:
    return {
        "id": marker_id if marker_id is not None else int(marker_time * 10000) + random.randint(0, 999),
        "label": label,
        "color": SECTION_COLORS.get(label, "#56cfe1"),
        "x": 0,
        "time": float(marker_time),
    }


def build_fallback_markers() -> List[dict]:
    labels = ["VERSE 1", "CHORUS", "VERSE 2", "CHORUS"]
    times = [30.0, 60.0, 90.0, 120.0]
    return [
        build_section_marker(marker_time, label, int(marker_time * 1000))
        for marker_time, label in zip(times, labels)
    ]


def build_analysis_result(
    file_path: Path,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> dict:
    if progress_callback:
        progress_callback("Loading audio file...")

    y, sr = librosa.load(str(file_path), sr=None, duration=180)
    duration_seconds = float(librosa.get_duration(y=y, sr=sr))

    if progress_callback:
        progress_callback("Detecting BPM and groove...")

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    bpm = float(tempo) if np.ndim(tempo) == 0 else float(tempo[0])

    ai_markers: List[dict] = []

    if progress_callback:
        progress_callback("Mapping song sections...")

    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        bounds = librosa.segment.agglomerative(chroma, 6)
        bound_times = sorted(list(librosa.frames_to_time(bounds, sr=sr)))
        logger.info("Raw boundaries found: %s", bound_times)

        section_names = ["INTRO", "VERSE 1", "CHORUS", "VERSE 2", "BRIDGE", "OUTRO"]
        last_time = -10.0
        name_index = 0

        for timestamp in bound_times:
            if 5.0 < timestamp < 175.0 and (timestamp - last_time > 15.0):
                label_name = section_names[name_index] if name_index < len(section_names) else "SECTION"
                ai_markers.append(build_section_marker(timestamp, label_name))
                last_time = timestamp
                name_index += 1

        if len(ai_markers) == 0:
            logger.info("AI found no sections, adding default markers.")
            ai_markers.extend(build_fallback_markers())
    except Exception:
        logger.exception("Segmentation error while building analysis markers.")

    if progress_callback:
        progress_callback("Finalizing markers...")

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


def fetch_track_markers(track_id: str) -> List[dict]:
    response = (
        supabase.table("track_markers")
        .select("source_marker_id,label,start_time,position_x,color_hex,created_at")
        .eq("track_id", track_id)
        .order("created_at")
        .execute()
    )
    return response.data or []


def map_saved_traffic_entry(track_row: dict) -> dict:
    marker_rows = fetch_track_markers(track_row["id"])
    markers = [
        {
            "id": marker.get("source_marker_id") if marker.get("source_marker_id") is not None else index + 1,
            "label": marker["label"],
            "color": marker["color_hex"],
            "x": marker.get("position_x") or 0,
        }
        for index, marker in enumerate(marker_rows)
    ]
    return {
        "song_name": track_row["title"],
        "duration": track_row.get("duration_seconds") or 0,
        "markers": markers,
        "user_id": track_row.get("user_id"),
        "created_at": track_row.get("created_at"),
    }


def fetch_saved_traffic_records(user_id: Optional[str] = None) -> List[dict]:
    query = (
        supabase.table("tracks")
        .select("id,title,duration_seconds,user_id,created_at")
        .eq("track_source", "saved-traffic")
        .order("created_at", desc=True)
    )

    if user_id:
        query = query.eq("user_id", user_id)

    response = query.execute()
    return [map_saved_traffic_entry(track_row) for track_row in (response.data or [])]


def sync_user_achievements(user_id: str, badge_ids: List[str]) -> None:
    for badge_id in badge_ids:
        achievement_response = (
            supabase.table("achievements")
            .select("id")
            .eq("id", badge_id)
            .limit(1)
            .execute()
        )
        achievements = achievement_response.data or []
        if not achievements:
            continue

        existing_response = (
            supabase.table("user_achievements")
            .select("id")
            .eq("user_id", user_id)
            .eq("achievement_id", badge_id)
            .limit(1)
            .execute()
        )
        existing = existing_response.data or []
        if existing:
            continue

        supabase.table("user_achievements").insert(
            {
                "user_id": user_id,
                "achievement_id": badge_id,
            }
        ).execute()


def count_completed_rows(table_name: str, user_id: str) -> int:
    response = (
        supabase.table(table_name)
        .select("id")
        .eq("user_id", user_id)
        .eq("status", "completed")
        .execute()
    )
    return len(response.data or [])


def fetch_user_badge_ids(user_id: str) -> List[str]:
    response = (
        supabase.table("user_achievements")
        .select("achievement_id,unlocked_at")
        .eq("user_id", user_id)
        .order("unlocked_at")
        .execute()
    )
    return [row["achievement_id"] for row in (response.data or [])]


def analyze_audio_task(job_id: str, track_id: str, file_path_str: str, file_name: str) -> None:
    file_path = Path(file_path_str)
    logger.info("Background analysis started for %s (%s).", file_name, job_id)

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
                "result_payload": result,
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
                "result_payload": None,
                "error_message": str(exc),
                "completed_at": now_iso(),
            },
        )
    finally:
        remove_file(file_path)


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
        return {
            "status": "degraded",
            "storage": "supabase",
            "supabase_configured": True,
            "supabase_connected": False,
            "supabase_error": str(exc),
        }


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
    try:
        normalized_user_id = coerce_optional_user_id(data.user_id)
        track = insert_track(
            {
                "user_id": normalized_user_id,
                "title": data.song_name.strip() or "Untitled",
                "duration_seconds": data.duration,
                "track_source": "saved-traffic",
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
        return {"status": "error", "message": str(exc)}


@app.get("/get-traffic")
def get_traffic(user_id: Optional[str] = None):
    try:
        normalized_user_id = coerce_optional_user_id(user_id)
        if user_id is not None and normalized_user_id is None:
            return []
        return fetch_saved_traffic_records(normalized_user_id)
    except Exception:
        logger.exception("Failed to fetch traffic records.")
        return []


@app.post("/sync-leaderboard")
def sync_leaderboard(profile: LeaderboardProfile):
    try:
        user_id = parse_uuid(profile.user_id, "user_id")
        payload = {
            "username": profile.display_name.strip() or None,
            "total_xp": max(profile.xp, 0),
            "current_streak": max(profile.streak_days, 0),
            "longest_streak": max(profile.longest_streak, max(profile.streak_days, 0)),
        }
        supabase.table("users").update(payload).eq("id", user_id).execute()
        sync_user_achievements(user_id, profile.badges)
        return {"status": "success", "storage": "supabase"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to sync leaderboard profile.")
        return {"status": "error", "message": str(exc)}


@app.get("/leaderboard")
def get_leaderboard(limit: int = 8):
    safe_limit = max(1, min(limit, 20))

    try:
        response = (
            supabase.table("users")
            .select("id,username,total_xp,current_level,current_streak,longest_streak,updated_at")
            .order("total_xp", desc=True)
            .limit(safe_limit)
            .execute()
        )
        leaderboard_rows = response.data or []

        leaderboard = []
        for row in leaderboard_rows:
            user_id = row["id"]
            leaderboard.append(
                {
                    "user_id": user_id,
                    "display_name": row.get("username") or "Player",
                    "xp": row.get("total_xp") or 0,
                    "level": row.get("current_level") or 1,
                    "streak_days": row.get("current_streak") or 0,
                    "longest_streak": row.get("longest_streak") or 0,
                    "badges": fetch_user_badge_ids(user_id),
                    "completed_lessons": count_completed_rows("user_lesson_progress", user_id),
                    "completed_songs": count_completed_rows("user_song_progress", user_id),
                    "completed_quizzes": count_completed_rows("user_theory_activity_progress", user_id),
                    "updated_at": row.get("updated_at"),
                }
            )

        return {"status": "success", "leaderboard": leaderboard, "storage": "supabase"}
    except Exception as exc:
        logger.exception("Failed to fetch leaderboard.")
        return {"status": "error", "leaderboard": [], "message": str(exc)}


@app.post("/upload-audio")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
):
    file_name = file.filename or f"{uuid4().hex}.bin"
    file_path = save_upload(file)
    normalized_user_id = coerce_optional_user_id(user_id)
    track: Optional[dict] = None

    try:
        track = insert_track(
            {
                "user_id": normalized_user_id,
                "title": Path(file_name).stem or "Untitled",
                "original_filename": file_name,
                "audio_url": None,
                "duration_seconds": 0,
                "track_source": "uploaded",
            }
        )
        job = insert_ai_analysis_job(
            {
                "track_id": track["id"],
                "status": "pending",
                "progress_text": "Upload complete. Background scan queued.",
            }
        )
    except Exception as exc:
        logger.exception("Could not create Supabase track/job rows for upload.")
        if track is not None:
            try:
                supabase.table("tracks").delete().eq("id", track["id"]).execute()
            except Exception:
                logger.exception("Failed to clean up orphaned track %s.", track["id"])
        remove_file(file_path)
        raise HTTPException(status_code=500, detail="Could not start the background scan.") from exc

    background_tasks.add_task(analyze_audio_task, job["id"], track["id"], str(file_path), file_name)

    return {
        "status": "accepted",
        "task_id": job["id"],
        "progress_text": job.get("progress_text") or "Background scan started.",
        "message": "Upload complete. You can poll this task for progress.",
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
