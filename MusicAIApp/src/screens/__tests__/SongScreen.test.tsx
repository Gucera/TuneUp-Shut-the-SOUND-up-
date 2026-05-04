import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
    buildMidiTarget: jest.fn((midi: number) => ({ midi, noteName: 'E2', frequency: 82.41 })),
    buildTabTarget: jest.fn((stringIndex: number, fret: number) => ({ midi: 40 + stringIndex + fret, noteName: 'E2', frequency: 82.41 })),
    isPitchMatchForTarget: jest.fn(() => false),
    TUNER_A4_HZ: 440,
    TUNER_NATIVE_MODULE_MESSAGE: 'Native build required',
    useTuner: () => ({
        status: 'idle',
        error: null,
        microphonePermissionStatus: 'granted',
        microphonePermissionMessage: null,
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
        checkMicrophonePermission: jest.fn(),
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
    deleteImportedSong: jest.fn(() => Promise.resolve(true)),
    importSongFromFiles: jest.fn(),
    importSongFromGeneratedManifest: jest.fn(),
    loadImportedSongs: jest.fn(() => Promise.resolve([])),
    updateSavedSongFavorite: jest.fn(),
    updateSavedSongMetadata: jest.fn(),
}));

const mockedSongLibrary = jest.requireMock('../../services/songLibrary') as {
    loadImportedSongs: jest.Mock;
    updateSavedSongFavorite: jest.Mock;
    updateSavedSongMetadata: jest.Mock;
};

describe('SongScreen', () => {
    beforeEach(() => {
        mockedSongLibrary.loadImportedSongs.mockReset();
        mockedSongLibrary.loadImportedSongs.mockResolvedValue([]);
        mockedSongLibrary.updateSavedSongFavorite.mockReset();
        mockedSongLibrary.updateSavedSongMetadata.mockReset();
    });

    beforeAll(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });

    it('renders Upload and Library sections with Library as the clean default', async () => {
        render(<SongScreen />);
        await waitFor(() => expect(screen.getAllByText('Songs').length).toBeGreaterThan(0));
        expect(screen.getByText('Upload')).toBeTruthy();
        expect(screen.getByText('Library')).toBeTruthy();
        expect(screen.getByPlaceholderText('Search songs or artists')).toBeTruthy();
        expect(screen.queryByText('Upload Song')).toBeNull();
        expect(screen.getAllByText('Chords').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Tabs').length).toBeGreaterThan(0);
        expect(screen.queryByText('Edit')).toBeNull();
        expect(screen.queryByText('Delete')).toBeNull();
    });

    it('shows upload actions only in the Upload section', async () => {
        render(<SongScreen />);
        await waitFor(() => expect(screen.getByText('Upload')).toBeTruthy());

        fireEvent.press(screen.getByText('Upload'));

        expect(screen.getByText('Create a practice chart')).toBeTruthy();
        expect(screen.getByText('Upload Song')).toBeTruthy();
        expect(screen.getByText('Import Manifest')).toBeTruthy();
        expect(screen.getByText('Demo Song')).toBeTruthy();
        expect(screen.queryByPlaceholderText('Search songs or artists')).toBeNull();
    });

    it('hides edit/delete on cards until local song actions are opened', async () => {
        mockedSongLibrary.loadImportedSongs.mockResolvedValue([
            {
                id: 'local-song',
                title: 'Local Song',
                artist: 'Player',
                difficulty: 'Medium',
                backingTrack: { uri: 'file:///local-song.mp3' },
                bpm: 118,
                durationSec: 24,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [],
                isImported: true,
            },
        ]);

        render(<SongScreen />);

        await waitFor(() => expect(screen.getByText('Local Song')).toBeTruthy());
        expect(screen.queryByText('Edit')).toBeNull();
        expect(screen.queryByText('Delete')).toBeNull();
        expect(screen.getAllByText('118 BPM').length).toBeGreaterThan(0);

        fireEvent(screen.getByText('Local Song'), 'longPress');

        expect(screen.getByText('Edit')).toBeTruthy();
        expect(screen.getByText('Delete')).toBeTruthy();
        expect(screen.getByText('Favorite')).toBeTruthy();
    });

    it('toggles favorite from the hidden song action sheet', async () => {
        mockedSongLibrary.loadImportedSongs.mockResolvedValue([
            {
                id: 'local-song',
                title: 'Local Song',
                artist: 'Player',
                difficulty: 'Medium',
                backingTrack: { uri: 'file:///local-song.mp3' },
                bpm: 118,
                durationSec: 24,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [],
                isImported: true,
            },
        ]);
        mockedSongLibrary.updateSavedSongFavorite.mockResolvedValue({
            id: 'local-song',
            title: 'Local Song',
            artist: 'Player',
            difficulty: 'Medium',
            backingTrack: { uri: 'file:///local-song.mp3' },
            bpm: 118,
            durationSec: 24,
            chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
            tabNotes: [],
            isImported: true,
            isFavorite: true,
        });

        render(<SongScreen />);

        await waitFor(() => expect(screen.getByText('Local Song')).toBeTruthy());
        fireEvent(screen.getByText('Local Song'), 'longPress');
        fireEvent.press(screen.getByText('Favorite'));

        await waitFor(() => expect(mockedSongLibrary.updateSavedSongFavorite).toHaveBeenCalledWith('local-song', true));
    });
});
