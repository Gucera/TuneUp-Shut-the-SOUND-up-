import * as FileSystem from 'expo-file-system/legacy';
import { LESSON_PACK_COUNTS, LessonInstrument } from '../data/lessonLibrary';
import { addXp, getProgressSnapshot, ProgressSnapshot, setStreakDays } from '../database/services';
import { getAppSettings } from './appSettings';
import { fetchLeaderboard, LeaderboardEntry, syncLeaderboardProfile } from './api';
import { getAuthenticatedIdentity, supabase } from './supabaseClient';

export type BadgeId =
    | 'first_song'
    | 'drum_master'
    | 'lesson_starter'
    | 'theory_starter'
    | 'streak_three';

export interface BadgeDefinition {
    id: BadgeId;
    title: string;
    description: string;
    howToEarn: string;
}

export interface GamificationSnapshot {
    userId: string;
    displayName: string;
    streakDays: number;
    longestStreak: number;
    didPracticeToday: boolean;
    streakMessage: string;
    completedLessonIds: string[];
    completedSongIds: string[];
    completedQuizIds: string[];
    unlockedBadgeIds: BadgeId[];
    xp: number;
    level: number;
}

export type PracticeActivity =
    | { kind: 'lesson'; id: string; instrument: LessonInstrument }
    | { kind: 'song'; id: string }
    | { kind: 'quiz' | 'puzzle' | 'audio-quiz' | 'quick-note'; id: string };

interface StoredGamificationState {
    userId: string;
    displayName: string;
    lastActivityDate: string | null;
    streakDays: number;
    longestStreak: number;
    completedLessonIds: string[];
    completedSongIds: string[];
    completedQuizIds: string[];
    unlockedBadgeIds: BadgeId[];
}

export interface RewardResult {
    progress: ProgressSnapshot;
    snapshot: GamificationSnapshot;
    newBadges: BadgeDefinition[];
}

const GAME_DIR = `${FileSystem.documentDirectory}gamification`;
const GAME_FILE_LEGACY = `${GAME_DIR}/state.json`;

type AuthIdentity = Awaited<ReturnType<typeof getAuthenticatedIdentity>>;

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
    {
        id: 'first_song',
        title: 'First Song',
        description: 'Finish your first song session in the Songs tab.',
        howToEarn: 'Complete any song run in the Songs tab. Imported songs count too.',
    },
    {
        id: 'drum_master',
        title: 'Drum Master',
        description: 'Complete all 10 drum lessons from the lesson pack.',
        howToEarn: 'Finish every lesson with a `drm-` lesson ID from the drum lesson pack.',
    },
    {
        id: 'lesson_starter',
        title: 'Lesson Starter',
        description: 'Mark your first premium lesson as completed.',
        howToEarn: 'Open any lesson pack and use the complete lesson action once.',
    },
    {
        id: 'theory_starter',
        title: 'Theory Starter',
        description: 'Answer 10 theory, ear, quick-note, or puzzle challenges correctly.',
        howToEarn: 'Get to 10 completed quiz, puzzle, quick-note, or audio quiz wins in total.',
    },
    {
        id: 'streak_three',
        title: '3-Day Streak',
        description: 'Practice on three different days in a row.',
        howToEarn: 'Do one tracked activity on three consecutive days without missing a day.',
    },
];

function buildTodayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDayKey(dayKey: string) {
    const [year, month, day] = dayKey.split('-').map((part) => Number(part));
    return new Date(year, month - 1, day);
}

function dayDiff(fromKey: string, toKey: string) {
    const fromDate = parseDayKey(fromKey);
    const toDate = parseDayKey(toKey);
    return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function uniquePush(items: string[], value: string) {
    if (items.includes(value)) {
        return items;
    }
    return [...items, value];
}

function getBadgeById(id: BadgeId) {
    return BADGE_DEFINITIONS.find((badge) => badge.id === id);
}

function createDefaultState(identity: AuthIdentity = null): StoredGamificationState {
    const seed = Math.floor(1000 + (Math.random() * 9000));
    return {
        userId: identity?.userId ?? `player-${Date.now()}-${seed}`,
        displayName: identity?.displayName ?? `Player ${seed}`,
        lastActivityDate: null,
        streakDays: 0,
        longestStreak: 0,
        completedLessonIds: [],
        completedSongIds: [],
        completedQuizIds: [],
        unlockedBadgeIds: [],
    };
}

async function ensureStorageDir() {
    const info = await FileSystem.getInfoAsync(GAME_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(GAME_DIR, { intermediates: true });
    }
}

function sanitizeStorageKey(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getStateFilePath(identity: AuthIdentity) {
    const storageKey = identity?.userId ? sanitizeStorageKey(identity.userId) : 'guest';
    return `${GAME_DIR}/state-${storageKey}.json`;
}

function isPlaceholderDisplayName(displayName: string) {
    const trimmed = displayName.trim();
    return trimmed.length === 0 || /^Player \d{4}$/.test(trimmed);
}

function normalizeStoredState(
    parsed: Partial<StoredGamificationState>,
    fallback: StoredGamificationState,
): StoredGamificationState {
    return {
        userId: parsed.userId || fallback.userId,
        displayName: parsed.displayName || fallback.displayName,
        lastActivityDate: parsed.lastActivityDate || null,
        streakDays: typeof parsed.streakDays === 'number' ? parsed.streakDays : 0,
        longestStreak: typeof parsed.longestStreak === 'number' ? parsed.longestStreak : 0,
        completedLessonIds: Array.isArray(parsed.completedLessonIds) ? parsed.completedLessonIds : [],
        completedSongIds: Array.isArray(parsed.completedSongIds) ? parsed.completedSongIds : [],
        completedQuizIds: Array.isArray(parsed.completedQuizIds) ? parsed.completedQuizIds : [],
        unlockedBadgeIds: Array.isArray(parsed.unlockedBadgeIds) ? parsed.unlockedBadgeIds as BadgeId[] : [],
    };
}

function applyAuthenticatedIdentity(state: StoredGamificationState, identity: AuthIdentity) {
    if (!identity) {
        return state;
    }

    const shouldReplaceDisplayName = state.userId !== identity.userId || isPlaceholderDisplayName(state.displayName);

    return {
        ...state,
        userId: identity.userId,
        displayName: shouldReplaceDisplayName ? identity.displayName : state.displayName,
    };
}

async function writeStoredState(state: StoredGamificationState, targetFilePath?: string) {
    await ensureStorageDir();
    const identity = await getAuthenticatedIdentity();
    const nextTargetFilePath = targetFilePath ?? getStateFilePath(identity);
    await FileSystem.writeAsStringAsync(nextTargetFilePath, JSON.stringify(state, null, 2));
}

async function ensureInitialStateFile(filePath: string, identity: AuthIdentity) {
    const currentInfo = await FileSystem.getInfoAsync(filePath);
    if (currentInfo.exists) {
        return;
    }

    const fallback = createDefaultState(identity);
    const legacyInfo = await FileSystem.getInfoAsync(GAME_FILE_LEGACY);

    if (!legacyInfo.exists) {
        await writeStoredState(fallback, filePath);
        return;
    }

    try {
        const raw = await FileSystem.readAsStringAsync(GAME_FILE_LEGACY);
        const parsed = JSON.parse(raw) as Partial<StoredGamificationState>;
        const migratedState = applyAuthenticatedIdentity(normalizeStoredState(parsed, fallback), identity);
        await writeStoredState(migratedState, filePath);
    } catch {
        await writeStoredState(fallback, filePath);
    }
}

async function readStoredState(): Promise<StoredGamificationState> {
    await ensureStorageDir();
    const identity = await getAuthenticatedIdentity();
    const filePath = getStateFilePath(identity);

    await ensureInitialStateFile(filePath, identity);

    try {
        const raw = await FileSystem.readAsStringAsync(filePath);
        const parsed = JSON.parse(raw) as Partial<StoredGamificationState>;
        const fallback = createDefaultState(identity);
        const normalized = normalizeStoredState(parsed, fallback);
        const hydratedState = applyAuthenticatedIdentity(normalized, identity);

        if (
            hydratedState.userId !== normalized.userId
            || hydratedState.displayName !== normalized.displayName
        ) {
            await writeStoredState(hydratedState, filePath);
        }

        return hydratedState;
    } catch {
        const fresh = createDefaultState(identity);
        await writeStoredState(fresh, filePath);
        return fresh;
    }
}

function getStreakMessage(streakDays: number, didPracticeToday: boolean) {
    if (streakDays <= 0) {
        return 'Start your streak today with one focused session.';
    }

    if (didPracticeToday) {
        if (streakDays === 1) {
            return 'You practiced today. Come back tomorrow and keep it alive.';
        }
        return `${streakDays} days in a row. Do not break it now.`;
    }

    return `You are on a ${streakDays}-day streak. Show up today to protect it.`;
}

function toSnapshot(state: StoredGamificationState, progress: ProgressSnapshot): GamificationSnapshot {
    const todayKey = buildTodayKey();
    const didPracticeToday = state.lastActivityDate === todayKey;

    return {
        userId: state.userId,
        displayName: state.displayName,
        streakDays: state.streakDays,
        longestStreak: state.longestStreak,
        didPracticeToday,
        streakMessage: getStreakMessage(state.streakDays, didPracticeToday),
        completedLessonIds: state.completedLessonIds,
        completedSongIds: state.completedSongIds,
        completedQuizIds: state.completedQuizIds,
        unlockedBadgeIds: state.unlockedBadgeIds,
        xp: progress.xp,
        level: progress.level,
    };
}

function evaluateBadges(state: StoredGamificationState) {
    const nextBadgeIds: BadgeId[] = [...state.unlockedBadgeIds];
    const newBadgeIds: BadgeId[] = [];

    const unlock = (badgeId: BadgeId) => {
        if (!nextBadgeIds.includes(badgeId)) {
            nextBadgeIds.push(badgeId);
            newBadgeIds.push(badgeId);
        }
    };

    if (state.completedSongIds.length >= 1) {
        unlock('first_song');
    }

    if (state.completedLessonIds.length >= 1) {
        unlock('lesson_starter');
    }

    if (state.completedQuizIds.length >= 10) {
        unlock('theory_starter');
    }

    if (state.streakDays >= 3) {
        unlock('streak_three');
    }

    const drumLessonsCompleted = state.completedLessonIds.filter((lessonId) => lessonId.startsWith('drm-')).length;
    if (drumLessonsCompleted >= LESSON_PACK_COUNTS.Drums) {
        unlock('drum_master');
    }

    state.unlockedBadgeIds = nextBadgeIds;

    return newBadgeIds
        .map(getBadgeById)
        .filter((badge): badge is BadgeDefinition => !!badge);
}

async function syncStateToBackend(state: StoredGamificationState, progress: ProgressSnapshot) {
    try {
        const settings = await getAppSettings();
        if (!settings.leaderboardSyncEnabled) {
            return;
        }

        await syncLeaderboardProfile({
            userId: state.userId,
            displayName: state.displayName,
            xp: progress.xp,
            level: progress.level,
            streakDays: state.streakDays,
            longestStreak: state.longestStreak,
            badges: state.unlockedBadgeIds,
            completedLessons: state.completedLessonIds.length,
            completedSongs: state.completedSongIds.length,
            completedQuizzes: state.completedQuizIds.length,
        });
    } catch (error) {
        // Leaderboard sync is best-effort so practice flow never gets blocked.
    }
}

export async function getGamificationSnapshot(): Promise<GamificationSnapshot> {
    const [state, progress] = await Promise.all([readStoredState(), getProgressSnapshot()]);

    if (progress.streakDays !== state.streakDays) {
        await setStreakDays(state.streakDays);
    }

    return toSnapshot(state, progress);
}

export async function syncGamificationProfile() {
    const [state, progress] = await Promise.all([readStoredState(), getProgressSnapshot()]);
    await syncStateToBackend(state, progress);
}

export async function updateDisplayName(displayName: string): Promise<GamificationSnapshot> {
    const trimmed = displayName.trim();
    const [state, progress] = await Promise.all([readStoredState(), getProgressSnapshot()]);

    state.displayName = trimmed.length > 0 ? trimmed : state.displayName;
    await writeStoredState(state);

    const identity = await getAuthenticatedIdentity();
    if (identity) {
        const { error } = await supabase.auth.updateUser({
            data: { display_name: state.displayName },
        });

        if (error) {
            console.error('Could not update Supabase user metadata:', error.message);
        }
    }

    await syncStateToBackend(state, progress);

    return toSnapshot(state, progress);
}

export async function rewardPracticeActivity(
    amount: number,
    activity: PracticeActivity,
): Promise<RewardResult> {
    const progress = amount > 0
        ? await addXp(amount)
        : await getProgressSnapshot();

    const state = await readStoredState();
    const todayKey = buildTodayKey();

    if (!state.lastActivityDate) {
        state.streakDays = 1;
        state.longestStreak = Math.max(state.longestStreak, 1);
        state.lastActivityDate = todayKey;
    } else if (state.lastActivityDate !== todayKey) {
        const gap = dayDiff(state.lastActivityDate, todayKey);
        state.streakDays = gap === 1 ? state.streakDays + 1 : 1;
        state.longestStreak = Math.max(state.longestStreak, state.streakDays);
        state.lastActivityDate = todayKey;
    }

    if (activity.kind === 'lesson') {
        state.completedLessonIds = uniquePush(state.completedLessonIds, activity.id);
    } else if (activity.kind === 'song') {
        state.completedSongIds = uniquePush(state.completedSongIds, activity.id);
    } else {
        state.completedQuizIds = uniquePush(state.completedQuizIds, activity.id);
    }

    const newBadges = evaluateBadges(state);
    await writeStoredState(state);
    await setStreakDays(state.streakDays);
    await syncStateToBackend(state, progress);

    return {
        progress,
        snapshot: toSnapshot(state, progress),
        newBadges,
    };
}

export async function getLeaderboard(limit = 8): Promise<LeaderboardEntry[]> {
    try {
        const settings = await getAppSettings();
        if (!settings.leaderboardSyncEnabled) {
            return [];
        }

        return await fetchLeaderboard(limit);
    } catch (error) {
        return [];
    }
}
