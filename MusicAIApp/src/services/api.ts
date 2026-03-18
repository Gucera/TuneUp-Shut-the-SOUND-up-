// Your backend URL
// If using a simulator: 'http://127.0.0.1:8000'
// If using a real phone or QR code: use your Mac's IP (e.g. 'http://192.168.1.35:8000')
// To find your IP, run in terminal: ipconfig getifaddr en0

const API_URL = 'http://127.0.0.1:8000';

export interface LeaderboardProfilePayload {
    userId: string;
    displayName: string;
    xp: number;
    level: number;
    streakDays: number;
    longestStreak: number;
    badges: string[];
    completedLessons: number;
    completedSongs: number;
    completedQuizzes: number;
}

export interface LeaderboardEntry {
    userId: string;
    displayName: string;
    xp: number;
    level: number;
    streakDays: number;
    longestStreak: number;
    badges: string[];
    completedLessons: number;
    completedSongs: number;
    completedQuizzes: number;
    updatedAt: string | null;
}

export interface TrafficMarkerPayload {
    id: number;
    label: string;
    color: string;
    x: number;
}

export interface TrafficAnalysisEntry {
    songName: string;
    duration: number;
    markers: TrafficMarkerPayload[];
    userId: string | null;
    createdAt: string | null;
}

const getAudioMimeType = (fileName: string, fileUri: string) => {
    const candidate = `${fileName}.${fileUri}`.toLowerCase();

    if (candidate.includes('.wav')) {
        return 'audio/wav';
    }

    if (candidate.includes('.m4a')) {
        return 'audio/m4a';
    }

    if (candidate.includes('.mp3')) {
        return 'audio/mpeg';
    }

    return 'application/octet-stream';
};

// Recommend a song based on mood
export const recommendSong = async (mood: string) => {
    try {
        const response = await fetch(`${API_URL}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mood }),
        });
        return await response.json();
    } catch (error) {
        return null;
    }
};

// Simple BPM analysis (legacy endpoint)
export const analyzeBpm = async (fileUri: string, fileName: string) => {
    try {
        const formData = new FormData();
        formData.append('file', {
            uri: fileUri,
            name: fileName || 'audio.mp3',
            type: 'audio/mpeg',
        } as any);

        const response = await fetch(`${API_URL}/analyze-bpm`, {
            method: 'POST',
            body: formData,
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return await response.json();
    } catch (error) {
        return { status: 'error', message: 'Server error' };
    }
};

// Save traffic analysis data to Firebase
export const saveTrafficData = async (
    songName: string,
    duration: number,
    markers: TrafficMarkerPayload[],
    userId?: string,
) => {
    try {
        const response = await fetch(`${API_URL}/save-traffic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                song_name: songName,
                duration: duration,
                markers: markers,
                user_id: userId ?? null,
            }),
        });

        const data = await response.json();
        return data;
    } catch (error) {
        return { status: "error", message: "Could not reach the server." };
    }
};

export const fetchTrafficAnalyses = async (userId?: string): Promise<TrafficAnalysisEntry[]> => {
    try {
        const suffix = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
        const response = await fetch(`${API_URL}/get-traffic${suffix}`);
        const data = await response.json();

        if (!response.ok || !Array.isArray(data)) {
            return [];
        }

        return data.map((entry: any) => ({
            songName: typeof entry.song_name === 'string' ? entry.song_name : 'Untitled',
            duration: typeof entry.duration === 'number' ? entry.duration : 0,
            markers: Array.isArray(entry.markers) ? entry.markers : [],
            userId: typeof entry.user_id === 'string' ? entry.user_id : null,
            createdAt: typeof entry.created_at === 'string' ? entry.created_at : null,
        }));
    } catch (error) {
        return [];
    }
};

// Full AI analysis — sends a song file for BPM + section detection
export const analyzeSongFile = async (fileUri: string, fileName: string) => {
    try {
        const formData = new FormData();

        // Make sure the filename has an extension (prevents backend errors)
        let safeFileName = fileName || 'song.mp3';
        if (!safeFileName.includes('.')) {
            safeFileName += '.mp3';
        }

        formData.append('file', {
            uri: fileUri,
            name: safeFileName,
            type: 'audio/mpeg',
        } as any);

        const response = await fetch(`${API_URL}/analyze-full`, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        const data = await response.json();
        return data;
    } catch (error) {
        return { status: 'error', message: 'Could not connect to server.' };
    }
};

export const detectPitchFromClip = async (fileUri: string, fileName: string, instrument: string) => {
    try {
        const formData = new FormData();
        let safeFileName = fileName || 'clip.m4a';
        if (!safeFileName.includes('.')) {
            safeFileName += '.m4a';
        }

        formData.append('file', {
            uri: fileUri,
            name: safeFileName,
            type: getAudioMimeType(safeFileName, fileUri),
        } as any);
        formData.append('instrument', instrument);

        const response = await fetch(`${API_URL}/detect-pitch`, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        return await response.json();
    } catch (error) {
        return { status: 'error', message: 'Could not connect to server.' };
    }
};

export const syncLeaderboardProfile = async (payload: LeaderboardProfilePayload) => {
    const response = await fetch(`${API_URL}/sync-leaderboard`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            user_id: payload.userId,
            display_name: payload.displayName,
            xp: payload.xp,
            level: payload.level,
            streak_days: payload.streakDays,
            longest_streak: payload.longestStreak,
            badges: payload.badges,
            completed_lessons: payload.completedLessons,
            completed_songs: payload.completedSongs,
            completed_quizzes: payload.completedQuizzes,
        }),
    });

    return await response.json();
};

export const fetchLeaderboard = async (limit = 8): Promise<LeaderboardEntry[]> => {
    try {
        const response = await fetch(`${API_URL}/leaderboard?limit=${limit}`);
        const data = await response.json();

        if (!response.ok || !Array.isArray(data?.leaderboard)) {
            return [];
        }

        return data.leaderboard.map((entry: any) => ({
            userId: entry.user_id ?? 'unknown',
            displayName: entry.display_name ?? 'Player',
            xp: typeof entry.xp === 'number' ? entry.xp : 0,
            level: typeof entry.level === 'number' ? entry.level : 1,
            streakDays: typeof entry.streak_days === 'number' ? entry.streak_days : 0,
            longestStreak: typeof entry.longest_streak === 'number' ? entry.longest_streak : 0,
            badges: Array.isArray(entry.badges) ? entry.badges : [],
            completedLessons: typeof entry.completed_lessons === 'number' ? entry.completed_lessons : 0,
            completedSongs: typeof entry.completed_songs === 'number' ? entry.completed_songs : 0,
            completedQuizzes: typeof entry.completed_quizzes === 'number' ? entry.completed_quizzes : 0,
            updatedAt: typeof entry.updated_at === 'string' ? entry.updated_at : null,
        }));
    } catch (error) {
        return [];
    }
};
