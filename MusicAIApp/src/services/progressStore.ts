import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const PROGRESS_STORAGE_KEY = 'tuneup.progress.v1';
const LEGACY_DATABASE_DIR = `${FileSystem.documentDirectory}database`;
const LEGACY_PROGRESS_FILE = `${LEGACY_DATABASE_DIR}/progress.json`;

export interface ProgressSnapshot {
    xp: number;
    level: number;
    streakDays: number;
}

const DEFAULT_PROGRESS: ProgressSnapshot = {
    xp: 0,
    level: 1,
    streakDays: 0,
};

function sanitizeProgressSnapshot(snapshot: Partial<ProgressSnapshot> | null | undefined): ProgressSnapshot {
    const xp = typeof snapshot?.xp === 'number' && snapshot.xp >= 0 ? Math.floor(snapshot.xp) : DEFAULT_PROGRESS.xp;
    const streakDays = typeof snapshot?.streakDays === 'number' && snapshot.streakDays >= 0
        ? Math.floor(snapshot.streakDays)
        : DEFAULT_PROGRESS.streakDays;

    const computedLevel = Math.floor(xp / 100) + 1;
    const level = typeof snapshot?.level === 'number' && snapshot.level >= 1
        ? Math.max(Math.floor(snapshot.level), computedLevel)
        : computedLevel;

    return {
        xp,
        level,
        streakDays,
    };
}

async function readStoredProgress(): Promise<ProgressSnapshot | null> {
    try {
        const raw = await AsyncStorage.getItem(PROGRESS_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        return sanitizeProgressSnapshot(JSON.parse(raw) as Partial<ProgressSnapshot>);
    } catch {
        return null;
    }
}

async function writeStoredProgress(snapshot: ProgressSnapshot) {
    await AsyncStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(snapshot));
}

async function readLegacyProgress(): Promise<ProgressSnapshot | null> {
    try {
        const info = await FileSystem.getInfoAsync(LEGACY_PROGRESS_FILE);
        if (!info.exists) {
            return null;
        }

        const raw = await FileSystem.readAsStringAsync(LEGACY_PROGRESS_FILE);
        return sanitizeProgressSnapshot(JSON.parse(raw) as Partial<ProgressSnapshot>);
    } catch {
        return null;
    }
}

async function removeLegacyProgress() {
    try {
        const info = await FileSystem.getInfoAsync(LEGACY_PROGRESS_FILE);
        if (info.exists) {
            await FileSystem.deleteAsync(LEGACY_PROGRESS_FILE, { idempotent: true });
        }
    } catch {
        // Old fallback cleanup is best-effort only.
    }
}

async function migrateLegacyProgressIfNeeded(): Promise<ProgressSnapshot> {
    const stored = await readStoredProgress();
    if (stored) {
        return stored;
    }

    const legacy = await readLegacyProgress();
    if (legacy) {
        await writeStoredProgress(legacy);
        await removeLegacyProgress();
        return legacy;
    }

    await writeStoredProgress(DEFAULT_PROGRESS);
    return DEFAULT_PROGRESS;
}

export async function getProgressSnapshot(): Promise<ProgressSnapshot> {
    return migrateLegacyProgressIfNeeded();
}

export async function addXp(amount: number): Promise<ProgressSnapshot> {
    const current = await migrateLegacyProgressIfNeeded();
    if (amount <= 0) {
        return current;
    }

    const next = sanitizeProgressSnapshot({
        ...current,
        xp: current.xp + amount,
    });
    await writeStoredProgress(next);
    return next;
}

export async function setStreakDays(streakDays: number): Promise<ProgressSnapshot> {
    const current = await migrateLegacyProgressIfNeeded();
    const next = sanitizeProgressSnapshot({
        ...current,
        streakDays,
    });
    await writeStoredProgress(next);
    return next;
}
