import { cleanUploadedSongDisplayName } from '../utils/songDisplayNames';

const FALLBACK_BASE_URL = 'http://localhost:8000';
const URL_PROTOCOL_PATTERN = /^https?:\/\//i;

function sanitizeBaseUrl(rawValue?: string) {
    if (!rawValue) {
        return FALLBACK_BASE_URL;
    }

    const trimmed = rawValue.trim();
    const markdownLinkMatch = trimmed.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/i);
    const directUrlMatch = trimmed.match(/https?:\/\/[^\s\])>]+/i);
    const candidate = (markdownLinkMatch?.[1] ?? directUrlMatch?.[0] ?? trimmed)
        .trim()
        .replace(/^['"<]+/, '')
        .replace(/[>'"]+$/, '');

    if (!URL_PROTOCOL_PATTERN.test(candidate)) {
        return FALLBACK_BASE_URL;
    }

    try {
        return new URL(candidate).toString().replace(/\/$/, '');
    } catch {
        return FALLBACK_BASE_URL;
    }
}

const BASE_URL = sanitizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
const WARMUP_WINDOW_MS = 45_000;

let lastWarmupAt = 0;
let pendingWarmup: Promise<void> | null = null;

type ApiPayload = Record<string, any>;

export interface ApiErrorResponse {
    status: 'error' | 'failed' | 'timed_out' | 'cancelled' | 'expired';
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
    completedLessonIds?: string[];
    completedSongIds?: string[];
    completedQuizIds?: string[];
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

export interface SongImportChordEventPayload {
    timeSec: number;
    chord: string;
    laneRow: number;
}

export interface SongImportTabNotePayload {
    timeSec: number;
    stringIndex: number;
    fret: number;
    durationSec?: number;
}

export interface SongImportManifestPayload {
    title: string;
    artist: string;
    instrument?: string;
    tuning?: {
        id: string;
        name: string;
        stringNotes: string[];
    };
    difficulty: 'Easy' | 'Medium' | 'Hard';
    bpm?: number;
    durationSec: number;
    chordEvents: SongImportChordEventPayload[];
    tabNotes: SongImportTabNotePayload[];
    aiDraft?: boolean;
    confidence?: SongImportConfidencePayload;
    warnings?: string[];
}

export interface SongImportConfidencePayload {
    overall: number;
    chords: number;
    tabs: number;
    sections: number;
}

export interface SongImportResultPayload {
    songId: string | null;
    audioUrl: string | null;
    bpm: number;
    beatGrid: number[];
    confidence: number;
    confidenceBreakdown: SongImportConfidencePayload;
    fallbackUsed: boolean;
    message: string;
    warnings: string[];
    songManifest: SongImportManifestPayload;
}

export interface SongAnalysisRequestOptions {
    instrument?: string;
    tuningId?: string;
    tuningName?: string;
    stringNotes?: string[];
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

export interface AnalyzeSongAudioAcceptedResponse {
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

export interface AnalysisTaskTimedOutResponse {
    status: 'timed_out';
    taskId: string;
    progressText: string;
    updatedAt: string | null;
    message: string;
}

export type AnalysisTaskStatusResponse =
    | AnalysisTaskProcessingResponse
    | AnalysisTaskCompletedResponse
    | AnalysisTaskFailedResponse
    | AnalysisTaskTimedOutResponse
    | ApiErrorResponse;

export interface SongImportTaskProcessingResponse {
    status: 'processing';
    taskId: string;
    progressText: string;
    updatedAt: string | null;
}

export interface SongImportTaskCompletedResponse {
    status: 'completed';
    taskId: string;
    progressText: string;
    updatedAt: string | null;
    result: SongImportResultPayload;
}

export interface SongImportTaskFailedResponse {
    status: 'failed';
    taskId: string;
    progressText: string;
    updatedAt: string | null;
    message: string;
}

export interface SongImportTaskTimedOutResponse {
    status: 'timed_out';
    taskId: string;
    progressText: string;
    updatedAt: string | null;
    message: string;
}

export type SongImportTaskStatusResponse =
    | SongImportTaskProcessingResponse
    | SongImportTaskCompletedResponse
    | SongImportTaskFailedResponse
    | SongImportTaskTimedOutResponse
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

function getErrorMessage(payload: ApiPayload, fallback: string) {
    const nestedError = payload.error;
    if (typeof nestedError === 'string') {
        return nestedError;
    }

    if (nestedError && typeof nestedError === 'object') {
        const typedError = nestedError as Record<string, unknown>;
        if (typeof typedError.message === 'string') {
            return typedError.message;
        }
    }

    return getString(payload, 'detail', getString(payload, 'message', fallback));
}

function normalizeTaskStatus(payload: ApiPayload) {
    const rawStatus = getString(payload, 'status', getString(payload, 'state', 'processing'));

    if (rawStatus === 'completed' || rawStatus === 'succeeded') {
        return 'completed';
    }

    if (rawStatus === 'pending' || rawStatus === 'queued' || rawStatus === 'processing' || rawStatus === 'running') {
        return 'processing';
    }

    if (rawStatus === 'timed_out' || rawStatus === 'expired') {
        return 'timed_out';
    }

    if (rawStatus === 'failed' || rawStatus === 'cancelled') {
        return 'failed';
    }

    return rawStatus;
}

function buildApiError(response: Response | null, payload: ApiPayload, fallback: string): ApiErrorResponse {
    return {
        status: 'error',
        message: getErrorMessage(payload, fallback),
        ...(response ? { statusCode: response.status } : {}),
    };
}

function createAudioFormData(
    fileUri: string,
    fileName: string,
    fallbackFileName: string,
    userId?: string,
) {
    const normalizedFileName = fileName && fileName.includes('.')
        ? fileName
        : fallbackFileName;
    const formData = new FormData();

    formData.append('file', {
        uri: fileUri,
        name: normalizedFileName,
        type: inferAudioMimeType(normalizedFileName, fileUri),
    } as any);

    if (userId) {
        formData.append('user_id', userId);
    }

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

function isValidAnalysisResult(payload: ApiPayload) {
    return typeof payload.bpm === 'number' && Array.isArray(payload.markers);
}

function mapSongImportManifest(payload: ApiPayload): SongImportManifestPayload {
    const difficulty = payload.difficulty === 'Easy' || payload.difficulty === 'Hard' || payload.difficulty === 'Medium'
        ? payload.difficulty
        : 'Medium';

    const chordEvents = Array.isArray(payload.chordEvents)
        ? payload.chordEvents
            .map((entry) => {
                if (!entry || typeof entry !== 'object') {
                    return null;
                }

                const next = entry as Record<string, unknown>;
                if (typeof next.timeSec !== 'number' || typeof next.chord !== 'string' || typeof next.laneRow !== 'number') {
                    return null;
                }

                return {
                    timeSec: next.timeSec,
                    chord: next.chord,
                    laneRow: next.laneRow,
                };
            })
            .filter((entry): entry is SongImportChordEventPayload => !!entry)
        : [];

    const tabNotes = Array.isArray(payload.tabNotes)
        ? payload.tabNotes
            .map((entry) => {
                if (!entry || typeof entry !== 'object') {
                    return null;
                }

                const next = entry as Record<string, unknown>;
                if (typeof next.timeSec !== 'number' || typeof next.stringIndex !== 'number' || typeof next.fret !== 'number') {
                    return null;
                }

                return {
                    timeSec: next.timeSec,
                    stringIndex: next.stringIndex,
                    fret: next.fret,
                    ...(typeof next.durationSec === 'number' ? { durationSec: next.durationSec } : {}),
                };
            })
            .filter((entry): entry is SongImportTabNotePayload => !!entry)
        : [];

    const tuningPayload = payload.tuning && typeof payload.tuning === 'object'
        ? payload.tuning as ApiPayload
        : null;
    const tuning = tuningPayload
        && typeof tuningPayload.id === 'string'
        && typeof tuningPayload.name === 'string'
        && Array.isArray(tuningPayload.stringNotes)
        ? {
            id: tuningPayload.id,
            name: tuningPayload.name,
            stringNotes: tuningPayload.stringNotes.filter((entry): entry is string => typeof entry === 'string'),
        }
        : undefined;
    const confidence = mapSongImportConfidence(payload.confidence);
    const warnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter((entry): entry is string => typeof entry === 'string')
        : [];

    return {
        title: cleanUploadedSongDisplayName(getString(payload, 'title', 'Imported Song')),
        artist: getString(payload, 'artist', 'AI Transcription'),
        ...(typeof payload.instrument === 'string' ? { instrument: payload.instrument } : {}),
        ...(tuning ? { tuning } : {}),
        difficulty,
        ...(typeof payload.bpm === 'number' && Number.isFinite(payload.bpm) && payload.bpm > 0 ? { bpm: payload.bpm } : {}),
        durationSec: typeof payload.durationSec === 'number' ? payload.durationSec : 0,
        chordEvents,
        tabNotes,
        ...(payload.aiDraft === true ? { aiDraft: true } : {}),
        ...(confidence ? { confidence } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
    };
}

function mapSongImportConfidence(value: unknown): SongImportConfidencePayload | null {
    if (typeof value === 'number') {
        const normalized = Math.max(0, Math.min(1, value));
        return {
            overall: normalized,
            chords: normalized,
            tabs: normalized,
            sections: normalized,
        };
    }

    if (!value || typeof value !== 'object') {
        return null;
    }

    const payload = value as ApiPayload;
    const score = (key: keyof SongImportConfidencePayload, fallback: number) => (
        typeof payload[key] === 'number'
            ? Math.max(0, Math.min(1, payload[key]))
            : fallback
    );
    const overall = score('overall', 0);

    return {
        overall,
        chords: score('chords', overall),
        tabs: score('tabs', overall),
        sections: score('sections', overall),
    };
}

function mapSongImportResult(payload: ApiPayload): SongImportResultPayload {
    const manifestPayload = payload.songManifest && typeof payload.songManifest === 'object'
        ? payload.songManifest as ApiPayload
        : {};
    const songManifest = mapSongImportManifest(manifestPayload);
    if (
        songManifest.bpm === undefined
        && typeof payload.bpm === 'number'
        && Number.isFinite(payload.bpm)
        && payload.bpm > 0
    ) {
        songManifest.bpm = payload.bpm;
    }

    const confidenceBreakdown = mapSongImportConfidence(payload.confidence) ?? {
        overall: 0,
        chords: 0,
        tabs: 0,
        sections: 0,
    };
    const warnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter((entry): entry is string => typeof entry === 'string')
        : [];

    return {
        songId: getNullableString(payload, 'songId'),
        audioUrl: getNullableString(payload, 'audioUrl'),
        bpm: typeof payload.bpm === 'number' ? payload.bpm : 0,
        beatGrid: Array.isArray(payload.beatGrid)
            ? payload.beatGrid.filter((entry): entry is number => typeof entry === 'number')
            : [],
        confidence: confidenceBreakdown.overall,
        confidenceBreakdown,
        fallbackUsed: payload.fallbackUsed === true,
        message: getString(payload, 'message', 'AI transcription complete.'),
        warnings,
        songManifest,
    };
}

function isValidSongImportResult(payload: ApiPayload) {
    const manifestPayload = payload.songManifest && typeof payload.songManifest === 'object'
        ? payload.songManifest as ApiPayload
        : null;

    return !!manifestPayload
        && typeof payload.bpm === 'number'
        && typeof manifestPayload.durationSec === 'number'
        && Array.isArray(manifestPayload.chordEvents)
        && Array.isArray(manifestPayload.tabNotes);
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
        const { response, payload } = await requestJson('/analyze-bpm', {
            method: 'POST',
            body: createAudioFormData(fileUri, fileName, 'audio.mp3'),
        });

        if (!response.ok) {
            return buildApiError(response, payload, 'Could not analyze BPM.');
        }

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
        const { response, payload } = await requestJson('/save-traffic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                song_name: songName,
                duration,
                markers,
                user_id: userId ?? null,
            }),
        });

        if (!response.ok) {
            return buildApiError(response, payload, 'Could not save the Studio analysis.');
        }

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
    userId?: string,
): Promise<UploadAudioAcceptedResponse | ApiErrorResponse> => {
    try {
        const { response, payload } = await requestJson('/upload-audio', {
            method: 'POST',
            body: createAudioFormData(fileUri, fileName, 'song.mp3', userId),
        }, { warmup: true });

        if (!response.ok) {
            return buildApiError(response, payload, 'Could not start the background scan.');
        }

        const taskId = getString(payload, 'task_id', getString(payload, 'jobId', ''));
        if (!taskId) {
            return {
                status: 'error',
                message: 'The analysis server accepted the upload but did not return a task ID.',
                statusCode: response.status,
            };
        }

        return {
            status: 'accepted',
            taskId,
            progressText: getString(payload, 'progress_text', 'Background scan started.'),
            message: getString(payload, 'message', 'Background scan started.'),
        };
    } catch {
        return {
            status: 'error',
            message: 'Could not connect to the analysis server. Check that the backend is running and reachable from this device.',
        };
    }
};

export const analyzeAudioForSongImport = async (
    fileUri: string,
    fileName: string,
    userId?: string,
    options?: SongAnalysisRequestOptions,
): Promise<AnalyzeSongAudioAcceptedResponse | ApiErrorResponse> => {
    try {
        const formData = createAudioFormData(fileUri, fileName, 'song.mp3', userId);
        if (options?.instrument) {
            formData.append('instrument', options.instrument);
        }
        if (options?.tuningId) {
            formData.append('tuning_id', options.tuningId);
        }
        if (options?.tuningName) {
            formData.append('tuning_name', options.tuningName);
        }
        if (options?.stringNotes && options.stringNotes.length > 0) {
            formData.append('string_notes', options.stringNotes.join(','));
        }

        const { response, payload } = await requestJson('/analyze-audio', {
            method: 'POST',
            body: formData,
        }, { warmup: true });

        if (!response.ok) {
            return buildApiError(response, payload, 'Could not start AI transcription.');
        }

        const taskId = getString(payload, 'task_id', getString(payload, 'jobId', ''));
        if (!taskId) {
            return {
                status: 'error',
                message: 'The analysis server accepted the upload but did not return a task ID.',
                statusCode: response.status,
            };
        }

        return {
            status: 'accepted',
            taskId,
            progressText: getString(payload, 'progress_text', 'AI transcription started.'),
            message: getString(payload, 'message', 'AI transcription started.'),
        };
    } catch {
        return {
            status: 'error',
            message: 'Could not connect to the analysis server. Check that the backend is running and reachable from this device.',
        };
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

        const normalizedStatus = normalizeTaskStatus(payload);

        if (normalizedStatus === 'completed') {
            const resultPayload = (payload.result as ApiPayload) ?? {};
            if (!isValidAnalysisResult(resultPayload)) {
                return {
                    status: 'failed',
                    taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
                    progressText: 'Analysis result unavailable.',
                    updatedAt: getNullableString(payload, 'updated_at'),
                    message: 'Analysis completed, but the result was unavailable. Please try again.',
                };
            }

            return {
                status: 'completed',
                taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
                progressText: getString(payload, 'progress_text', 'Analysis complete.'),
                updatedAt: getNullableString(payload, 'updated_at'),
                result: mapAnalysisResult(resultPayload, 'Analysis complete.'),
            };
        }

        if (normalizedStatus === 'failed') {
            return {
                status: 'failed',
                taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
                progressText: getString(payload, 'progress_text', 'Analysis failed.'),
                updatedAt: getNullableString(payload, 'updated_at'),
                message: getErrorMessage(payload, 'Analysis failed.'),
            };
        }

        if (normalizedStatus === 'timed_out') {
            return {
                status: 'timed_out',
                taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
                progressText: getString(payload, 'progress_text', 'Analysis timed out.'),
                updatedAt: getNullableString(payload, 'updated_at'),
                message: getErrorMessage(payload, 'Analysis timed out.'),
            };
        }

        return {
            status: 'processing',
            taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
            progressText: getString(payload, 'progress_text', 'Analysis is still running...'),
            updatedAt: getNullableString(payload, 'updated_at'),
        };
    } catch {
        return {
            status: 'error',
            message: 'Could not connect to the analysis server. Check that the backend is running and reachable from this device.',
        };
    }
};

export const fetchSongImportTaskStatus = async (taskId: string): Promise<SongImportTaskStatusResponse> => {
    try {
        const { response, payload } = await requestJson(`/task-status/${encodeURIComponent(taskId)}`, {
            method: 'GET',
        });

        if (!response.ok) {
            return buildApiError(response, payload, 'Could not load AI transcription status.');
        }

        const normalizedStatus = normalizeTaskStatus(payload);

        if (normalizedStatus === 'completed') {
            const resultPayload = (payload.result as ApiPayload) ?? {};
            if (!isValidSongImportResult(resultPayload)) {
                return {
                    status: 'failed',
                    taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
                    progressText: 'AI transcription result unavailable.',
                    updatedAt: getNullableString(payload, 'updated_at'),
                    message: 'AI transcription completed, but the song result was unavailable. Please try again.',
                };
            }

            return {
                status: 'completed',
                taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
                progressText: getString(payload, 'progress_text', 'AI transcription complete.'),
                updatedAt: getNullableString(payload, 'updated_at'),
                result: mapSongImportResult(resultPayload),
            };
        }

        if (normalizedStatus === 'failed') {
            return {
                status: 'failed',
                taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
                progressText: getString(payload, 'progress_text', 'AI transcription failed.'),
                updatedAt: getNullableString(payload, 'updated_at'),
                message: getErrorMessage(payload, 'AI transcription failed.'),
            };
        }

        if (normalizedStatus === 'timed_out') {
            return {
                status: 'timed_out',
                taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
                progressText: getString(payload, 'progress_text', 'AI transcription timed out.'),
                updatedAt: getNullableString(payload, 'updated_at'),
                message: getErrorMessage(payload, 'AI transcription timed out.'),
            };
        }

        return {
            status: 'processing',
            taskId: getString(payload, 'task_id', getString(payload, 'jobId', taskId)),
            progressText: getString(payload, 'progress_text', 'AI is still transcribing...'),
            updatedAt: getNullableString(payload, 'updated_at'),
        };
    } catch {
        return {
            status: 'error',
            message: 'Could not connect to the analysis server. Check that the backend is running and reachable from this device.',
        };
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
            completed_lesson_ids: payload.completedLessonIds ?? [],
            completed_song_ids: payload.completedSongIds ?? [],
            completed_quiz_ids: payload.completedQuizIds ?? [],
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
