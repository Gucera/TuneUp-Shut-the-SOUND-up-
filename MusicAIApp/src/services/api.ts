const BASE_URL = 'https://tuneup-shut-the-sound-up.onrender.com';
const WARMUP_WINDOW_MS = 45_000;

let lastWarmupAt = 0;
let pendingWarmup: Promise<void> | null = null;

type ApiPayload = Record<string, any>;

export interface ApiErrorResponse {
    status: 'error' | 'failed';
    message: string;
    statusCode?: number;
}

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

export interface AnalysisMarkerPayload {
    id: number;
    label: string;
    color: string;
    x: number;
    time: number;
}

export interface AnalysisResultPayload {
    bpm: number;
    markers: AnalysisMarkerPayload[];
    message: string;
}

export interface LegacySongAnalysisResponse {
    status: 'success';
    bpm: number;
    markers: AnalysisMarkerPayload[];
    message: string;
}

export interface UploadAudioAcceptedResponse {
    status: 'accepted';
    taskId: string;
    progressText: string;
    message: string;
}

export interface AnalysisTaskProcessingResponse {
    status: 'processing';
    taskId: string;
    progressText: string;
    updatedAt: string | null;
}

export interface AnalysisTaskCompletedResponse {
    status: 'completed';
    taskId: string;
    progressText: string;
    updatedAt: string | null;
    result: AnalysisResultPayload;
}

export interface AnalysisTaskFailedResponse {
    status: 'failed';
    taskId: string;
    progressText: string;
    updatedAt: string | null;
    message: string;
}

export type AnalysisTaskStatusResponse =
    | AnalysisTaskProcessingResponse
    | AnalysisTaskCompletedResponse
    | AnalysisTaskFailedResponse
    | ApiErrorResponse;

function inferAudioMimeType(fileName: string, fileUri: string) {
    const candidate = `${fileName} ${fileUri}`.toLowerCase();

    if (candidate.includes('.wav')) {
        return 'audio/wav';
    }

    if (candidate.includes('.m4a')) {
        return 'audio/mp4';
    }

    if (candidate.includes('.mp3')) {
        return 'audio/mpeg';
    }

    return 'application/octet-stream';
}

async function readJsonPayload(response: Response): Promise<ApiPayload> {
    const rawText = await response.text();

    if (!rawText) {
        return {};
    }

    try {
        return JSON.parse(rawText) as ApiPayload;
    } catch {
        return { message: rawText };
    }
}

function getString(payload: ApiPayload, key: string, fallback: string) {
    return typeof payload[key] === 'string' ? payload[key] : fallback;
}

function getNullableString(payload: ApiPayload, key: string) {
    return typeof payload[key] === 'string' ? payload[key] : null;
}

function buildApiError(response: Response | null, payload: ApiPayload, fallback: string): ApiErrorResponse {
    return {
        status: 'error',
        message: getString(payload, 'detail', getString(payload, 'message', fallback)),
        ...(response ? { statusCode: response.status } : {}),
    };
}

function createAudioFormData(fileUri: string, fileName: string, fallbackFileName: string) {
    const normalizedFileName = fileName && fileName.includes('.')
        ? fileName
        : fallbackFileName;
    const formData = new FormData();

    formData.append('file', {
        uri: fileUri,
        name: normalizedFileName,
        type: inferAudioMimeType(normalizedFileName, fileUri),
    } as any);

    return formData;
}

async function warmBackendIfNeeded() {
    const now = Date.now();
    if ((now - lastWarmupAt) < WARMUP_WINDOW_MS) {
        return;
    }

    if (pendingWarmup) {
        return pendingWarmup;
    }

    pendingWarmup = (async () => {
        try {
            await fetch(`${BASE_URL}/`);
        } catch {
            return;
        } finally {
            lastWarmupAt = Date.now();
            pendingWarmup = null;
        }
    })();

    return pendingWarmup;
}

async function requestJson(path: string, init: RequestInit, options?: { warmup?: boolean }) {
    if (options?.warmup) {
        await warmBackendIfNeeded();
    }

    const response = await fetch(`${BASE_URL}${path}`, init);
    const payload = await readJsonPayload(response);
    return { response, payload };
}

function mapTrafficAnalysisEntry(entry: any): TrafficAnalysisEntry {
    return {
        songName: typeof entry?.song_name === 'string' ? entry.song_name : 'Untitled',
        duration: typeof entry?.duration === 'number' ? entry.duration : 0,
        markers: Array.isArray(entry?.markers) ? entry.markers : [],
        userId: typeof entry?.user_id === 'string' ? entry.user_id : null,
        createdAt: typeof entry?.created_at === 'string' ? entry.created_at : null,
    };
}

function mapAnalysisResult(payload: ApiPayload, fallbackMessage: string): AnalysisResultPayload {
    return {
        bpm: typeof payload.bpm === 'number' ? payload.bpm : 0,
        markers: Array.isArray(payload.markers) ? payload.markers : [],
        message: getString(payload, 'message', fallbackMessage),
    };
}

function mapLeaderboardEntry(entry: any): LeaderboardEntry {
    return {
        userId: entry?.user_id ?? 'unknown',
        displayName: entry?.display_name ?? 'Player',
        xp: typeof entry?.xp === 'number' ? entry.xp : 0,
        level: typeof entry?.level === 'number' ? entry.level : 1,
        streakDays: typeof entry?.streak_days === 'number' ? entry.streak_days : 0,
        longestStreak: typeof entry?.longest_streak === 'number' ? entry.longest_streak : 0,
        badges: Array.isArray(entry?.badges) ? entry.badges : [],
        completedLessons: typeof entry?.completed_lessons === 'number' ? entry.completed_lessons : 0,
        completedSongs: typeof entry?.completed_songs === 'number' ? entry.completed_songs : 0,
        completedQuizzes: typeof entry?.completed_quizzes === 'number' ? entry.completed_quizzes : 0,
        updatedAt: typeof entry?.updated_at === 'string' ? entry.updated_at : null,
    };
}

export const recommendSong = async (mood: string) => {
    try {
        const { payload } = await requestJson('/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mood }),
        });

        return payload;
    } catch {
        return null;
    }
};

export const analyzeBpm = async (fileUri: string, fileName: string) => {
    try {
        const { payload } = await requestJson('/analyze-bpm', {
            method: 'POST',
            body: createAudioFormData(fileUri, fileName, 'audio.mp3'),
        });

        return payload;
    } catch {
        return { status: 'error', message: 'Server error' };
    }
};

export const saveTrafficData = async (
    songName: string,
    duration: number,
    markers: TrafficMarkerPayload[],
    userId?: string,
) => {
    try {
        const { payload } = await requestJson('/save-traffic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                song_name: songName,
                duration,
                markers,
                user_id: userId ?? null,
            }),
        });

        return payload;
    } catch {
        return { status: 'error', message: 'Could not reach the server.' };
    }
};

export const fetchTrafficAnalyses = async (userId?: string): Promise<TrafficAnalysisEntry[]> => {
    try {
        const querySuffix = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
        const { response, payload } = await requestJson(`/get-traffic${querySuffix}`, {
            method: 'GET',
        });

        if (!response.ok || !Array.isArray(payload)) {
            return [];
        }

        return payload.map(mapTrafficAnalysisEntry);
    } catch {
        return [];
    }
};

export const uploadAudioForAnalysis = async (
    fileUri: string,
    fileName: string,
): Promise<UploadAudioAcceptedResponse | ApiErrorResponse> => {
    try {
        const { response, payload } = await requestJson('/upload-audio', {
            method: 'POST',
            body: createAudioFormData(fileUri, fileName, 'song.mp3'),
        }, { warmup: true });

        if (!response.ok) {
            return buildApiError(response, payload, 'Could not start the background scan.');
        }

        return {
            status: 'accepted',
            taskId: getString(payload, 'task_id', ''),
            progressText: getString(payload, 'progress_text', 'Background scan started.'),
            message: getString(payload, 'message', 'Background scan started.'),
        };
    } catch {
        return { status: 'error', message: 'Could not connect to server.' };
    }
};

export const fetchAnalysisTaskStatus = async (taskId: string): Promise<AnalysisTaskStatusResponse> => {
    try {
        const { response, payload } = await requestJson(`/task-status/${encodeURIComponent(taskId)}`, {
            method: 'GET',
        });

        if (!response.ok) {
            return buildApiError(response, payload, 'Could not load scan status.');
        }

        if (payload.status === 'completed') {
            return {
                status: 'completed',
                taskId: getString(payload, 'task_id', taskId),
                progressText: getString(payload, 'progress_text', 'Analysis complete.'),
                updatedAt: getNullableString(payload, 'updated_at'),
                result: mapAnalysisResult((payload.result as ApiPayload) ?? {}, 'Analysis complete.'),
            };
        }

        if (payload.status === 'failed') {
            return {
                status: 'failed',
                taskId: getString(payload, 'task_id', taskId),
                progressText: getString(payload, 'progress_text', 'Analysis failed.'),
                updatedAt: getNullableString(payload, 'updated_at'),
                message: getString(payload, 'message', 'Analysis failed.'),
            };
        }

        return {
            status: 'processing',
            taskId: getString(payload, 'task_id', taskId),
            progressText: getString(payload, 'progress_text', 'Analysis is still running...'),
            updatedAt: getNullableString(payload, 'updated_at'),
        };
    } catch {
        return { status: 'error', message: 'Could not connect to server.' };
    }
};

export const analyzeSongFile = async (
    fileUri: string,
    fileName: string,
): Promise<LegacySongAnalysisResponse | ApiErrorResponse> => {
    try {
        const { response, payload } = await requestJson('/analyze-full', {
            method: 'POST',
            body: createAudioFormData(fileUri, fileName, 'song.mp3'),
        }, { warmup: true });

        if (!response.ok) {
            return buildApiError(response, payload, 'Analysis failed.');
        }

        const result = mapAnalysisResult(payload, 'Analysis complete.');
        return {
            status: 'success',
            ...result,
        };
    } catch {
        return { status: 'error', message: 'Could not connect to server.' };
    }
};

export const detectPitchFromClip = async (fileUri: string, fileName: string, instrument: string) => {
    try {
        const formData = createAudioFormData(fileUri, fileName, 'clip.m4a');
        formData.append('instrument', instrument);

        const { payload } = await requestJson('/detect-pitch', {
            method: 'POST',
            body: formData,
        });

        return payload;
    } catch {
        return { status: 'error', message: 'Could not connect to server.' };
    }
};

export const syncLeaderboardProfile = async (payload: LeaderboardProfilePayload) => {
    const { payload: responsePayload } = await requestJson('/sync-leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    return responsePayload;
};

export const fetchLeaderboard = async (limit = 8): Promise<LeaderboardEntry[]> => {
    try {
        const { response, payload } = await requestJson(`/leaderboard?limit=${limit}`, {
            method: 'GET',
        });

        if (!response.ok || !Array.isArray(payload.leaderboard)) {
            return [];
        }

        return payload.leaderboard.map(mapLeaderboardEntry);
    } catch {
        return [];
    }
};
