import * as FileSystem from 'expo-file-system/legacy';

export interface AppSettings {
    hapticsEnabled: boolean;
    showLessonAnimations: boolean;
    theoryShowGamificationDeck: boolean;
    theoryShowQuizExplanation: boolean;
    leaderboardSyncEnabled: boolean;
    practicePreferBackendPitchAssist: boolean;
    practiceShowFrequencyReadout: boolean;
    practiceShowStringHelper: boolean;
    studioShowPresetNotes: boolean;
    studioShowFocusNotes: boolean;
    studioShowQuickMarkers: boolean;
    songsPreferTabsDefault: boolean;
    songsSeekStepSeconds: number;
    songsShowStreakBanner: boolean;
    songsPreferBackendPitchAssist: boolean;
    profileShowLeaderboard: boolean;
    profileShowBadgeShelf: boolean;
    practiceGoalMinutes: number;
}

const SETTINGS_DIR = `${FileSystem.documentDirectory}settings`;
const SETTINGS_FILE = `${SETTINGS_DIR}/app-settings.json`;

const DEFAULT_SETTINGS: AppSettings = {
    hapticsEnabled: true,
    showLessonAnimations: true,
    theoryShowGamificationDeck: true,
    theoryShowQuizExplanation: true,
    leaderboardSyncEnabled: true,
    practicePreferBackendPitchAssist: true,
    practiceShowFrequencyReadout: true,
    practiceShowStringHelper: true,
    studioShowPresetNotes: true,
    studioShowFocusNotes: true,
    studioShowQuickMarkers: true,
    songsPreferTabsDefault: false,
    songsSeekStepSeconds: 10,
    songsShowStreakBanner: true,
    songsPreferBackendPitchAssist: true,
    profileShowLeaderboard: true,
    profileShowBadgeShelf: true,
    practiceGoalMinutes: 20,
};

async function ensureSettingsDir() {
    const info = await FileSystem.getInfoAsync(SETTINGS_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(SETTINGS_DIR, { intermediates: true });
    }
}

export async function getAppSettings(): Promise<AppSettings> {
    await ensureSettingsDir();
    const info = await FileSystem.getInfoAsync(SETTINGS_FILE);

    if (!info.exists) {
        await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
        return DEFAULT_SETTINGS;
    }

    try {
        const raw = await FileSystem.readAsStringAsync(SETTINGS_FILE);
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        const legacyParsed = parsed as Partial<AppSettings> & { preferBackendPitchAssist?: boolean };
        return {
            hapticsEnabled: parsed.hapticsEnabled ?? DEFAULT_SETTINGS.hapticsEnabled,
            showLessonAnimations: parsed.showLessonAnimations ?? DEFAULT_SETTINGS.showLessonAnimations,
            theoryShowGamificationDeck: parsed.theoryShowGamificationDeck ?? DEFAULT_SETTINGS.theoryShowGamificationDeck,
            theoryShowQuizExplanation: parsed.theoryShowQuizExplanation ?? DEFAULT_SETTINGS.theoryShowQuizExplanation,
            leaderboardSyncEnabled: parsed.leaderboardSyncEnabled ?? DEFAULT_SETTINGS.leaderboardSyncEnabled,
            practicePreferBackendPitchAssist:
                parsed.practicePreferBackendPitchAssist
                ?? legacyParsed.preferBackendPitchAssist
                ?? DEFAULT_SETTINGS.practicePreferBackendPitchAssist,
            practiceShowFrequencyReadout: parsed.practiceShowFrequencyReadout ?? DEFAULT_SETTINGS.practiceShowFrequencyReadout,
            practiceShowStringHelper: parsed.practiceShowStringHelper ?? DEFAULT_SETTINGS.practiceShowStringHelper,
            studioShowPresetNotes: parsed.studioShowPresetNotes ?? DEFAULT_SETTINGS.studioShowPresetNotes,
            studioShowFocusNotes: parsed.studioShowFocusNotes ?? DEFAULT_SETTINGS.studioShowFocusNotes,
            studioShowQuickMarkers: parsed.studioShowQuickMarkers ?? DEFAULT_SETTINGS.studioShowQuickMarkers,
            songsPreferTabsDefault: parsed.songsPreferTabsDefault ?? DEFAULT_SETTINGS.songsPreferTabsDefault,
            songsSeekStepSeconds: typeof parsed.songsSeekStepSeconds === 'number'
                ? parsed.songsSeekStepSeconds
                : DEFAULT_SETTINGS.songsSeekStepSeconds,
            songsShowStreakBanner: parsed.songsShowStreakBanner ?? DEFAULT_SETTINGS.songsShowStreakBanner,
            songsPreferBackendPitchAssist:
                parsed.songsPreferBackendPitchAssist
                ?? legacyParsed.preferBackendPitchAssist
                ?? DEFAULT_SETTINGS.songsPreferBackendPitchAssist,
            profileShowLeaderboard: parsed.profileShowLeaderboard ?? DEFAULT_SETTINGS.profileShowLeaderboard,
            profileShowBadgeShelf: parsed.profileShowBadgeShelf ?? DEFAULT_SETTINGS.profileShowBadgeShelf,
            practiceGoalMinutes: typeof parsed.practiceGoalMinutes === 'number'
                ? parsed.practiceGoalMinutes
                : DEFAULT_SETTINGS.practiceGoalMinutes,
        };
    } catch (error) {
        await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
        return DEFAULT_SETTINGS;
    }
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await getAppSettings();
    const next = { ...current, ...patch };
    await ensureSettingsDir();
    await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(next, null, 2));
    return next;
}
