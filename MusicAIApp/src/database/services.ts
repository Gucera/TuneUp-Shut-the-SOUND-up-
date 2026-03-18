import { database } from './index';
import { Progress, Song } from './model';

// Add a random test song to the database
export const addRandomSong = async () => {
    await database.write(async () => {
        await database.get<Song>('songs').create(song => {
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
    return database.get<Song>('songs').query().observe();
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

// Get or create the progress record (there's only one)
const getOrCreateProgress = async (): Promise<Progress> => {
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
    const progress = await database.write(async () => getOrCreateProgress());
    return {
        xp: progress.xp,
        level: progress.level,
        streakDays: progress.streakDays,
    };
};

// Add XP and auto-level up (every 100 XP = 1 level)
export const addXp = async (amount: number): Promise<ProgressSnapshot> => {
    if (amount <= 0) {
        return getProgressSnapshot();
    }

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
};

export const setStreakDays = async (streakDays: number): Promise<ProgressSnapshot> => {
    const updated = await database.write(async () => {
        const progress = await getOrCreateProgress();
        await progress.update((record) => {
            record.streakDays = Math.max(0, streakDays);
        });
        return progress;
    });

    return {
        xp: updated.xp,
        level: updated.level,
        streakDays: updated.streakDays,
    };
};
