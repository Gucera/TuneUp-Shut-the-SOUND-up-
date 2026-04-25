import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../ProfileScreen';

let consoleErrorSpy: jest.SpyInstance;

jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: jest.fn(), getParent: jest.fn(() => ({ navigate: jest.fn() })), setParams: jest.fn() }),
    useRoute: () => ({ params: {} }),
    useFocusEffect: (callback: () => void | (() => void)) => {
        const React = require('react');
        React.useEffect(() => callback(), [callback]);
    },
    useIsFocused: () => true,
}));

jest.mock('../../services/appSettings', () => ({
    getAppSettings: jest.fn(() => Promise.resolve({
        leaderboardSyncEnabled: false,
        lessonAnimationsEnabled: true,
        theoryShowGameDeck: true,
        theoryShowQuizExplanation: true,
        practiceBackendPitchAssist: true,
        practiceShowFrequencyReadout: true,
        practiceShowStringHelper: true,
        studioShowPresetNotes: true,
        studioShowFocusNotes: true,
        studioShowQuickMarkers: true,
        songsDefaultToTabs: false,
        songsSeekJumpSeconds: 10,
        songsShowStreakBanner: true,
        songsBackendPitchAssist: true,
        profileShowBadgeShelf: true,
        profileShowLeaderboard: true,
        hapticsEnabled: false,
        dailyPracticeGoalMinutes: 20,
    })),
    updateAppSettings: jest.fn((patch) => Promise.resolve({ ...patch })),
}));

jest.mock('../../services/gamification', () => ({
    BADGE_DEFINITIONS: [{ id: 'first_song', title: 'First Song', description: 'desc', howToEarn: 'earn it' }],
    getGamificationSnapshot: jest.fn(() => Promise.resolve({
        userId: 'user-1',
        displayName: 'Player One',
        streakDays: 4,
        longestStreak: 7,
        didPracticeToday: true,
        streakMessage: 'Keep going',
        completedLessonIds: [],
        completedSongIds: [],
        completedQuizIds: [],
        unlockedBadgeIds: ['first_song'],
        xp: 320,
        level: 4,
    })),
    getLeaderboard: jest.fn(() => Promise.resolve([])),
    syncGamificationProfile: jest.fn(() => Promise.resolve()),
    updateDisplayName: jest.fn(() => Promise.resolve({
        userId: 'user-1',
        displayName: 'Player One',
        streakDays: 4,
        longestStreak: 7,
        didPracticeToday: true,
        streakMessage: 'Keep going',
        completedLessonIds: [],
        completedSongIds: [],
        completedQuizIds: [],
        unlockedBadgeIds: ['first_song'],
        xp: 320,
        level: 4,
    })),
}));

jest.mock('../../services/api', () => ({
    fetchTrafficAnalyses: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../services/songLibrary', () => ({
    loadImportedSongs: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../services/supabaseClient', () => ({
    supabase: {
        auth: {
            signOut: jest.fn(() => Promise.resolve({ error: null })),
        },
    },
}));

describe('ProfileScreen', () => {
    beforeAll(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });

    it('renders the profile hub and settings shelves', async () => {
        render(<ProfileScreen />);
        await waitFor(() => expect(screen.getByText('Profile')).toBeTruthy());
        expect(screen.getAllByText('Lessons').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Songs').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Badges').length).toBeGreaterThan(0);
    });
});
