# TuneUp 🎵

<p align="center">
  <img src="./MusicAIApp/assets/icon.png" alt="TuneUp app icon" width="120" />
</p>

<p align="center">
  <strong>A premium mobile music-learning platform built with Expo, React Native, FastAPI, and Supabase.</strong>
</p>

<p align="center">
  TuneUp combines tuning, theory training, song practice, studio-style arrangement analysis, profiles, streaks, and gamification in a single mobile-first experience.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo-54-000020?style=for-the-badge&logo=expo" alt="Expo 54" />
  <img src="https://img.shields.io/badge/React_Native-0.81-61DAFB?style=for-the-badge&logo=react" alt="React Native 0.81" />
  <img src="https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi" alt="FastAPI Backend" />
  <img src="https://img.shields.io/badge/Supabase-Auth_+_Storage-3ECF8E?style=for-the-badge&logo=supabase" alt="Supabase Auth and Storage" />
  <img src="https://img.shields.io/badge/TypeScript-App-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript App" />
</p>

---

## ✨ Overview

TuneUp is a full-stack music practice app designed to feel like a modern premium product, while still being practical for real daily training.

It includes:
- 🎸 **Practice Deck** for instrument tuning and live microphone-based pitch feedback
- 📚 **Theory Lab** for lessons, theory quiz, drag puzzles, audio quiz, and quick note drills
- 🎛️ **Studio Grid** for arrangement analysis, BPM detection, section markers, and song structure study
- 🎵 **Song Flow** for chord-following, tab playback, guided practice, AI-assisted imports, and performance scoring
- 👤 **Profile & Settings** for Supabase-authenticated identity, progress tracking, badges, leaderboard data, saved songs, lesson history, and app preferences
- 🏆 **Gamification** with XP, levels, streaks, Supabase-backed leaderboard sync, and unlockable badges

The project is split into:
- a **React Native + Expo** mobile app in [`MusicAIApp`](./MusicAIApp)
- a **Python + FastAPI** backend in [`backend`](./backend)

The most important developer-facing flow is the Studio Grid analysis loop, which now behaves like one coordinated full-stack system:

1. The user selects an audio file in the Expo app.
2. The frontend uploads it to `POST /upload-audio`.
3. The backend immediately returns a `task_id`.
4. A backend worker thread downloads the persisted upload from Supabase Storage and runs BPM + segmentation analysis with `librosa`.
5. The frontend polls `GET /task-status/{task_id}` for progress and completion.
6. If the app backgrounds, polling pauses; when the app becomes active again, polling resumes.
7. Once complete, the frontend receives BPM and section markers and updates the Studio UI.
8. Tracks, async job state, uploaded audio, and leaderboard data persist through Supabase.
9. If the backend restarts mid-job, startup recovery can resume incomplete work from the persisted job rows.

---

## 🧩 System At a Glance

| Layer | What it owns | Key files |
|---|---|---|
| **Expo app** | auth/session UX, screen rendering, audio picking, task polling, local settings/import persistence | `MusicAIApp/App.tsx`, `MusicAIApp/src/services/api.ts`, `MusicAIApp/src/services/supabaseClient.ts` |
| **FastAPI backend** | async upload handling, worker-thread analysis, health checks, pitch fallback, persistence APIs | `backend/main.py`, `backend/models.py`, `backend/requirements.txt` |
| **Persistence layer** | Supabase Auth, Postgres tables, and Storage bucket for tracks, jobs, markers, imports, and leaderboards | Supabase project config plus `SUPABASE_URL`, `SUPABASE_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

This split is intentional: the app owns responsiveness and session UX, the backend owns heavier analysis work, and Supabase acts as the shared system of record for auth, uploads, jobs, and synced progress.

---

## 🖼️ App Preview

### Song Flow preview

<p align="center">
  <img src="./MusicAIApp/assets/readme/song-flow-preview.png" alt="TuneUp Song Flow screen preview" width="320" />
</p>

**What this preview shows:**
- the premium Song Flow shell
- the upgraded top hero treatment
- smooth sectioned layout with streak, library, and playback entry point
- the soft-light visual system used across the app

---

## 🧭 Table of Contents

- [✨ Overview](#-overview)
- [🧩 System At a Glance](#-system-at-a-glance)
- [🖼️ App Preview](#️-app-preview)
- [⚡ Quick Start](#-quick-start)
- [🚀 Core Product Experience](#-core-product-experience)
- [🗂️ Shipped Content](#️-shipped-content)
- [🏗️ Architecture](#️-architecture)
- [📱 Frontend Stack](#-frontend-stack)
- [⚙️ Backend Stack](#️-backend-stack)
- [🔁 Runtime Flows](#-runtime-flows)
- [🧠 Feature Deep Dive](#-feature-deep-dive)
- [📦 Project Structure](#-project-structure)
- [🔌 API Endpoints](#-api-endpoints)
- [🎼 Song Import Workflows](#-song-import-workflows)
- [🛠️ Local Development Setup](#️-local-development-setup)
- [🔐 Security Notes](#-security-notes)
- [🧪 Quality Checks](#-quality-checks)
- [🚚 Deployment Notes](#-deployment-notes)
- [🧭 Suggested Git Workflow](#-suggested-git-workflow)
- [📝 Current Status](#-current-status)

---

## ⚡ Quick Start

### 1. Start the backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_KEY="YOUR_SUPABASE_SERVER_KEY"
export CORS_ALLOW_ORIGINS="*"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start the Expo app

```bash
cd MusicAIApp
npm install
export EXPO_PUBLIC_API_BASE_URL="http://127.0.0.1:8000"
export EXPO_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
npx expo start -c
```

### 3. Verify the happy path
- open `http://127.0.0.1:8000/healthz` and confirm Supabase is connected
- sign in or create an account in the app
- run a **Studio Grid** scan or start an **AI song import** from **Song Flow**

---

## 🚀 Core Product Experience

### 1. Practice Deck 🎯

A live instrument practice space focused on immediate clarity.

**Highlights**
- Supports **Guitar**, **Bass**, **Ukulele**, and **Drums**
- Live microphone capture via `expo-av`
- Local pitch analysis plus optional backend pitch assist fallback
- Visual tuning meter with cents/string guidance
- Settings-controlled helper views and frequency readout

**Use cases**
- Quick tuning before practice
- Checking pitch stability
- Basic live input confidence building
- Drum hit presence feedback

---

### 2. Theory Lab 📚

A premium study area built around fast repetition, guided lessons, and music-reading exercises.

**Included modes**
- **Lesson Packs**
- **Theory Quiz**
- **Quick Note**
- **Drag Puzzle**
- **Audio Quiz**

**Highlights**
- Premium structured lessons with visual aids
- Animated learning visuals such as:
  - chord diagrams
  - finger placement previews
  - tab snippets
  - keyboard maps
  - drum rudiment lanes
- XP and streak rewards for practice completion
- Premium loading states and celebration overlays

---

### 3. Studio Grid 🎛️

A structure-analysis workspace for song study and arrangement thinking.

**Highlights**
- Load a song file from the device
- Start an async backend BPM + section analysis job
- Poll lightweight task status updates while the backend scans
- Review waveform chunks with markers
- Save studies and surface them later in Profile
- Browse **built-in traffic studies** for reference material

**Intended value**
- Practice arrangement awareness
- Understand section boundaries
- Build rehearsal notes faster
- Give learners a simplified “studio brain” view

---

### 4. Song Flow 🎵

The guided song-learning mode, designed for a “play with the track” experience.

**Highlights**
- Internal panels for:
  - **Chords**
  - **Tabs**
  - **Guide**
- Water-smooth lane rendering with Skia
- Chord scoring through live mic listening
- Tabs mode for guided timing playback
- Seek bar + jump controls
- Song import flow for AI audio transcription or manual audio + JSON pairing
- Backing tracks and imported library persistence

---

### 5. Profile & Settings 👤

A single destination for identity, progress, libraries, rewards, and configuration.

**Highlights**
- XP, level, streak, longest streak, lesson count, quiz count, song count
- Clickable shelves for:
  - completed lessons
  - saved / completed songs
  - studio saves
  - badge catalog
- Detailed badge states:
  - locked = monochrome
  - unlocked = colored
- App-wide settings with tab-level controls

---

## 🗂️ Shipped Content

The app already contains meaningful learning content, not just shell UI.

### Lesson packs
- 🎸 **20 guitar lessons**
- 🎹 **20 piano lessons**
- 🥁 **10 drum lessons**

### Theory content
- 🧠 **50 theory quiz questions**
- 🎧 audio chord quiz content
- 🎼 note-reading and drag-puzzle drills

### Song / structure content
- 🎵 **4 built-in demo songs** with chords and tabs
- 🎛️ **10 built-in traffic studies** for structure learning
- 📥 imported songs supported through manual JSON + audio pairing or AI-generated manifests from a single audio upload

### Gamification content
- 🏅 badge catalog with unlock rules
- 🔥 streak tracking
- 🥇 Supabase-backed leaderboard sync support
- ⭐ XP and level progression

---

## 🏗️ Architecture

```mermaid
flowchart TD
    A["Expo App\nAuth + Studio Grid + Song Flow"] -->|Auth/session| B["Supabase Auth"]
    A -->|Upload track| C["POST /upload-audio\nor POST /analyze-audio"]
    C --> D["FastAPI worker threads"]
    C --> E["Supabase Storage\naudio uploads"]
    C --> F["Supabase Postgres\ntracks + ai_analysis_jobs"]
    D --> G["librosa analysis\nBPM + structure + chord/tab inference"]
    G --> F
    A -->|Poll progress| H["GET /task-status/{task_id}"]
    F --> H
    H -->|Result payload| A
    A --> I["Device-local persistence\nsettings + imported songs + caches"]
```

### Architectural goals
- Keep the mobile experience **responsive and resilient** even when analysis is asynchronous
- Use the backend for **heavier or more reliable audio analysis and transcription**
- Persist user-facing state locally for a smooth app feel
- Use Supabase as the **shared system of record** for auth, uploads, jobs, and synced progress

### Operational notes
- `GET /healthz` performs a live Supabase table check and returns `503` with a degraded payload if connectivity is broken.
- `POST /upload-audio` persists a track row, stores audio in Supabase Storage, creates an `ai_analysis_jobs` row, and schedules a worker thread.
- `POST /analyze-audio` uses the same async job model, but produces an AI-generated song manifest for Song Flow imports.
- The frontend API base URL comes from `EXPO_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:8000` when unset.
- The frontend Supabase client requires `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- The backend requires `SUPABASE_URL` and `SUPABASE_KEY`; optional knobs include `SUPABASE_AUDIO_BUCKET`, `SUPABASE_AUDIO_PREFIX`, `CORS_ALLOW_ORIGINS`, and `LOG_LEVEL`.
- `POST /analyze-full` still exists as a synchronous fallback path for older deployments or troubleshooting.

### Persistence model
- **On-device:** app settings, imported songs, and gamification cache stay inside the mobile app for a fast, resilient UX.
- **Supabase-backed:** auth sessions, uploaded audio, tracks, markers, AI jobs, generated song lessons, and leaderboard data live in Supabase.
- **Recovery mode:** incomplete analysis jobs can resume on backend startup because audio URLs and job metadata are persisted in Supabase before worker threads begin.

---

## 📱 Frontend Stack

The mobile app lives in [`./MusicAIApp`](./MusicAIApp).

### Primary technologies
- **Expo 54**
- **React Native 0.81**
- **TypeScript**
- **Supabase JS**
- **React Navigation**
- **React Native Reanimated**
- **Gesture Handler**
- **Shopify Skia**
- **Expo AV**
- **Expo Document Picker**
- **Expo File System**
- **Expo Haptics**
- **Lottie React Native**
- **WatermelonDB**

### Frontend responsibilities
- handle auth state and authenticated identity
- render all learning and practice screens
- manage local UI state
- store app settings locally
- store imported songs locally
- store gamification state locally
- record microphone input
- perform lightweight pitch analysis on-device
- call backend endpoints when deeper analysis is needed

---

## ⚙️ Backend Stack

The backend lives in [`./backend`](./backend).

### Primary technologies
- **FastAPI**
- **Pydantic**
- **librosa**
- **NumPy**
- **scikit-learn**
- **Supabase Python client**
- **Supabase Storage + Postgres**
- **SoundFile**

### Backend responsibilities
- BPM analysis
- full-track structure analysis
- AI song-manifest generation for imports
- pitch detection fallback from uploaded audio clips
- upload persistence to Supabase Storage
- job persistence and recovery through `ai_analysis_jobs`
- leaderboard profile sync and retrieval

---

## 🔁 Runtime Flows

### Practice tuning flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as Mobile App
    participant M as Microphone
    participant B as Backend

    U->>A: Open Practice Deck
    U->>A: Start Listening
    A->>M: Record short live clip
    A->>A: Try local pitch detection
    alt Local detection succeeds
        A->>U: Show target, note, cents, and string
    else Local detection is weak
        A->>B: POST /detect-pitch
        B->>A: Frequency result
        A->>U: Show stabilized tuning feedback
    end
```

### Song Flow scoring flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as Song Flow
    participant M as Mic Input
    participant B as Backend Pitch Assist

    U->>A: Start a song session
    A->>A: Play backing track
    A->>M: Listen in short clips
    A->>A: Compare detected note to expected chord tones
    alt On-device read is unstable
        A->>B: POST /detect-pitch
        B->>A: Frequency fallback
    end
    A->>A: Score PERFECT / GOOD / MISS
    A->>U: Show combo, accuracy, and summary
```

### AI song import flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as Song Flow
    participant B as FastAPI
    participant S as Supabase
    participant W as Worker Thread

    U->>A: Pick one audio file
    A->>B: POST /analyze-audio
    B->>S: Upload audio + insert track/job rows
    B->>W: Schedule transcription worker
    B-->>A: Return task_id
    loop Poll task status
        A->>B: GET /task-status/{task_id}
        B-->>A: processing / completed
    end
    W->>W: Infer BPM, beat grid, chords, and tab notes
    W->>S: Insert generated song lesson + update job result
    B-->>A: Completed song manifest payload
    A->>A: Save imported song locally and open it
```

### Traffic analysis flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as Expo App
    participant B as FastAPI
    participant S as Supabase
    participant W as Worker Thread

    U->>A: Pick audio file
    A->>B: POST /upload-audio
    B->>S: Upload audio + insert track/job rows
    B->>W: Schedule analysis worker
    B-->>A: Return task_id
    loop While app is active
        A->>B: GET /task-status/{task_id}
        B-->>A: processing / completed
    end
    alt App goes inactive or background
        A->>A: Pause polling
        A->>A: Resume polling when active again
    end
    W->>W: Load audio with librosa
    W->>W: Estimate BPM
    W->>W: Segment song structure
    W->>S: Persist BPM + markers
    B-->>A: Completed analysis payload
    A->>U: Update Studio waveform + markers
    U->>A: Save study
    A->>B: POST /save-traffic
    B->>S: Persist analysis
```

---

## 🧠 Feature Deep Dive

### Practice Deck

**Files involved**
- [`MusicAIApp/src/screens/PracticalScreen.tsx`](./MusicAIApp/src/screens/PracticalScreen.tsx)
- [`MusicAIApp/src/utils/pitchDetection.ts`](./MusicAIApp/src/utils/pitchDetection.ts)
- [`MusicAIApp/src/utils/tuningData.ts`](./MusicAIApp/src/utils/tuningData.ts)
- [`MusicAIApp/src/services/api.ts`](./MusicAIApp/src/services/api.ts)

**What it does**
- captures short clips with `expo-av`
- tries on-device pitch detection first
- falls back to backend pitch detection when needed
- converts raw frequency into note and closest string guidance
- supports drums with a simpler signal-energy feedback mode

**User-facing outputs**
- current target note
- detected note
- frequency in Hz
- cents off target
- active string
- engine source: local or backend assist

---

### Theory Lab

**Files involved**
- [`MusicAIApp/src/screens/TheoryScreen.tsx`](./MusicAIApp/src/screens/TheoryScreen.tsx)
- [`MusicAIApp/src/data/lessonLibrary.ts`](./MusicAIApp/src/data/lessonLibrary.ts)
- [`MusicAIApp/src/data/theoryQuizQuestions.ts`](./MusicAIApp/src/data/theoryQuizQuestions.ts)
- [`MusicAIApp/src/data/theoryPuzzles.ts`](./MusicAIApp/src/data/theoryPuzzles.ts)
- [`MusicAIApp/src/data/audioChordQuiz.ts`](./MusicAIApp/src/data/audioChordQuiz.ts)
- [`MusicAIApp/src/components/LessonVisualGallery.tsx`](./MusicAIApp/src/components/LessonVisualGallery.tsx)

**What it does**
- presents structured lesson packs by instrument
- runs quiz and puzzle mini-games
- rewards progress through XP and streak logic
- renders visual lesson support such as finger placement and rudiment previews

**Lesson model includes**
- title and subtitle
- tier and duration
- goal
- focus tags
- warmup
- lesson steps
- practice loop
- coach notes
- checkpoint
- attached learning visuals

---

### Studio Grid

**Files involved**
- [`MusicAIApp/src/screens/TrafficScreen.tsx`](./MusicAIApp/src/screens/TrafficScreen.tsx)
- [`MusicAIApp/src/hooks/useAudioAnalysisJob.ts`](./MusicAIApp/src/hooks/useAudioAnalysisJob.ts)
- [`MusicAIApp/src/data/trafficAnalysisLibrary.ts`](./MusicAIApp/src/data/trafficAnalysisLibrary.ts)
- [`backend/main.py`](./backend/main.py)

**What it does**
- loads audio into a study session
- uploads the file to an async backend scan endpoint
- receives a `task_id` immediately and polls for progress/result updates
- pauses polling while the app is backgrounded and resumes when the app returns active
- applies BPM + section markers to the waveform strip when the job completes
- saves analysis data for later review through Supabase-backed track and marker rows

**Built-in use cases**
- arrangement study
- rehearsal prep
- timing-aware section planning
- comparison between built-in studies and user-loaded songs

---

### Song Flow

**Files involved**
- [`MusicAIApp/src/screens/SongScreen.tsx`](./MusicAIApp/src/screens/SongScreen.tsx)
- [`MusicAIApp/src/data/songLessons.ts`](./MusicAIApp/src/data/songLessons.ts)
- [`MusicAIApp/src/services/api.ts`](./MusicAIApp/src/services/api.ts)
- [`MusicAIApp/src/services/songLibrary.ts`](./MusicAIApp/src/services/songLibrary.ts)

**What it does**
- supports built-in songs and imported songs
- plays backing tracks with transport controls
- renders chord and tab guidance in a premium shell
- scores chord mode with live microphone listening
- imports a single audio file and lets the backend generate a starter chord/tab chart through `POST /analyze-audio`
- uses tabs mode as timing-guided playback
- stores imported songs locally for reuse

**Built-in schema**
- `SongChordEvent` → `{ timeSec, chord, laneRow }`
- `SongTabNote` → `{ timeSec, stringIndex, fret, durationSec? }`
- `SongLesson` → `{ id, title, artist, difficulty, backingTrack, durationSec, chordEvents, tabNotes }`

---

### Profile, Badges, and Settings

**Files involved**
- [`MusicAIApp/src/screens/ProfileScreen.tsx`](./MusicAIApp/src/screens/ProfileScreen.tsx)
- [`MusicAIApp/src/services/gamification.ts`](./MusicAIApp/src/services/gamification.ts)
- [`MusicAIApp/src/services/appSettings.ts`](./MusicAIApp/src/services/appSettings.ts)

**What it does**
- uses Supabase-backed auth for player identity
- tracks streaks and completions
- unlocks badges based on actual activity
- syncs leaderboard data when enabled
- exposes app settings per major tab

**Current badge examples**
- `First Song`
- `Drum Master`
- `Lesson Starter`
- `Theory Starter`
- `3-Day Streak`

---

## 📦 Project Structure

```text
TuneUp/
├── MusicAIApp/
│   ├── assets/
│   │   ├── audio/
│   │   └── readme/
│   ├── src/
│   │   ├── animations/
│   │   ├── components/
│   │   ├── data/
│   │   │   ├── lessonPacks/
│   │   │   └── *.ts
│   │   ├── database/
│   │   ├── hooks/
│   │   ├── screens/
│   │   ├── services/
│   │   └── utils/
│   ├── App.tsx
│   ├── app.json
│   └── package.json
├── backend/
│   ├── main.py
│   └── models.py
├── .gitignore
└── README.md
```

### Important frontend directories
- `src/screens/` → top-level app tabs and feature screens
- `src/components/` → reusable UI building blocks
- `src/data/` → built-in lesson, quiz, song, and study content
- `src/services/` → API, gamification, settings, and song import logic
- `src/database/` → WatermelonDB persistence helpers
- `src/utils/` → pitch and tuning helpers

### Important backend files
- `backend/main.py` → FastAPI app, async analysis routes, health checks, leaderboard routes, traffic persistence
- `backend/models.py` → Pydantic models for structured backend data

---

## 🔌 API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/` | readiness message with storage summary |
| `GET` | `/healthz` | backend status and live Supabase connectivity |
| `POST` | `/recommend` | mood-based song recommendation demo |
| `POST` | `/analyze-bpm` | simple BPM detection |
| `POST` | `/detect-pitch` | backend pitch detection fallback |
| `POST` | `/upload-audio` | upload a track and create an async Studio Grid analysis job |
| `POST` | `/analyze-audio` | upload a track and create an async AI song-import job |
| `GET` | `/task-status/{task_id}` | fetch progress or completed results for either async job type |
| `POST` | `/save-traffic` | persist a saved traffic study into Supabase-backed track data |
| `GET` | `/get-traffic` | fetch saved traffic analyses from Supabase |
| `POST` | `/sync-leaderboard` | sync profile progress into Supabase-backed user/progress tables |
| `GET` | `/leaderboard` | fetch top leaderboard entries from Supabase |
| `POST` | `/analyze-full` | legacy synchronous BPM + structure analysis fallback |

---

## 🎼 Song Import Workflows

Song import is handled by [`MusicAIApp/src/services/songLibrary.ts`](./MusicAIApp/src/services/songLibrary.ts).

### AI-assisted import flow
- choose a single **audio file** inside Song Flow
- the app uploads it to `POST /analyze-audio`
- the frontend polls `GET /task-status/{task_id}`
- the backend returns an AI-generated `songManifest`
- the app persists the imported song locally and opens it immediately

If transcription confidence is too low, the backend can still return a safe starter strum map with `fallbackUsed = true` so the song remains playable.

### Manual import flow
- choose an **audio file**
- choose a **JSON manifest**
- import into the local Song Flow library

### Supported JSON manifest structure

```json
{
  "title": "Example Song",
  "artist": "Example Artist",
  "difficulty": "Medium",
  "durationSec": 120,
  "chordEvents": [
    { "timeSec": 0.0, "chord": "Em", "laneRow": 1 },
    { "timeSec": 2.0, "chord": "G", "laneRow": 0 }
  ],
  "tabNotes": [
    { "timeSec": 0.0, "stringIndex": 1, "fret": 3, "durationSec": 0.5 },
    { "timeSec": 0.5, "stringIndex": 2, "fret": 2, "durationSec": 0.4 }
  ]
}
```

### Notes
- `laneRow` should stay in the `0..3` range
- `stringIndex` should stay in the `0..5` range
- at least one of `chordEvents` or `tabNotes` must be present
- imported audio is copied into the app sandbox for persistence across reloads

---

## 🛠️ Local Development Setup

### Prerequisites

### Frontend
- Node.js 18+
- npm
- Supabase project URL + anon key for Expo
- Xcode Simulator for iOS testing or Android Studio for Android testing

### Backend
- Python 3.11+ recommended
- virtual environment support
- Supabase project URL + server-side key with storage and database access

No `.env.example` files are currently checked in, so create local `.env` files for the frontend and backend using the snippets below.

---

### 1. Clone the project

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd <YOUR_PROJECT_DIRECTORY>
```

---

### 2. Start the backend

Create and activate a Python virtual environment if needed, then install the backend dependencies.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Backend environment setup

Create a local `backend/.env` file:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=YOUR_SUPABASE_SERVER_KEY
CORS_ALLOW_ORIGINS=*
SUPABASE_AUDIO_BUCKET=audio-uploads
SUPABASE_AUDIO_PREFIX=analysis
LOG_LEVEL=INFO
```

What these values do:
- `SUPABASE_URL` and `SUPABASE_KEY` are required for backend startup.
- `SUPABASE_AUDIO_BUCKET` and `SUPABASE_AUDIO_PREFIX` control where uploaded audio is stored.
- `CORS_ALLOW_ORIGINS` is optional and can stay `*` for local mobile development.
- `LOG_LEVEL` is optional and defaults to `INFO`.

The backend will not boot without `SUPABASE_URL` and `SUPABASE_KEY`. If Supabase becomes unreachable after boot, `GET /healthz` returns a degraded response and async writes will fail until connectivity is restored.

### Run the backend

```bash
cd "/path/to/project/backend"
source venv/bin/activate
set -a
source .env
set +a
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

### 3. Start the frontend

Create a local `MusicAIApp/.env` file:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Then install dependencies and start Expo:

```bash
cd "/path/to/project/MusicAIApp"
npm install
npx expo start -c
```

You can then open:
- **iOS simulator** with `i`
- **Android emulator** with `a`
- **Expo Go** by scanning the QR code on a real device

---

### 4. Configure frontend API access

The frontend resolves its backend target from `EXPO_PUBLIC_API_BASE_URL` inside [`MusicAIApp/src/services/api.ts`](./MusicAIApp/src/services/api.ts), falling back to `http://localhost:8000` when the variable is not set.

### Typical values
- Render: `https://YOUR_RENDER_SERVICE.onrender.com`
- iOS simulator: `http://127.0.0.1:8000`
- Android emulator: `http://10.0.2.2:8000`
- physical phone: `http://YOUR_LOCAL_IP:8000`

To find your local IP on macOS:

```bash
ipconfig getifaddr en0
```

The frontend Supabase client also requires:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### 5. End-to-end smoke path

Once both services are running, this is the fastest way to confirm the full stack is healthy:

1. Open `http://127.0.0.1:8000/healthz` and confirm Supabase is connected.
2. Launch the Expo app and sign in or create an account.
3. Open **Studio Grid**, pick an audio file, and tap **Scan**.
4. Confirm the UI shows upload/progress messaging first, then BPM + section markers after completion.
5. Open **Song Flow**, import one audio file, and confirm the AI-generated song opens after polling completes.
6. Save a traffic study and verify the backend reports `storage: "supabase"`.

---

## 🔐 Security Notes

Security is critical for this project because it contains mobile app code, backend services, and cloud credentials.

### Never commit
- `.env`
- `.env.*`
- Supabase service-role or other server-side keys
- exported storage objects or database dumps
- `node_modules/`
- `venv/`
- `.venv/`
- `__pycache__/`
- `.expo/`
- any `uploads/` directory
- local database / runtime artifacts

### Included protections
- a root-level `.gitignore` should block sensitive and bulky files
- frontend only needs the public anon key, while the backend should keep the server-side key private
- uploads and generated caches should stay out of version control

### Recommended security practices
- use the anon key in Expo and keep elevated Supabase keys on the backend only
- audit and remove any stale legacy cloud-service keys from the repo before publishing it
- rotate credentials if a secret was ever committed in the past
- keep repository visibility private until secret hygiene is verified
- use environment-specific backend configs instead of hardcoding production secrets

---

## 🧪 Quality Checks

Recommended checks before every push:

```bash
cd MusicAIApp
npx tsc --noEmit
npm test
npx expo-doctor
```

Backend sanity check:

```bash
cd backend
python3 -m py_compile main.py
```

API smoke checks:

```bash
curl http://127.0.0.1:8000/
curl http://127.0.0.1:8000/healthz
```

Manual async smoke checks:
- run one Studio Grid scan through `POST /upload-audio`
- run one Song Flow AI import through `POST /analyze-audio`

---

## 🚚 Deployment Notes

### Mobile app
This project is optimized for Expo development, and the mobile app is now configured through Expo public env vars:
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

A production release path would typically include:
- EAS Build for mobile binaries
- environment-backed API and Supabase configuration
- proper asset optimization
- analytics / crash reporting
- app-store compliant permission copy

### Backend
For production deployment, the backend should be hosted on a secure Python runtime such as:
- Railway
- Render
- Fly.io
- Google Cloud Run
- AWS ECS / Lambda (with adaptation)

Production hardening would include:
- secret management via environment variables or secret store
- HTTPS
- request limits / abuse protection
- monitoring and logs
- storage cleanup policies for uploaded files
- reliable Supabase connectivity for auth, storage, jobs, and synced progress
- verifying worker-thread recovery behavior after restarts

### Render-specific notes
- set `SUPABASE_URL` and `SUPABASE_KEY`
- set `CORS_ALLOW_ORIGINS` if you are calling the API from web origins
- optionally set `SUPABASE_AUDIO_BUCKET`, `SUPABASE_AUDIO_PREFIX`, and `LOG_LEVEL`
- point the mobile app to the live backend with `EXPO_PUBLIC_API_BASE_URL`
- expect Studio Grid scans to use `POST /upload-audio` plus `GET /task-status/{task_id}` polling instead of one long blocking request
- expect Song Flow imports to use `POST /analyze-audio` plus the same task polling endpoint
- expect hosted instances to cold-start occasionally; the frontend already warms the backend before uploads
- use `/healthz` to confirm the backend can still reach Supabase after deploys or restarts
- incomplete async jobs can resume on backend startup because job state is stored in Supabase
- if Supabase is unavailable, the backend reports degraded health and async writes fail until connectivity returns

---

## 🧭 Suggested Git Workflow

### First secure push

```bash
git branch -M main
git remote set-url origin <YOUR_GITHUB_REPO_URL>
git rm -r --cached --ignore-unmatch backend/__pycache__ backend/uploads backend/venv .venv MusicAIApp/node_modules MusicAIApp/.expo
git rm --cached --ignore-unmatch backend/serviceAccountKey.json backend/.env MusicAIApp/.env .env .env.*
git add -A
git commit -m "Initial secure project import"
git push -u origin main
```

### Everyday update workflow

```bash
git checkout main
git pull --rebase origin main
git status --short
git add -A
git commit -m "Describe your change"
git push origin main
```

### Recommended safety habit

```bash
git status --short
git diff --cached --name-only
```

This helps catch accidental commits before they go to GitHub.

---

## 📝 Current Status

### Product areas already implemented
- ✅ Supabase-authenticated app shell
- ✅ multi-tab mobile app shell
- ✅ live tuner / practice experience
- ✅ structured lesson packs
- ✅ theory quiz and puzzle modes
- ✅ audio chord quiz
- ✅ song flow with chords + tabs
- ✅ async AI song import from a single audio file
- ✅ local song import
- ✅ studio traffic analysis workflow
- ✅ profile dashboard
- ✅ streaks, XP, badges, and Supabase-backed leaderboard sync
- ✅ premium transitions, loading states, and celebration overlays

### Current packaged content
- ✅ 20 guitar lessons
- ✅ 20 piano lessons
- ✅ 10 drum lessons
- ✅ 50 theory quiz questions
- ✅ 10 built-in traffic studies
- ✅ 4 built-in demo songs

### Areas that can be expanded next
- richer production song libraries
- more advanced chord recognition
- deeper analytics and session history
- additional badge sets and seasonal challenges
- richer collaborative and social layers on top of the existing auth stack

---

## 🤝 Final Notes

This repository is structured to support both:
- **product-facing iteration** on the mobile experience
- **engineering-focused iteration** on audio analysis, learning systems, and backend services

If you want this README to go one level further, the next strong step would be adding:
- more simulator screenshots for each tab
- an animated demo GIF
- checked-in `.env.example` files for frontend and backend
- one concrete Supabase schema / deployment guide for a chosen host
