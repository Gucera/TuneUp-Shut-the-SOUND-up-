from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4
import json
import os
import random
import shutil

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import credentials, firestore
import firebase_admin
from google.cloud.firestore_v1.base_query import FieldFilter
import librosa
import numpy as np
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
TRAFFIC_DB_FILE = BASE_DIR / "traffic_db.json"
LEADERBOARD_DB_FILE = BASE_DIR / "leaderboard_db.json"
TASK_RETENTION_MINUTES = 120

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()
analysis_tasks: Dict[str, Dict[str, Any]] = {}
analysis_tasks_lock = Lock()


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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def model_to_dict(model: Any) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def read_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    temp_path.replace(path)


def init_firestore_client():
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    credential_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    local_credential_path = BASE_DIR / "serviceAccountKey.json"

    try:
        if service_account_json:
            parsed = json.loads(service_account_json)
            firebase_cred = credentials.Certificate(parsed)
        elif credential_path and Path(credential_path).exists():
            firebase_cred = credentials.Certificate(credential_path)
        elif local_credential_path.exists():
            firebase_cred = credentials.Certificate(str(local_credential_path))
        else:
            return None, "Firebase credentials not configured."

        if not firebase_admin._apps:
            firebase_admin.initialize_app(firebase_cred)

        return firestore.client(), None
    except Exception as exc:
        return None, str(exc)


db, firestore_error = init_firestore_client()


def storage_mode() -> str:
    return "firestore" if db else "local-json-fallback"


def get_task_timestamp() -> datetime:
    return datetime.now(timezone.utc)


def prune_analysis_tasks() -> None:
    cutoff = get_task_timestamp() - timedelta(minutes=TASK_RETENTION_MINUTES)

    with analysis_tasks_lock:
        expired_task_ids = [
            task_id
            for task_id, payload in analysis_tasks.items()
            if payload.get("status") in {"completed", "failed"}
            and isinstance(payload.get("updated_at_dt"), datetime)
            and payload["updated_at_dt"] < cutoff
        ]

        for task_id in expired_task_ids:
            analysis_tasks.pop(task_id, None)


def create_analysis_task(task_id: str, file_name: str) -> None:
    timestamp = get_task_timestamp()

    with analysis_tasks_lock:
        analysis_tasks[task_id] = {
            "task_id": task_id,
            "file_name": file_name,
            "status": "processing",
            "progress_text": "Upload complete. Starting analysis in the background...",
            "result": None,
            "error": None,
            "created_at": timestamp.isoformat(),
            "updated_at": timestamp.isoformat(),
            "updated_at_dt": timestamp,
        }


def update_analysis_task(task_id: str, **updates: Any) -> None:
    timestamp = get_task_timestamp()

    with analysis_tasks_lock:
        current = analysis_tasks.get(task_id)
        if not current:
            return

        current.update(updates)
        current["updated_at"] = timestamp.isoformat()
        current["updated_at_dt"] = timestamp


def get_analysis_task(task_id: str) -> Optional[Dict[str, Any]]:
    with analysis_tasks_lock:
        payload = analysis_tasks.get(task_id)
        if not payload:
            return None

        # `updated_at_dt` is an internal datetime helper and should not leak to the client.
        return {key: value for key, value in payload.items() if key != "updated_at_dt"}


def build_upload_path(file_name: str) -> Path:
    safe_name = Path(file_name or "upload.bin").name
    suffix = Path(safe_name).suffix or ".bin"
    return UPLOAD_DIR / f"{uuid4().hex}{suffix}"


def save_upload(file: UploadFile) -> Path:
    target_path = build_upload_path(file.filename or "upload.bin")
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return target_path


def build_analysis_result(
    file_path: Path,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    if progress_callback:
        progress_callback("Loading audio file...")

    y, sr = librosa.load(str(file_path), sr=None, duration=180)

    if progress_callback:
        progress_callback("Detecting BPM and groove...")

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    bpm = float(tempo) if np.ndim(tempo) == 0 else float(tempo[0])

    ai_markers = []

    if progress_callback:
        progress_callback("Mapping song sections...")

    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        bounds = librosa.segment.agglomerative(chroma, 6)
        bound_times = sorted(list(librosa.frames_to_time(bounds, sr=sr)))
        print(f"Raw boundaries found: {bound_times}")

        section_names = ["INTRO", "VERSE 1", "CHORUS", "VERSE 2", "BRIDGE", "OUTRO"]
        last_time = -10.0
        name_index = 0

        for timestamp in bound_times:
            if 5.0 < timestamp < 175.0 and (timestamp - last_time > 15.0):
                label_name = section_names[name_index] if name_index < len(section_names) else "SECTION"
                ai_markers.append({
                    "id": int(timestamp * 10000) + random.randint(0, 999),
                    "label": label_name,
                    "color": SECTION_COLORS.get(label_name, "#56cfe1"),
                    "x": 0,
                    "time": float(timestamp),
                })
                last_time = timestamp
                name_index += 1

        if len(ai_markers) == 0:
            print("AI found no sections, adding default markers...")
            steps = [30.0, 60.0, 90.0, 120.0]
            labels = ["VERSE 1", "CHORUS", "VERSE 2", "CHORUS"]

            for index, timestamp in enumerate(steps):
                label = labels[index]
                ai_markers.append({
                    "id": int(timestamp * 1000),
                    "label": label,
                    "color": SECTION_COLORS.get(label, "#80ffdb"),
                    "x": 0,
                    "time": float(timestamp),
                })
    except Exception as exc:
        print(f"Segmentation error: {exc}")

    if progress_callback:
        progress_callback("Finalizing markers...")

    return {
        "bpm": round(bpm),
        "markers": ai_markers,
        "message": f"Tempo: {round(bpm)} BPM | {len(ai_markers)} Sections",
    }


def run_analysis_task(task_id: str, file_path_str: str, file_name: str) -> None:
    file_path = Path(file_path_str)
    print(f"--- BACKGROUND ANALYSIS STARTED: {file_name} ({task_id}) ---")

    try:
        update_analysis_task(
            task_id,
            status="processing",
            progress_text=f"Preparing {file_name} for analysis...",
            error=None,
        )
        result = build_analysis_result(
            file_path,
            progress_callback=lambda message: update_analysis_task(
                task_id,
                status="processing",
                progress_text=message,
            ),
        )
        update_analysis_task(
            task_id,
            status="completed",
            progress_text="Analysis complete.",
            result=result,
            error=None,
        )
    except Exception as exc:
        print(f"Background analysis failed for {task_id}: {exc}")
        update_analysis_task(
            task_id,
            status="failed",
            progress_text="Analysis failed.",
            result=None,
            error=str(exc),
        )
    finally:
        if file_path.exists():
            file_path.unlink()


def save_traffic_record(doc_data: dict) -> str:
    if db:
        try:
            db.collection("traffic_analyses").add(doc_data)
            return "firestore"
        except Exception as exc:
            print(f"Firestore traffic save failed, using local fallback: {exc}")

    existing = read_json_file(TRAFFIC_DB_FILE, [])
    if not isinstance(existing, list):
        existing = []
    existing.append(doc_data)
    write_json_file(TRAFFIC_DB_FILE, existing)
    return "local-json"


def fetch_traffic_records(user_id: Optional[str] = None) -> List[dict]:
    if db:
        try:
            query = db.collection("traffic_analyses")
            docs = query.where(filter=FieldFilter("user_id", "==", user_id)).stream() if user_id else query.stream()
            records = [(doc.to_dict() or {}) for doc in docs]
            return sorted(records, key=lambda item: item.get("created_at") or "", reverse=True)
        except Exception as exc:
            print(f"Firestore traffic fetch failed, using local fallback: {exc}")

    records = read_json_file(TRAFFIC_DB_FILE, [])
    if not isinstance(records, list):
        return []

    filtered = [
        item for item in records
        if isinstance(item, dict) and (not user_id or item.get("user_id") == user_id)
    ]
    return sorted(filtered, key=lambda item: item.get("created_at") or "", reverse=True)


def save_leaderboard_record(payload: dict) -> str:
    if db:
        try:
            db.collection("leaderboard_profiles").document(payload["user_id"]).set(payload, merge=True)
            return "firestore"
        except Exception as exc:
            print(f"Firestore leaderboard sync failed, using local fallback: {exc}")

    existing = read_json_file(LEADERBOARD_DB_FILE, {})
    if not isinstance(existing, dict):
        existing = {}
    existing[payload["user_id"]] = payload
    write_json_file(LEADERBOARD_DB_FILE, existing)
    return "local-json"


def fetch_leaderboard_records(limit: int) -> List[dict]:
    safe_limit = max(1, min(limit, 20))

    if db:
        try:
            docs = (
                db.collection("leaderboard_profiles")
                .order_by("xp", direction=firestore.Query.DESCENDING)
                .limit(safe_limit)
                .stream()
            )
            return [(doc.to_dict() or {}) for doc in docs]
        except Exception as exc:
            print(f"Firestore leaderboard fetch failed, using local fallback: {exc}")

    existing = read_json_file(LEADERBOARD_DB_FILE, {})
    if isinstance(existing, dict):
        records = [value for value in existing.values() if isinstance(value, dict)]
    elif isinstance(existing, list):
        records = [value for value in existing if isinstance(value, dict)]
    else:
        records = []

    return sorted(records, key=lambda item: item.get("xp", 0), reverse=True)[:safe_limit]


@app.get("/")
def read_root():
    return {
        "message": "TuneUp backend ready.",
        "storage": storage_mode(),
        "firebase_connected": db is not None,
    }


@app.get("/healthz")
def healthz():
    return {
        "status": "ok",
        "storage": storage_mode(),
        "firebase_connected": db is not None,
        "firebase_error": firestore_error,
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
        if file_path.exists():
            file_path.unlink()


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
        if file_path.exists():
            file_path.unlink()


@app.post("/save-traffic")
def save_traffic(data: TrafficData):
    try:
        doc_data = model_to_dict(data)
        doc_data["created_at"] = now_iso()
        backend_store = save_traffic_record(doc_data)
        return {
            "status": "success",
            "message": f"{data.song_name} saved successfully.",
            "storage": backend_store,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@app.get("/get-traffic")
def get_traffic(user_id: Optional[str] = None):
    try:
        return fetch_traffic_records(user_id)
    except Exception:
        return []


@app.post("/sync-leaderboard")
def sync_leaderboard(profile: LeaderboardProfile):
    try:
        payload = model_to_dict(profile)
        payload["updated_at"] = now_iso()
        backend_store = save_leaderboard_record(payload)
        return {"status": "success", "storage": backend_store}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@app.get("/leaderboard")
def get_leaderboard(limit: int = 8):
    try:
        leaderboard = fetch_leaderboard_records(limit)
        return {"status": "success", "leaderboard": leaderboard, "storage": storage_mode()}
    except Exception as exc:
        return {"status": "error", "leaderboard": [], "message": str(exc)}


@app.post("/upload-audio")
async def upload_audio(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    prune_analysis_tasks()

    task_id = uuid4().hex
    file_name = file.filename or f"{task_id}.bin"
    file_path = save_upload(file)

    create_analysis_task(task_id, file_name)
    background_tasks.add_task(run_analysis_task, task_id, str(file_path), file_name)

    return {
        "status": "accepted",
        "task_id": task_id,
        "progress_text": "Upload complete. Background scan started.",
        "message": "Upload complete. You can poll this task for progress.",
    }


@app.get("/task-status/{task_id}")
def task_status(task_id: str):
    prune_analysis_tasks()
    payload = get_analysis_task(task_id)

    if not payload:
        raise HTTPException(status_code=404, detail="Task not found.")

    if payload["status"] == "completed":
        return {
            "status": "completed",
            "task_id": task_id,
            "progress_text": payload.get("progress_text") or "Analysis complete.",
            "result": payload.get("result"),
            "updated_at": payload.get("updated_at"),
        }

    if payload["status"] == "failed":
        return {
            "status": "failed",
            "task_id": task_id,
            "progress_text": payload.get("progress_text") or "Analysis failed.",
            "message": payload.get("error") or "The scan failed.",
            "updated_at": payload.get("updated_at"),
        }

    return {
        "status": "processing",
        "task_id": task_id,
        "progress_text": payload.get("progress_text") or "Analysis is still running...",
        "updated_at": payload.get("updated_at"),
    }


@app.post("/analyze-full")
async def analyze_full(file: UploadFile = File(...)):
    file_path = save_upload(file)
    print(f"--- ANALYSIS STARTED: {file.filename} ---")

    try:
        result = build_analysis_result(file_path)
        print(f"Markers sent to frontend: {len(result['markers'])}")
        return {"status": "success", **result}
    except Exception as exc:
        print(f"General Error: {exc}")
        return {"status": "error", "message": str(exc)}
    finally:
        if file_path.exists():
            file_path.unlink()
