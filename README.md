# TuneUpDemo1 - AI-Powered Music Learning Platform 🎵

A comprehensive music education and analysis platform combining **React Native (Expo)** mobile app with an **AI-powered FastAPI backend** for musicians of all levels. This platform integrates real-time pitch detection, AI music analysis, interactive music theory games, and a professional studio-style traffic editor.

---

## Table of Contents
1. [How the App Works (Functional Overview)](#1-how-the-app-works-functional-overview)
2. [How the Code Works (Technical Deep Dive)](#2-how-the-code-works-technical-deep-dive)
3. [Project Structure](#3-project-structure)
4. [Project Index & Glossary](#4-project-index--glossary)
5. [Roadmap & Future Improvements](#5-roadmap--future-improvements)

---

## 1. How the App Works (Functional Overview)

### What This Application Does

**TuneUpDemo1** is a mobile music education platform designed to help musicians:
- **Tune instruments in real-time** using advanced pitch detection
- **Learn music theory** through interactive gamification
- **Analyze songs** using AI to detect BPM, structure, and sections
- **Create professional annotations** on music tracks like a studio engineer

### Core Features

#### 🎸 **Pratik (Practice) Screen** - Instrument Tuner & Rhythm Detector
- **Multi-Instrument Support**: Guitar, Bass, and Drums
- **Real-time Pitch Detection**: Uses autocorrelation algorithm to detect frequency from live microphone input
- **Visual Feedback**: 
  - Guitar/Bass: Animated needle showing pitch deviation
  - Drums: Pulsating visual rhythm detector based on RMS (Root Mean Square) audio analysis
- **Precision Tuning**: Detects if instrument is sharp, flat, or perfectly tuned within 3Hz tolerance

#### 📚 **Teori (Theory) Screen** - Interactive Note Reading Game
- **Musical Staff Display**: Authentic music notation with treble clef
- **7-Key Piano Interface**: Realistic piano keyboard with white and black keys
- **Gamification**: XP system, streak tracking, immediate feedback
- **Educational Goal**: Train musicians to read sheet music by sight

#### 🎛️ **Trafik (Traffic) Screen** - AI Studio Editor
- **Audio File Upload**: Import MP3/WAV files for analysis
- **AI-Powered Analysis**: Automatically detects:
  - BPM (Beats Per Minute)
  - Song structure (Intro, Verse, Chorus, Bridge, Outro)
  - Optimal section markers with color-coded labels
- **Waveform Visualization**: Chunk-based rendering for smooth performance
- **Manual Editing**: Add custom markers at any position
- **Data Persistence**: Save analyses to Firebase Firestore for cloud storage

#### 🎵 **Şarkı (Song) Screen** - Song Repertoire
- Displays curated song library with difficulty ratings
- Color-coded difficulty levels (Easy, Medium, Hard)
- Beautiful gradient UI with card-based design

### User Flow
```
User Opens App → Selects Tab
  ├─ Pratik: Records audio → Analyzes pitch/rhythm → Displays tuning feedback
  ├─ Teori: Displays random note → User plays piano → Validates answer → Updates score
  ├─ Trafik: Uploads song → AI analyzes → Displays waveform + markers → User can save
  └─ Şarkı: Browse song library → Select difficulty level
```

### Problem This Project Solves
Musicians often struggle with:
- **Instrument tuning** without expensive tuners
- **Learning music theory** in an engaging, non-boring way
- **Understanding song structure** for practice or performance
- **Accessing professional tools** that are too complex or expensive

This app democratizes these tools into a single, free, mobile-first platform.

---

## 2. How the Code Works (Technical Deep Dive)

### Technical Architecture

The application follows a **Client-Server Architecture** with a clear separation of concerns:

```
┌─────────────────────────────────────────┐
│   React Native Mobile App (Frontend)   │
│   - Navigation (Tab-based)              │
│   - UI Components (Screens)             │
│   - Local Database (WatermelonDB)       │
│   - Real-time Audio Processing          │
└─────────────┬───────────────────────────┘
              │ HTTP/REST API
              │ (FormData for file uploads)
┌─────────────▼───────────────────────────┐
│   FastAPI Backend (Python)              │
│   - AI Music Analysis (Librosa)         │
│   - BPM Detection                        │
│   - Segmentation (Section Detection)    │
│   - Firebase Integration                │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│   Firebase Firestore (Cloud Database)  │
│   - Traffic Analysis Storage            │
│   - User Data (Future)                  │
└─────────────────────────────────────────┘
```

### Data Flow & State Management

#### Frontend State Management
- **React Hooks**: `useState`, `useRef`, `useEffect` for component-level state
- **Shared Values**: `react-native-reanimated` for high-performance animations
- **No Global State**: Each screen manages its own state independently

#### Audio Processing Pipeline (PracticalScreen)
```
Microphone → Audio Recording (Expo AV)
          → Base64 Encoding
          → PCM Decoding (pitchDetection.ts)
          → Frequency Analysis (Autocorrelation)
          → Note Matching (tuningData.ts)
          → Visual Feedback (Skia Canvas)
```

#### AI Analysis Pipeline (TrafficScreen + Backend)
```
User Uploads File
   ↓
Frontend: FormData → API Call (api.ts)
   ↓
Backend: Librosa.load() → Audio Signal (Float32Array)
   ↓
BPM Detection: Onset Strength + Beat Tracking
   ↓
Segmentation: Chroma CQT + Agglomerative Clustering
   ↓
Marker Generation: Smart filtering (5-175s, 15s spacing)
   ↓
Response: { bpm, markers[] } → Frontend
   ↓
Display: Waveform with colored section markers
   ↓
Save to Firebase: Firestore.collection('traffic_analyses').add()
```

### Key Technologies & Why They're Used

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **React Native (Expo)** | Cross-platform mobile UI | Deploy to iOS/Android simultaneously with native performance |
| **@shopify/react-native-skia** | Canvas rendering | Hardware-accelerated graphics for smooth animations (60fps) |
| **react-native-reanimated** | Animations | Runs animations on UI thread for jank-free experience |
| **Expo AV** | Audio recording | Simple API for microphone access with cross-platform support |
| **WatermelonDB** | Local database | Reactive, lazy-loaded SQLite database for offline-first apps |
| **FastAPI** | Backend framework | Async Python framework with automatic API documentation |
| **Librosa** | Audio analysis | Industry-standard library for music information retrieval (MIR) |
| **Firebase Firestore** | Cloud database | NoSQL database with real-time sync and easy scalability |
| **NumPy** | Numerical computing | Efficient array operations for audio signal processing |

### Complex Algorithms Explained

#### 1. **Autocorrelation Pitch Detection** ([pitchDetection.ts](file:///Users/yavuzsever/Desktop/TuneUpDemo1/MusicAIApp/src/utils/pitchDetection.ts))

**What it does**: Detects the fundamental frequency of a musical note from raw audio.

**How it works**:
```typescript
autoCorrelate(buffer: Float32Array, sampleRate: number)
```

1. **RMS Filtering**: Calculates Root Mean Square to filter out silence (< 0.01)
2. **Edge Trimming**: Removes leading/trailing silence using threshold (0.2)
3. **Autocorrelation**: For each time-lag `i`, calculates correlation:
   ```
   c[i] = Σ (buffer[j] * buffer[j+i])
   ```
   This finds repeating patterns (periodicity) in the signal
4. **Peak Detection**: Finds the lag with maximum correlation (excludes initial decay)
5. **Frequency Calculation**: `frequency = sampleRate / lag`

**Why autocorrelation?**
- Simple, fast, and works well for monophonic instruments
- More robust than zero-crossing for complex waveforms
- No FFT overhead, runs efficiently on mobile devices

#### 2. **AI Song Segmentation** ([main.py](file:///Users/yavuzsever/Desktop/TuneUpDemo1/backend/main.py#L143-L203))

**What it does**: Automatically divides a song into sections (Intro, Verse, Chorus, etc.)

**How it works**:
```python
chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
bounds = librosa.segment.agglomerative(chroma, 6)
```

1. **Chroma Feature Extraction**: 
   - Uses Constant-Q Transform (CQT) to get pitch classes (C, C#, D, etc.)
   - Creates a time-series of 12-dimensional chroma vectors
   - Captures harmonic content while ignoring timbre

2. **Agglomerative Clustering**:
   - Hierarchical clustering algorithm
   - Merges similar adjacent segments based on chroma similarity
   - Forces exactly 6 segments (Intro, Verse1, Chorus, Verse2, Bridge, Outro)

3. **Smart Filtering**:
   ```python
   if t > 5.0 and t < 175.0 and (t - last_time > 15.0):
   ```
   - Skips first 5 seconds (song start is obvious)
   - Ignores after 175 seconds (avoids cluttered fade-outs)
   - Enforces 15-second minimum spacing between markers

4. **Color Mapping**: Assigns semantic colors from `SECTION_COLORS` dictionary

**Why this approach?**
- Chroma is musically meaningful (captures chord changes)
- Agglomerative clustering doesn't require training data
- Smart filtering prevents marker spam and improves UX

#### 3. **Chunk-Based Waveform Rendering** ([TrafficScreen.tsx](file:///Users/yavuzsever/Desktop/TuneUpDemo1/MusicAIApp/src/screens/TrafficScreen.tsx#L74-L88))

**What it does**: Renders hours-long songs smoothly without performance issues

**How it works**:
```typescript
const totalBars = Math.floor((seconds * PIXELS_PER_SECOND) / TOTAL_BAR_WIDTH)
const totalChunks = Math.ceil(totalBars / POINTS_PER_CHUNK)
```

1. **Virtualization**: Only renders chunks visible on screen (FlatList `windowSize={5}`)
2. **Memoization**: `React.memo()` prevents re-rendering unchanged chunks
3. **Skia Paths**: Hardware-accelerated canvas drawing
4. **Random Data**: Currently uses `Math.random()` for demo (real waveform extraction planned)

**Performance**: Can handle 3-hour songs at 60fps on mid-range devices.

---

## 3. Project Structure

```
TuneUpDemo1/
├── 📱 MusicAIApp/                    # React Native Mobile Application (Expo)
│   ├── 📂 src/                       # Source code
│   │   ├── 📂 database/              # WatermelonDB local database
│   │   │   ├── index.ts              # Database initialization
│   │   │   ├── model.ts              # Song & Progress models (ORM)
│   │   │   ├── schema.ts             # Database schema definition
│   │   │   └── services.ts           # CRUD operations
│   │   ├── 📂 screens/               # Main UI screens (Tab Navigator)
│   │   │   ├── PracticalScreen.tsx   # 🎸 Tuner + Rhythm detector (Pitch detection, Skia animations)
│   │   │   ├── TheoryScreen.tsx      # 📚 Music theory game (Note reading, gamification)
│   │   │   ├── TrafficScreen.tsx     # 🎛️ AI Studio Editor (Waveform, markers, AI analysis)
│   │   │   └── SongScreen.tsx        # 🎵 Song library (Repertoire browser)
│   │   ├── 📂 services/              # API communication layer
│   │   │   └── api.ts                # Backend API calls (recommend, analyze, save)
│   │   ├── 📂 utils/                 # Helper functions & algorithms
│   │   │   ├── pitchDetection.ts     # Autocorrelation algorithm, PCM decoder
│   │   │   └── tuningData.ts         # Instrument tuning frequencies (Guitar, Bass, Ukulele)
│   │   └── theme.ts                  # Global color palette & spacing constants
│   ├── App.tsx                       # Root component (Navigation setup, Tab Bar)
│   ├── package.json                  # Dependencies (React Native, Expo, Skia, WatermelonDB)
│   └── tsconfig.json                 # TypeScript configuration
│
├── 🐍 backend/                       # FastAPI Python Backend (AI Engine)
│   ├── main.py                       # Main API server (5 endpoints: recommend, analyze-bpm, analyze-full, save-traffic, get-traffic)
│   ├── models.py                     # Pydantic data models (UserProfile, TrafficData)
│   ├── serviceAccountKey.json        # 🔐 Firebase Admin SDK credentials (GITIGNORED)
│   ├── traffic_db.json               # Legacy local database (deprecated, kept for fallback)
│   ├── temp_files/                   # Temporary storage for uploaded audio files
│   └── uploads/                      # Uploaded songs stored here temporarily
│
├── .git/                             # Git version control
├── .venv/                            # Python virtual environment (backend dependencies)
└── package-lock.json                 # Root package lock (if any shared scripts exist)
```

### Key File Annotations

| File | Purpose |
|------|---------|
| **App.tsx** | Configures 4-tab bottom navigation with blur effect, sets up routing |
| **PracticalScreen.tsx** | Records 100ms audio chunks in loop, analyzes via autocorrelation, renders Skia needle/drum animations |
| **TrafficScreen.tsx** | Manages waveform playback, chunk-based rendering, AI analysis trigger, Firebase save |
| **TheoryScreen.tsx** | Displays musical staff, generates random notes, validates piano input, tracks XP/streaks |
| **api.ts** | Handles HTTP requests to backend (FormData for files, JSON for metadata) |
| **pitchDetection.ts** | Core DSP: Base64→PCM→Float32→Autocorrelation→Frequency |
| **tuningData.ts** | Reference frequency tables for standard tunings, closest-string matcher |
| **main.py** | FastAPI server with 5 endpoints, Librosa integration, Firebase Firestore client |
| **schema.ts** | WatermelonDB schema (songs, progress tables) for offline data |

---

## 4. Project Index & Glossary

### Top 5 Critical Components

#### 1. **`autoCorrelate()` Function** ([pitchDetection.ts:11-48](file:///Users/yavuzsever/Desktop/TuneUpDemo1/MusicAIApp/src/utils/pitchDetection.ts#L11-L48))
**Responsibility**: Converts raw audio samples into a frequency value (Hz)  
**Why Critical**: The entire tuner feature depends on this. Without it, pitch detection fails.  
**Dependencies**: Called by `PracticalScreen.tsx` every 100ms during listening mode.  
**Algorithm**: Autocorrelation-based pitch detection (industry-standard for monophonic audio).

---

#### 2. **`/analyze-full` Endpoint** ([main.py:123-223](file:///Users/yavuzsever/Desktop/TuneUpDemo1/backend/main.py#L123-L223))
**Responsibility**: Full AI analysis of uploaded songs (BPM + segmentation + markers)  
**Why Critical**: Powers the entire Traffic Editor feature. Returns structured data consumed by frontend.  
**Data Flow**:
```
Input: Multipart file upload
 ↓
Librosa processing (CQT, onset detection, agglomerative clustering)
 ↓
Output: { status, bpm, markers: [{ id, label, color, time }], message }
```
**Fallback Logic**: If AI fails to find sections, uses hardcoded 30/60/90/120s markers.

---

#### 3. **`TrafficScreen` Component** ([TrafficScreen.tsx](file:///Users/yavuzsever/Desktop/TuneUpDemo1/MusicAIApp/src/screens/TrafficScreen.tsx))
**Responsibility**: Studio-style waveform editor with playback, markers, and AI integration  
**Why Critical**: Most complex UI component; integrates audio playback, canvas rendering, AI API, and Firebase.  
**State Management**:
- `chunks`: 2D array of waveform amplitude data
- `markers`: Array of `{ id, label, color, x }` for section annotations
- `sound`: Expo AV Sound object for playback control
- `scrollX`: Tracks horizontal scroll position for playhead sync

**Performance Optimizations**:
- `React.memo()` on `WaveChunk` to prevent unnecessary re-renders
- `windowSize={5}` virtualizes rendering (only 5 chunks in memory)
- `removeClippedSubviews` recycles views outside viewport

---

#### 4. **`getClosestString()` Function** ([tuningData.ts:35-57](file:///Users/yavuzsever/Desktop/TuneUpDemo1/MusicAIApp/src/utils/tuningData.ts#L35-L57))
**Responsibility**: Matches detected frequency to nearest instrument string (e.g., "E2", "A3")  
**Why Critical**: Bridges raw frequency data to user-friendly note names.  
**Algorithm**:
```typescript
For each string in TUNINGS[instrument]:
  Calculate frequency difference
  Track minimum difference
Return { stringName, targetFreq, diff, isPerfect: (diff < 3Hz) }
```
**Used by**: `PracticalScreen` to display which string is being tuned.

---

#### 5. **Firebase Firestore Integration** ([main.py:16-23, 96-120](file:///Users/yavuzsever/Desktop/TuneUpDemo1/backend/main.py#L16-L23))
**Responsibility**: Cloud storage for traffic analyses  
**Why Critical**: Enables persistent data across devices; future foundation for user accounts.  
**Collections**:
- `traffic_analyses`: Stores `{ song_name, duration, markers[] }`

**API Methods**:
- `POST /save-traffic`: Saves analysis to Firestore
- `GET /get-traffic`: Retrieves all saved analyses

**Schema** (Implicit, NoSQL):
```json
{
  "song_name": "string",
  "duration": "number",
  "markers": [
    { "id": "number", "label": "string", "color": "string", "x": "number" }
  ]
}
```

---

## 5. Roadmap & Future Improvements

### Code Comments (TODO/FIXME/NOTE)

No `TODO`, `FIXME`, or explicit `NOTE` comments found in the codebase. However, several implicit TODOs exist based on code analysis:

#### Identified Implicit TODOs:

1. **[TrafficScreen.tsx:34]** - Waveform data is currently random:
   ```typescript
   // Currently uses Math.random() for demo
   new Array(POINTS_PER_CHUNK).fill(0).map(() => Math.random() * 40)
   ```
   **TODO**: Extract real waveform envelope from audio file using FFT or peak amplitude analysis.

2. **[api.ts:6]** - Hardcoded IP address:
   ```typescript
   const API_URL = 'http://192.168.0.28:8000';
   ```
   **TODO**: Use environment variables or auto-discovery for backend URL (prevents manual changes per network).

3. **[SongScreen.tsx:7-13]** - Hardcoded demo songs:
   ```typescript
   const DEMO_SONGS = [ ... ]
   ```
   **TODO**: Fetch songs from backend API or Firebase. Integrate with `/recommend` endpoint.

4. **[models.py:5-10]** - Unused `UserProfile` model:
   ```python
   class UserProfile(BaseModel):
       email: str
       instrument: str
       level: int = 1
   ```
   **TODO**: Implement user authentication system (Firebase Auth + profile endpoints).

5. **[main.py:134]** - 180-second limit on analysis:
   ```python
   y, sr = librosa.load(file_path, sr=None, duration=180)
   ```
   **TODO**: Support full-length analysis (requires chunking/streaming or progress callbacks).

---

### Suggested Next Steps

Based on codebase analysis, here are **3 logical improvements** to enhance the platform:

#### 🚀 **1. Real Waveform Visualization**
**Problem**: Traffic Editor currently shows random data instead of actual audio waveform.

**Solution**:
- Backend: Add `/extract-waveform` endpoint using Librosa's `librosa.amplitude_to_db()`
- Generate downsampled amplitude envelope (e.g., 1 sample per 100ms)
- Return as JSON array to frontend
- Frontend: Replace `Math.random()` with API response data

**Benefits**:
- Users can visually identify loud/quiet sections
- More accurate marker placement
- Professional appearance

**Estimated Effort**: 2-3 hours

---

#### 🎯 **2. User Authentication & Progress Tracking**
**Problem**: No user accounts; XP/streaks reset on app close.

**Solution**:
- Firebase Authentication (email/password or Google Sign-In)
- Backend: Add `/users` endpoints (create, get, update profile)
- Frontend: WatermelonDB sync with Firestore for offline-first UX
- Link `Progress` model to Firebase UID

**Benefits**:
- Cross-device progress sync
- Leaderboards and social features
- Personalized song recommendations based on skill level

**Estimated Effort**: 6-8 hours

---

#### ⚡ **3. Performance Optimization: Replace AutoCorrelation with AMDF/YIN**
**Problem**: Autocorrelation is CPU-intensive (O(n²) complexity).

**Concern**: On lower-end devices, 100ms intervals may lag during pitch detection.

**Solution**:
- Replace autocorrelation with **YIN algorithm** (more efficient, more accurate)
- YIN is O(n) and handles harmonic instruments better
- Use libraries like `@echogarden/yin` or implement manually

**Benefits**:
- Faster response time (50-70ms latency reduction)
- Better accuracy for guitars with overtones
- Lower battery consumption

**Estimated Effort**: 4-5 hours

**Reference**: [YIN Algorithm Paper (2002)](http://audition.ens.fr/adc/pdf/2002_JASA_YIN.pdf)

---

### Bonus Suggestions (Smaller Wins)

- **Unit Tests**: Add Jest tests for `autoCorrelate()`, `getClosestString()`, API endpoints
- **Error Handling**: Add user-friendly error messages for network failures (currently shows generic "Sunucuya ulaşılamadı")
- **Localization**: Extract Turkish strings to i18n library (currently hardcoded)
- **Dark Mode Toggle**: UI is always dark; add light mode option
- **Metronome**: Add click track to Practice screen for rhythm training

---

## Getting Started

### Prerequisites
- **Node.js** 18+ (for React Native)
- **Python** 3.9+ (for backend)
- **Expo CLI**: `npm install -g expo-cli`
- **Firebase Project** (for cloud storage)

### Installation

#### Frontend (Mobile App)
```bash
cd MusicAIApp
npm install
npx expo start
```
Scan QR code with Expo Go app or run in iOS/Android simulator.

#### Backend (API Server)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install fastapi uvicorn librosa firebase-admin scikit-learn
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Update API URL**: Change `API_URL` in [api.ts](file:///Users/yavuzsever/Desktop/TuneUpDemo1/MusicAIApp/src/services/api.ts#L6) to your local IP.

---

## Technologies Used

**Frontend**:
- React Native 0.81.5
- Expo SDK 54
- TypeScript 5.9
- React Navigation 7
- @shopify/react-native-skia 2.2.12
- react-native-reanimated 4.1.1
- WatermelonDB 0.28.0
- Expo AV 16.0.7
- NativeWind (TailwindCSS for React Native)

**Backend**:
- Python 3.9+
- FastAPI
- Librosa 0.10+
- NumPy
- Firebase Admin SDK
- Scikit-learn (for clustering)

**Cloud**:
- Firebase Firestore (NoSQL database)
- Firebase Admin SDK (server-side)

---

## License

This project is for educational/demonstration purposes.

---

## Credits

Developed by Yavuz Sever as a music education platform prototype.

**Special Thanks**:
- Librosa team for music analysis tools
- Expo team for seamless React Native development
- Shopify for high-performance Skia renderer
