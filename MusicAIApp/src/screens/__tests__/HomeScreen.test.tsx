import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import HomeScreen from '../HomeScreen';

const mockNavigate = jest.fn();
const mockGetParent = jest.fn(() => ({ navigate: mockNavigate }));

jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: mockNavigate, getParent: mockGetParent, setParams: jest.fn() }),
    useFocusEffect: (callback: () => void | (() => void)) => {
        const React = require('react');
        React.useEffect(() => callback(), [callback]);
    },
    useIsFocused: () => true,
}));

jest.mock('../../services/gamification', () => ({
    BADGE_DEFINITIONS: [{ id: 'a' }, { id: 'b' }],
    getGamificationSnapshot: jest.fn(() => Promise.resolve({
        displayName: 'Studio Player',
        streakMessage: 'Keep the streak going.',
        completedLessonIds: [],
        completedSongIds: [],
        unlockedBadgeIds: [],
        xp: 120,
        level: 2,
        streakDays: 3,
        didPracticeToday: false,
    })),
}));

jest.mock('../../services/songLibrary', () => ({
    loadImportedSongs: jest.fn(() => Promise.resolve([])),
}));

describe('HomeScreen', () => {
    it('renders the quick launch section including Studio', async () => {
        render(<HomeScreen />);
        await waitFor(() => expect(screen.getByText(/Welcome back/i)).toBeTruthy());
        expect(screen.getByText('Quick Launch')).toBeTruthy();
        expect(screen.getByText('Studio')).toBeTruthy();
    });
});
