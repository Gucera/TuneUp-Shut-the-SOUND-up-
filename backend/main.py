from fastapi import FastAPI, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import shutil
import os
import librosa
import numpy as np
import random
import firebase_admin
from firebase_admin import credentials, firestore
import sklearn.cluster

app = FastAPI()

# Connect to Firebase (only if not already connected)
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

# Database client
db = firestore.client()

# Folder for uploaded files
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Colors used for song section markers
SECTION_COLORS = {
    "INTRO": "#00ff9d",
    "VERSE 1": "#00d2ff",
    "CHORUS": "#ff00ff",
    "VERSE 2": "#5599ff",
    "BRIDGE": "#ffd700",
    "OUTRO": "#ff4444",
    "SECTION": "#aaaaaa",
    "AUTO": "#ffaa00"
}

# Data models for the API
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


PITCH_RANGES = {
    "Guitar": (60.0, 420.0),
    "Bass": (30.0, 180.0),
    "Ukulele": (180.0, 500.0),
    "Drums": (40.0, 1200.0),
}

# Simple mood-to-song database
SONG_DATABASE = {
    "Happy": [{"title": "Happy", "artist": "Pharrell", "bpm": 160}],
    "Sad": [{"title": "Someone Like You", "artist": "Adele", "bpm": 67}],
    "Energetic": [{"title": "Eye of the Tiger", "artist": "Survivor", "bpm": 109}]
}

# Health check endpoint
@app.get("/")
def read_root():
    return {"message": "Music AI Backend + Firebase + Color Brain Ready! 🧠🔥"}

# Recommend a song based on mood
@app.post("/recommend")
def recommend_song(data: MoodRequest):
    songs = SONG_DATABASE.get(data.mood, [])
    if not songs: return {"error": "No songs found"}
    return {"status": "success", "recommendation": random.choice(songs)}

# Simple BPM analysis from an audio file
@app.post("/analyze-bpm")
async def analyze_bpm(file: UploadFile = File(...)):
    try:
        file_path = f"{UPLOAD_DIR}/{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        y, sr = librosa.load(file_path, sr=None)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        
        bpm = float(tempo) if np.ndim(tempo) == 0 else float(tempo[0])
        os.remove(file_path)
        
        return {"status": "success", "bpm": round(bpm, 1), "message": f"{round(bpm)} BPM"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/detect-pitch")
async def detect_pitch(file: UploadFile = File(...), instrument: str = Form("Guitar")):
    file_path = f"{UPLOAD_DIR}/{file.filename}"
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        y, sr = librosa.load(file_path, sr=22050, mono=True, duration=1.2)
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
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

# Save traffic analysis to Firebase
@app.post("/save-traffic")
def save_traffic(data: TrafficData):
    try:
        doc_data = data.dict()
        doc_data["created_at"] = datetime.now(timezone.utc).isoformat()
        db.collection("traffic_analyses").add(doc_data)
        return {"status": "success", "message": f"{data.song_name} saved to Firebase! 🔥"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Get all saved traffic analyses
@app.get("/get-traffic")
def get_traffic(user_id: Optional[str] = None):
    try:
        query = db.collection("traffic_analyses")
        docs = query.where("user_id", "==", user_id).stream() if user_id else query.stream()
        results = []
        for doc in docs:
            results.append(doc.to_dict())
        return results
    except Exception as e:
        return []


@app.post("/sync-leaderboard")
def sync_leaderboard(profile: LeaderboardProfile):
    try:
        payload = profile.dict()
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        db.collection("leaderboard_profiles").document(profile.user_id).set(payload, merge=True)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/leaderboard")
def get_leaderboard(limit: int = 8):
    try:
        safe_limit = max(1, min(limit, 20))
        docs = (
            db.collection("leaderboard_profiles")
            .order_by("xp", direction=firestore.Query.DESCENDING)
            .limit(safe_limit)
            .stream()
        )

        leaderboard = []
        for doc in docs:
            payload = doc.to_dict() or {}
            leaderboard.append(payload)

        return {"status": "success", "leaderboard": leaderboard}
    except Exception as e:
        return {"status": "error", "leaderboard": [], "message": str(e)}

# Full AI analysis — finds BPM and song sections with colors
@app.post("/analyze-full")
async def analyze_full(file: UploadFile = File(...)):
    print(f"--- ANALYSIS STARTED: {file.filename} ---")
    try:
        # Save the uploaded file temporarily
        file_path = f"{UPLOAD_DIR}/{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Load the audio (cap at 3 minutes for speed)
        y, sr = librosa.load(file_path, sr=None, duration=180) 
        print("File loaded, processing audio...")

        # Find the BPM
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        bpm = float(tempo) if np.ndim(tempo) == 0 else float(tempo[0])
        print(f"BPM found: {bpm}")
        
        # Find song sections using segmentation
        ai_markers = []
        try:
            print("Trying segmentation...")
            
            # Use CQT for musical structure analysis
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            
            # Split the song into 6 main parts (Intro, Verse, Chorus, etc.)
            bounds = librosa.segment.agglomerative(chroma, 6) 
            bound_times = librosa.frames_to_time(bounds, sr=sr)
            
            bound_times = sorted(list(bound_times))
            print(f"Raw boundaries found: {bound_times}")

            section_names = ["INTRO", "VERSE 1", "CHORUS", "VERSE 2", "BRIDGE", "OUTRO"]
            
            # Keep track of spacing so markers don't overlap
            last_time = -10.0
            name_index = 0

            for t in bound_times:
                # Only place markers between 5s and 175s, with at least 15s gap
                if t > 5.0 and t < 175.0 and (t - last_time > 15.0):
                    
                    label_name = section_names[name_index] if name_index < len(section_names) else "SECTION"
                    marker_color = SECTION_COLORS.get(label_name, "#ffffff")

                    ai_markers.append({
                        "id": int(t * 10000) + random.randint(0,999),
                        "label": label_name,
                        "color": marker_color, 
                        "x": 0,
                        "time": float(t)
                    })
                    
                    last_time = t
                    name_index += 1

            # Fallback: if AI found no sections, add default markers
            if len(ai_markers) == 0:
                print("⚠️ AI found no sections, adding default markers...")
                steps = [30.0, 60.0, 90.0, 120.0]
                labels = ["VERSE 1", "CHORUS", "VERSE 2", "CHORUS"]
                
                for i, t in enumerate(steps):
                    lbl = labels[i]
                    ai_markers.append({
                        "id": int(t * 1000),
                        "label": lbl,
                        "color": SECTION_COLORS.get(lbl, "#ffaa00"),
                        "x": 0,
                        "time": float(t)
                    })

        except Exception as e:
            print(f"❌ Segmentation error: {e}")
        
        # Clean up the temp file
        if os.path.exists(file_path):
            os.remove(file_path)
        
        print(f"Markers sent to frontend: {len(ai_markers)}")
        
        return {
            "status": "success",
            "bpm": round(bpm),
            "markers": ai_markers,
            "message": f"Tempo: {round(bpm)} BPM | {len(ai_markers)} Sections"
        }
        
    except Exception as e:
        print(f"General Error: {e}")
        return {"status": "error", "message": str(e)}
