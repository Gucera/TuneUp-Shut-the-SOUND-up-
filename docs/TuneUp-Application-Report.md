# TuneUp Application Report

Project: TuneUp  
Type: Final-Year Dissertation Mobile App  
Platform: React Native / Expo mobile app with FastAPI backend  
Author: Yavuz Sever  
Repository: TuneUp-Shut-the-SOUND-up-  
Date: 5 May 2026

## 1. Executive Summary

TuneUp is a mobile music practice assistant that combines real-time instrument tuning, AI-assisted song analysis, song library management, guided lessons, and Song Flow practice in one full-stack prototype. The app is inspired by the learning flow of products such as Rocksmith and Yousician, but it uses its own original design, data structures, code, and demo content.

The project focuses on building a practical dissertation-ready prototype rather than a static concept. It includes a React Native / Expo frontend, a FastAPI backend, Supabase integration, native microphone handling, local song persistence, asynchronous audio analysis jobs, and a polished dark/glass visual design.

TuneUp is deliberately honest about AI-generated music content. Generated chord charts and tabs are treated as AI Drafts, not verified official tabs. Users review confidence values, warnings, tuning metadata, chord counts, tab counts, and BPM before saving or practising a generated chart.

## 2. Project Aim and Motivation

The aim of TuneUp is to support musicians as they move from preparation to practice:

- Tune the instrument.
- Learn technique and theory.
- Upload or import a song.
- Convert audio into a playable draft chart.
- Review and save the chart.
- Practise through Song Flow.
- Track progress through XP, streaks, badges, and profile shelves.

Many beginner and intermediate musicians use separate tools for tuning, tabs, lessons, and practice tracking. TuneUp explores whether these workflows can be combined into a single mobile-first learning assistant with a consistent user experience.

The project also investigates real implementation constraints: native audio input, mobile permissions, asynchronous backend processing, Supabase storage, manifest validation, unreliable AI transcription, and local demo reliability for a dissertation viva.

## 3. Target Users

TuneUp is aimed at:

- Guitarists and bassists who need quick tuning and guided practice.
- Learners who want short structured lessons and theory drills.
- Students preparing songs for practice without manually building every chart.
- Dissertation evaluators who need to see a reliable end-to-end prototype.
- Developers or future maintainers who need clear local setup and diagnostic tools.

The current prototype is strongest for guitar, bass, Song Flow practice, AI draft import, and offline demo reliability.

## 4. Core User Journey

The main product journey is:

```text
Open TuneUp
  -> Tune guitar or bass
  -> Open Songs
  -> Upload audio, import a manifest, or use Demo Song
  -> Choose instrument and tuning before AI analysis
  -> Backend creates an async analysis job
  -> App polls job status
  -> Review AI Draft with warnings and confidence
  -> Save to Library
  -> Launch Song Flow practice
  -> Track progress in Profile
```

The learning journey is:

```text
Open Lessons
  -> Choose instrument or Theory path
  -> Browse grouped lessons
  -> Open lesson content
  -> Complete lesson
  -> Earn XP and update progress
```

## 5. System Architecture

TuneUp is split into a mobile frontend, a Python backend, and Supabase-backed persistence.

```text
Mobile App
  |-- Tuner
  |-- Songs Library
  |-- Song Flow
  |-- Lessons / Theory
  |-- Profile / Settings
        |
        v
FastAPI Backend
  |-- Health and readiness endpoints
  |-- Upload endpoints
  |-- Async analysis jobs
  |-- Manifest generation
  |-- Pitch/BPM analysis helpers
  |-- Supabase Storage integration
        |
        v
Supabase
  |-- Auth
  |-- Storage bucket for uploaded audio
  |-- Analysis job rows
  |-- Track and marker rows
  |-- Leaderboard/progress rows
```

Frontend responsibilities:

- Render the mobile app screens.
- Handle navigation and local UI state.
- Manage tuner microphone lifecycle.
- Upload files and poll backend jobs.
- Validate imported/generated manifests before save.
- Store saved songs locally on device.
- Present progress, badges, settings, and diagnostics.

Backend responsibilities:

- Validate environment configuration at startup.
- Accept uploaded audio.
- Store uploaded audio in Supabase Storage using safe object keys.
- Create and update asynchronous analysis jobs.
- Generate BPM, section markers, chord events, tab notes, confidence, and warnings.
- Return safe structured errors.
- Expose health and readiness endpoints for local demos.

## 6. Frontend Architecture

The frontend is in `MusicAIApp/` and uses React Native, Expo, TypeScript, React Navigation, Reanimated, Skia, Expo AV, Supabase JS, and local filesystem persistence.

Important frontend areas:

- `MusicAIApp/App.tsx` defines the main app shell and navigation.
- `MusicAIApp/src/screens/` contains the primary screens: Home, Tuner, Songs, Lessons/Theory, Lesson Detail, Profile, Traffic/Studio, and Auth.
- `MusicAIApp/src/components/` contains reusable UI components such as premium backdrops, carousel cards, lesson lists, hero strips, settings buttons, and error boundaries.
- `MusicAIApp/src/hooks/` contains stateful audio and polling hooks, including tuner and analysis job hooks.
- `MusicAIApp/src/services/` contains API clients, Supabase client setup, local song library persistence, app settings, gamification, diagnostics, and lesson catalog access.
- `MusicAIApp/src/utils/` contains validation, tuning, tuner math, song library view helpers, song display-name cleanup, and Song Flow string-label utilities.
- `MusicAIApp/src/data/` contains built-in lesson content, theory exercises, traffic studies, and demo songs.

The app follows a screen-based architecture. Large features are implemented in dedicated screens while shared behavior is extracted into hooks and services. Recent work has focused on making core flows explicit: Start/Stop controls for the tuner, Upload/Library sections in Songs, and Instrument -> Lessons -> Lesson Content in Lessons.

## 7. Backend Architecture

The backend is in `backend/` and uses FastAPI with Supabase, librosa, numpy, scikit-learn, soundfile, Pydantic, and python-dotenv.

Important backend files:

- `backend/main.py` defines the FastAPI app, endpoints, storage upload helpers, analysis pipeline, job lifecycle, tuning metadata handling, tab mapping, health checks, and leaderboard/traffic endpoints.
- `backend/config.py` loads and validates environment variables.
- `backend/tests/` contains pytest coverage for API behavior, config validation, async jobs, storage object keys, tab mapping, and audio accuracy fixtures.
- `backend/requirements.txt` defines the Python runtime dependencies.

Key backend endpoints include:

- `GET /health` for fast process liveness.
- `GET /ready` for safe readiness structure.
- `GET /healthz` for deeper Supabase connectivity.
- `POST /upload-audio` for Studio/traffic analysis jobs.
- `POST /analyze-audio` for AI song import jobs.
- `GET /task-status/{task_id}` for async job polling.
- `POST /detect-pitch` for backend pitch assist.
- `POST /analyze-full` as a synchronous fallback analysis endpoint.
- `POST /save-traffic` and `GET /get-traffic` for saved Studio analysis.
- `POST /sync-leaderboard` and `GET /leaderboard` for progress sync.

## 8. Data Model and Song Manifest Structure

Song Flow uses manifest-like song objects. The frontend type in `MusicAIApp/src/data/songLessons.ts` includes:

- `id`
- `title`
- `artist`
- `difficulty`
- `bpm`
- `durationSec`
- `chordEvents`
- `tabNotes`
- `markers`
- `instrument`
- `tuning`
- `aiDraft`
- `confidence`
- `warnings`
- `isDemo`
- `isVerified`
- `isFavorite`

Chord events use timing and lane metadata:

```json
{
  "timeSec": 0,
  "chord": "Em",
  "laneRow": 2
}
```

Tab notes use timing, string, fret, and optional duration:

```json
{
  "timeSec": 0.5,
  "stringIndex": 0,
  "fret": 2,
  "durationSec": 0.35
}
```

Tuning metadata is preserved with generated and saved songs:

```json
{
  "instrument": "guitar",
  "tuning": {
    "id": "guitar_drop_c_sharp",
    "name": "Drop C#",
    "stringNotes": ["C#2", "G#2", "C#3", "F#3", "A#3", "D#4"]
  }
}
```

The frontend manifest validator treats imported JSON as unknown input until it passes validation. It rejects malformed top-level shapes, invalid timing, invalid chord lane rows, invalid tab string indexes, invalid frets, and manifests with no playable content.

## 9. Core Features

### 9.1 Tuner

TuneUp includes a real-time tuner with Guitar and Bass modes. It uses a shared tuner detector abstraction around `react-native-pitchy`, microphone permission handling, Expo AV audio-mode setup, and a clear Start/Stop lifecycle.

Implemented tuner behavior includes:

- Guitar and Bass internal modes.
- Guided and Manual guitar tuning.
- Standard guitar string targets: E2, A2, D3, G3, B3, E4.
- Standard bass string targets: E1, A1, D2, G2.
- Visible Start Listening, Stop Listening, and Try Again controls.
- Native module unavailable fallback for Expo Go.
- iOS Simulator startup failure fallback.
- Microphone denied/blocked/unavailable states.
- Duplicate-start prevention and cleanup on unmount.
- Frequency smoothing and no-signal handling.

The tuner uses cents for pitch comparison:

```text
cents = 1200 * log2(detectedFrequency / targetFrequency)
```

### 9.2 Songs Library

The Songs tab has been developed into a polished practice-library flow. It now has internal Upload and Library sections.

Upload section:

- Upload Song.
- Import Manifest.
- Demo Song.
- Instrument and tuning selection.
- AI Draft review.
- Save to Library.
- Practice Now.
- Retry, discard, and re-analysis handling where supported.

Library section:

- Search.
- Clear search.
- Filters including Favorites.
- Sort modes: Recently Added, Title A-Z, BPM, AI Draft First, Verified First.
- Song count and filtered count.
- Compact grid/tile song cards.
- Tap card to practise.
- Long press or overflow actions for Favorite, Edit, and Delete.
- BPM display.
- Tuning badges.
- AI Draft, Verified, Demo, Imported, and Favorite badges.
- Local duplicate-save prevention.

Saved songs are stored locally through `MusicAIApp/src/services/songLibrary.ts`. The built-in Demo Song remains available offline and does not require backend, Supabase, or upload.

### 9.3 AI Song Analysis

The AI analysis flow allows a user to upload audio and receive a generated practice chart. The pipeline is asynchronous and reviewed before saving.

Implemented behavior includes:

- File upload to `POST /analyze-audio`.
- Optional user ID.
- Instrument selection: guitar or bass.
- Tuning presets for standard, drop, half-step-down, and custom/unknown cases.
- Backend job creation.
- Frontend polling through `GET /task-status/{task_id}`.
- Terminal failed/timed-out states.
- AI Draft confidence and warnings.
- Tuning-aware tab mapping.
- Position-aware fret mapping that reduces open-string/low-fret bias.
- Original filename preserved separately from safe storage object key.
- Safe display-name cleanup for URL-encoded filenames.

TuneUp intentionally does not claim generated tabs are official or verified. This is important because automatic transcription is difficult with distorted audio, dense mixes, non-standard tunings, and complex arrangements.

### 9.4 Song Flow Practice Mode

Song Flow is the app's playable practice mode. It supports:

- Chords mode.
- Tabs mode.
- Guide mode.
- Tuning-aware string labels.
- Backing tracks.
- Chord and tab event rendering.
- Timing-based practice flow.
- Live microphone scoring support.
- Launching from saved library items, AI Draft review, imported manifests, and the built-in demo song.

For non-standard tunings, Song Flow uses manifest tuning metadata instead of always displaying standard E A D G B e labels. For example, a Drop C# guitar manifest displays the high-to-low labels D#, A#, F#, C#, G#, C#.

### 9.5 Lessons / Theory

The Lessons/Theory experience now follows a premium three-step flow:

```text
Instrument selection -> Lessons -> Lesson content
```

Implemented behavior includes:

- Animated instrument/path carousel.
- Guitar, Bass, Piano, Drums, and Theory paths.
- Lesson list grouped into Beginner, Intermediate, and Advanced.
- Polished lesson cards with XP, duration, difficulty, status, and tags.
- Lesson detail pages with hero content, objectives, media area, guided steps, quiz/checkpoint area, and completion CTA.
- Existing progress and XP behavior preserved.
- Empty-state handling for paths with no catalog rows.

The current bundled lesson data includes guitar, piano, and drum lesson packs. Bass is represented as a path with a safe empty state until bass content is added.

### 9.6 Profile / Progress

The Profile screen summarizes user identity, progress, settings, completed lessons, songs, badges, streaks, XP, and leaderboard-related data. Progress is handled through local persistence and optional Supabase-backed sync. Settings include controls for theory display, songs behavior, pitch assist preferences, profile shelves, and app-level practice settings.

### 9.7 Demo and Viva Reliability Features

The project includes several features specifically designed to make live assessment safer:

- Built-in verified Demo Song.
- Offline demo chart with original synthetic content.
- Backend `/health` and `/ready` endpoints.
- In-app backend diagnostics utility.
- Viva demo checklist in `docs/viva-demo-checklist.md`.
- Demo startup scripts under `scripts/`.
- Clear development-build guidance for native tuner support.
- Safe fallback messaging for backend, microphone, and native-module failures.

## 10. Songs Tab Deep Dive

The Songs tab is one of the strongest parts of the application because it links upload, analysis, review, local persistence, and practice.

The upload flow is:

```text
Songs tab
  -> Upload
  -> Choose audio file
  -> Choose instrument and tuning
  -> Start AI analysis
  -> Poll backend job status
  -> Review AI Draft
  -> Save to Library or Practice Now
```

The library flow is:

```text
Songs tab
  -> Library
  -> Search/filter/sort/favorite
  -> Tap song card
  -> Open Song Flow
```

The AI Draft review step is a deliberate safety decision. TuneUp treats generated tabs as AI Drafts. This is intentional because automatic guitar transcription is difficult, especially with distorted audio, non-standard tunings, and complex arrangements. The app therefore includes review, confidence, warnings, and manual library management instead of pretending that generated tabs are perfect.

The Songs tab also supports manual JSON import. Imported manifests are validated before being saved or opened, so malformed JSON cannot corrupt the library or crash Song Flow.

Saved songs can be edited, renamed, favorited, sorted, searched, and deleted. BPM is displayed where available, and the app avoids duplicate local saves when it can identify an equivalent song.

## 11. Tuner Deep Dive

The tuner is built around a small detector abstraction in `MusicAIApp/src/services/tunerDetector.ts`. The UI uses the `useTuner` hook rather than directly coupling the screen to the native module.

Key lifecycle states include:

- `idle`
- `checking_permission`
- `starting`
- `listening`
- `no_signal`
- `error`

The native detector uses `react-native-pitchy`, so it cannot run inside Expo Go. TuneUp handles this by showing a friendly message that a development or production native build is required.

Microphone permission is checked before detector startup. If access is denied or blocked, the app shows a user-facing fallback rather than crashing or silently failing. Startup errors are caught, partial listeners are cleaned up, and Stop Listening returns the tuner to idle.

Bass support was chosen over Drum Tuner because bass notes are sustained and better suited to pitch detection. Drum hits are short, noisy, and overtone-heavy, which makes them less reliable for this architecture without a specialised drum-tuning model.

## 12. AI Analysis Pipeline

The AI song-analysis pipeline is:

```text
User selects audio
  -> Frontend uploads file to backend
  -> Backend validates upload
  -> Backend stores audio in Supabase Storage
  -> Backend creates analysis job row
  -> Worker builds BPM/chords/tabs/manifest
  -> Frontend polls task status
  -> Backend returns generated manifest
  -> Frontend validates result
  -> User reviews AI Draft
  -> User saves or practises
```

Important implementation improvements include:

- Supabase Storage keys use safe UUID-based paths:

```text
analysis/YYYY/MM/DD/<uuid>.<safe_extension>
```

- Original filenames are preserved separately for display and metadata.
- Unsafe filename characters are not used in storage object keys.
- URL-encoded filenames are decoded and cleaned for user-facing display.
- Selected tuning metadata is sent to the backend.
- Tab mapping uses selected tuning string notes.
- Position-aware fret mapping prefers coherent, playable regions rather than always choosing the lowest fret.
- Confidence and warnings are returned with generated results.
- Unknown/custom tuning lowers tab confidence and warns the user.

The current AI analysis is a draft-generation system. It is not equivalent to official Songsterr, Ultimate Guitar, or professionally authored tabs. Future work should add manual correction tools and stronger transcription models.

## 13. Validation and Error Handling

Validation exists at several layers.

Frontend validation:

- Manifest JSON is parsed safely.
- Top-level manifests must be objects.
- `chordEvents` and `tabNotes` must have valid shapes.
- At least one playable content array is required.
- Timing values must be finite and non-negative.
- `laneRow`, `stringIndex`, and `fret` values are validated.
- Tuning metadata is accepted and checked.
- Invalid imports are rejected before save/navigation.

Backend validation:

- Required environment variables are checked at startup.
- Supabase URL format is validated.
- CORS origins are parsed, trimmed, and validated.
- Wildcard CORS is rejected in production.
- Storage bucket/prefix values reject surrounding quotes and accidental spaces.
- Upload file types/extensions are checked.
- Tuning metadata is validated for instrument and string count.
- Analysis jobs return terminal failed/timed-out states instead of polling forever.

Error handling:

- Backend API errors use structured safe envelopes.
- Stack traces and secrets are not returned to the frontend.
- Storage upload errors return a safe structured response.
- Frontend polling has timeout and network retry limits.
- Microphone and native-module errors show user-readable fallback states.

## 14. Security Considerations

Security work implemented in the repository includes:

- Real `.env` files are ignored by Git.
- `.env.example` files document required variables with placeholders only.
- Backend `SUPABASE_KEY` remains server-side.
- Frontend uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Backend CORS uses `CORS_ALLOW_ORIGINS`.
- Production wildcard CORS is rejected.
- Secrets are not printed in health endpoints.
- Health and readiness endpoints do not expose Supabase keys.
- Storage object keys do not include raw user filenames.
- Uploaded audio paths use safe UUID names.
- Service keys, Apple credentials, provisioning profiles, and private tokens are excluded from committed files.

The report deliberately does not include real keys, local machine paths, private tokens, Apple credentials, or real production URLs.

## 15. Testing Strategy

The repository contains both frontend and backend tests.

Frontend checks include:

- TypeScript compilation with `npx tsc --noEmit`.
- Jest tests with `npx jest --runInBand`.
- App bootstrap tests.
- Tuner screen and tuner utility tests.
- Microphone permission tests.
- Song screen tests.
- Song library persistence tests.
- Manifest validation tests.
- Song display-name cleanup tests.
- Song Flow string-label tests.
- API diagnostics tests.
- Lessons/Theory screen tests.

Backend checks include:

- Pytest API tests.
- Backend config validation tests.
- Health/readiness tests.
- Task status and async job lifecycle tests.
- Storage key safety tests.
- Tuning metadata and tab mapping tests.
- Audio accuracy baseline tests using synthetic fixtures.
- Manifest shape tests.

Example frontend commands:

```bash
cd MusicAIApp
npx tsc --noEmit
npx jest --runInBand
```

Example backend command:

```bash
cd backend
python -m pytest
```

The audio accuracy tests are regression checks, not proof of perfect transcription. They use synthetic/generated signals and tolerance-based assertions to catch obvious regressions in BPM, pitch, chord, marker, and manifest output.

## 16. Viva Demo Workflow

The viva/demo workflow is documented in `docs/viva-demo-checklist.md`.

The expected local demo setup is:

```bash
# Terminal 1
cd backend
source .venv/bin/activate
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

```bash
# Terminal 2
cd MusicAIApp
npx expo start --dev-client -c --host lan
```

Backend verification:

```bash
curl http://localhost:8000/health
```

The app is intended to be demonstrated using a local backend, local Expo Metro server, and a development build on iPhone or iOS Simulator. It is not dependent on TestFlight or App Store distribution for the viva.

The verified Demo Song provides an offline fallback if backend upload or AI analysis is unavailable during the assessment. A backup screen recording is still recommended for high-risk live demonstrations.

## 17. Known Limitations

Known limitations include:

- AI-generated tabs are drafts, not verified official tabs.
- Automatic transcription accuracy varies with audio quality, distortion, mix density, and tuning.
- Heavy rock/metal arrangements remain difficult to transcribe accurately.
- Real-time tuner functionality requires a native development or production build.
- Expo Go cannot load the native tuner module.
- iOS Simulator microphone/audio input can be unreliable.
- Upload-based AI analysis requires the backend to be running.
- Supabase connectivity is required for upload/storage-backed analysis jobs.
- Manual tab editing is not yet implemented.
- External song recognition and legal chord lookup are optional future work.
- Bass lessons currently have a path and empty state, but no bundled bass lesson pack.

## 18. Future Improvements

Recommended future improvements:

- Manual tab editor for correcting AI Drafts.
- Section loop practice and focused rehearsal loops.
- Count-in, pause/resume, and latency calibration improvements.
- More detailed practice history and analytics.
- Cloud sync for saved songs.
- Better AI transcription model or specialised music transcription service.
- Optional legal music recognition metadata integration.
- MIDI, MusicXML, or Guitar Pro import.
- More complete Bass lesson path.
- More interactive quizzes and checkpoint scoring.
- Deployment-ready backend hosting and production monitoring.
- Role-based Supabase policies and full production schema documentation.
- Improved audio diagnostics for device-specific microphone issues.

## 19. Conclusion

TuneUp is a working full-stack final-year project that brings together mobile UI design, native audio handling, backend audio analysis, Supabase integration, local persistence, validation, testing, and demo readiness.

The app demonstrates a coherent practice assistant experience: tune the instrument, learn through lessons, upload or import songs, review AI-generated draft charts, save them to a library, and practise in Song Flow. It is not a finished commercial transcription product, but it is a strong prototype with realistic technical safeguards and honest handling of AI limitations.

The project is dissertation-appropriate because it shows implementation depth across frontend architecture, backend services, native capability constraints, validation, security, testing, and user-centered reliability for a live viva.
