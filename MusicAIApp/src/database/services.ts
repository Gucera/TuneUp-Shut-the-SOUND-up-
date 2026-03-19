import * as FileSystem from 'expo-file-system/legacy';
import { database } from './index';
import { Progress, Song } from './model';

const DATABASE_DIR = `${FileSystem.documentDirectory}database`;
const PROGRESS_FILE = `${DATABASE_DIR}/progress.json`;

// Add a random test song to the database
export const addRandomSong = async () => {
    const activeDatabase = database;

    if (!activeDatabase) {
        return;
    }

    await activeDatabase.write(async () => {
        await activeDatabase.get<Song>('songs').create(song => {
            song.title = "Test Song " + Math.floor(Math.random() * 100);
            song.artist = "AI";
            song.duration = 180;
            song.isAnalyzed = false;
            song.createdAt = new Date();
        });
    });
};

// Watch all songs — updates the UI automatically when data changes
export const observeSongs = () => {
    const activeDatabase = database;

    if (!activeDatabase) {
        return null;
    }

    return activeDatabase.get<Song>('songs').query().observe();
};

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

async function ensureDatabaseDir() {
    const info = await FileSystem.getInfoAsync(DATABASE_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(DATABASE_DIR, { intermediates: true });
    }
}

async function readFallbackProgress(): Promise<ProgressSnapshot> {
    await ensureDatabaseDir();
    const info = await FileSystem.getInfoAsync(PROGRESS_FILE);

    if (!info.exists) {
        await FileSystem.writeAsStringAsync(PROGRESS_FILE, JSON.stringify(DEFAULT_PROGRESS, null, 2));
        return DEFAULT_PROGRESS;
    }

    try {
        const raw = await FileSystem.readAsStringAsync(PROGRESS_FILE);
        const parsed = JSON.parse(raw) as Partial<ProgressSnapshot>;
        return {
            xp: typeof parsed.xp === 'number' ? parsed.xp : DEFAULT_PROGRESS.xp,
            level: typeof parsed.level === 'number' ? parsed.level : DEFAULT_PROGRESS.level,
            streakDays: typeof parsed.streakDays === 'number' ? parsed.streakDays : DEFAULT_PROGRESS.streakDays,
        };
    } catch (error) {
        await FileSystem.writeAsStringAsync(PROGRESS_FILE, JSON.stringify(DEFAULT_PROGRESS, null, 2));
        return DEFAULT_PROGRESS;
    }
}

async function writeFallbackProgress(snapshot: ProgressSnapshot) {
    await ensureDatabaseDir();
    await FileSystem.writeAsStringAsync(PROGRESS_FILE, JSON.stringify(snapshot, null, 2));
}

// Get or create the progress record (there's only one)
const getOrCreateProgress = async (): Promise<Progress> => {
    if (!database) {
        throw new Error('WatermelonDB is not available.');
    }

    const collection = database.get<Progress>('progress');
    const existing = await collection.query().fetch();

    if (existing.length > 0) {
        return existing[0];
    }

    return collection.create((progress) => {
        progress.xp = DEFAULT_PROGRESS.xp;
        progress.level = DEFAULT_PROGRESS.level;
        progress.streakDays = DEFAULT_PROGRESS.streakDays;
    });
};

// Get the current XP, level, and streak
export const getProgressSnapshot = async (): Promise<ProgressSnapshot> => {
    if (!database) {
        return await readFallbackProgress();
    }

    try {
        const progress = await database.write(async () => getOrCreateProgress());
        return {
            xp: progress.xp,
            level: progress.level,
            streakDays: progress.streakDays,
        };
    } catch (error) {
        return await readFallbackProgress();
    }
};

// Add XP and auto-level up (every 100 XP = 1 level)
export const addXp = async (amount: number): Promise<ProgressSnapshot> => {
    if (amount <= 0) {
        return getProgressSnapshot();
    }

    if (!database) {
        const current = await readFallbackProgress();
        const next = {
            ...current,
            xp: current.xp + amount,
            level: Math.floor((current.xp + amount) / 100) + 1,
        };
        await writeFallbackProgress(next);
        return next;
    }

    try {
        const updated = await database.write(async () => {
            const progress = await getOrCreateProgress();
            await progress.update((record) => {
                record.xp += amount;
                record.level = Math.floor(record.xp / 100) + 1;
            });
            return progress;
        });

        return {
            xp: updated.xp,
            level: updated.level,
            streakDays: updated.streakDays,
        };
    } catch (error) {
        const current = await readFallbackProgress();
        const next = {
            ...current,
            xp: current.xp + amount,
            level: Math.floor((current.xp + amount) / 100) + 1,
        };
        await writeFallbackProgress(next);
        return next;
    }
};

export const setStreakDays = async (streakDays: number): Promise<ProgressSnapshot> => {
    const safeStreakDays = Math.max(0, streakDays);

    if (!database) {
        const current = await readFallbackProgress();
        const next = {
            ...current,
            streakDays: safeStreakDays,
        };
        await writeFallbackProgress(next);
        return next;
    }

    try {
        const updated = await database.write(async () => {
            const progress = await getOrCreateProgress();
            await progress.update((record) => {
                record.streakDays = safeStreakDays;
            });
            return progress;
        });

        return {
            xp: updated.xp,
            level: updated.level,
            streakDays: updated.streakDays,
        };
    } catch (error) {
        const current = await readFallbackProgress();
        const next = {
            ...current,
            streakDays: safeStreakDays,
        };
        await writeFallbackProgress(next);
        return next;
    }
};
