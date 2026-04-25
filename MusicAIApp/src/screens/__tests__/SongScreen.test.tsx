import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import SongScreen from '../SongScreen';

let consoleErrorSpy: jest.SpyInstance;

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: (callback: () => void | (() => void)) => {
        const React = require('react');
        React.useEffect(() => callback(), [callback]);
    },
    useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn(), getParent: jest.fn(() => ({ navigate: jest.fn() })) }),
    useIsFocused: () => true,
}));

jest.mock('../../hooks/useTuner', () => ({
    buildTabTarget: jest.fn((stringIndex: number, fret: number) => ({ midi: 40 + stringIndex + fret, noteName: 'E2', frequency: 82.41 })),
    isPitchMatchForTarget: jest.fn(() => false),
    TUNER_A4_HZ: 440,
    TUNER_NATIVE_MODULE_MESSAGE: 'Native build required',
    useTuner: () => ({
        status: 'idle',
        error: null,
        isNativeModuleAvailable: true,
        canAskPermissionAgain: true,
        isListening: false,
        hasSignal: false,
        frequency: null,
        midi: null,
        noteName: '--',
        noteClass: '--',
        confidence: 0,
        volume: -120,
        cents: 0,
        target: null,
        targetNoteName: '--',
        targetFrequency: null,
        targetCents: 0,
        isInTune: false,
        displayStatus: 'Idle',
        diagnostics: { gateState: 'buffering', analysisDurationMs: null, stableMidi: null },
        needleCents: { value: 0 },
        confidenceValue: { value: 0 },
        stabilityValue: { value: 0 },
        needleRotation: { value: 0 },
        inTuneValue: { value: 0 },
        start: jest.fn(),
        stop: jest.fn(),
    }),
}));

jest.mock('../../services/appSettings', () => ({
    getAppSettings: jest.fn(() => Promise.resolve({
        songsDefaultToTabs: false,
        songsSeekJumpSeconds: 10,
        songsShowStreakBanner: true,
        songsBackendPitchAssist: true,
        hapticsEnabled: false,
    })),
}));

jest.mock('../../services/gamification', () => ({
    getGamificationSnapshot: jest.fn(() => Promise.resolve({
        userId: 'user-1',
        displayName: 'Player',
        streakDays: 2,
        longestStreak: 4,
        didPracticeToday: true,
        streakMessage: 'Keep going',
        completedLessonIds: [],
        completedSongIds: [],
        completedQuizIds: [],
        unlockedBadgeIds: [],
        xp: 100,
        level: 2,
    })),
    rewardPracticeActivity: jest.fn(() => Promise.resolve({ progress: { xp: 100, level: 2, streakDays: 2 }, snapshot: null, newBadges: [] })),
}));

jest.mock('../../services/songLibrary', () => ({
    importSongFromGeneratedManifest: jest.fn(),
    loadImportedSongs: jest.fn(() => Promise.resolve([])),
}));

describe('SongScreen', () => {
    beforeAll(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });

    it('renders the song flow shell', async () => {
        render(<SongScreen />);
        await waitFor(() => expect(screen.getByText('Song Flow')).toBeTruthy());
        expect(screen.getAllByText('Chords').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Tabs').length).toBeGreaterThan(0);
    });
});
