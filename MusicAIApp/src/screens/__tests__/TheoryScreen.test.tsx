import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TheoryScreen from '../TheoryScreen';
import { fetchLessonCatalog } from '../../services/lessonCatalog';

const mockNavigate = jest.fn();

const guitarLesson = {
    id: 'gtr-1',
    title: 'Clean Open Chords',
    subtitle: 'Move between open chords with an even pulse.',
    tier: 'Beginner',
    category: 'practical' as const,
    categoryLabel: 'Lessons',
    instrument: 'Guitar' as const,
    instrumentLabel: 'Guitar',
    durationMin: 8,
    xpReward: 30,
    imageUrl: null,
    videoUrl: null,
    focusTags: ['chords', 'timing'],
    courseTitle: 'Guitar Foundations',
    orderIndex: 1,
};

const theoryLesson = {
    ...guitarLesson,
    id: 'theory-1',
    title: 'Intervals In Practice',
    subtitle: 'Hear and name small interval shapes.',
    tier: 'Core Theory',
    category: 'theory' as const,
    categoryLabel: 'Theory',
    instrument: null,
    instrumentLabel: 'Theory',
    courseTitle: 'Theory',
    orderIndex: 1,
};

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: (callback: () => void | (() => void)) => {
        const React = require('react');
        React.useEffect(() => callback(), [callback]);
    },
}));

jest.mock('../../components/PremiumBackdrop', () => () => null);

jest.mock('../../components/PageTransitionView', () => {
    const React = require('react');
    const { View } = require('react-native');

    return function MockPageTransitionView({ children }: { children?: React.ReactNode }) {
        return <View>{children}</View>;
    };
});

jest.mock('../../components/InstrumentCarousel', () => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return function MockInstrumentCarousel({
        items,
        selectedId,
        onSelect,
        onOpen,
    }: {
        items: Array<{ id: string; title: string }>;
        selectedId: string;
        onSelect: (item: { id: string; title: string }) => void;
        onOpen?: (item: { id: string; title: string }) => void;
    }) {
        const selectedItem = items.find((item) => item.id === selectedId) ?? items[0];

        return (
            <View>
                {items.map((item) => (
                    <Pressable key={item.id} onPress={() => onSelect(item)}>
                        <Text>{item.title}</Text>
                    </Pressable>
                ))}
                <Pressable onPress={() => onOpen?.(selectedItem)}>
                    <Text>Open selected path</Text>
                </Pressable>
            </View>
        );
    };
});

jest.mock('../../services/gamification', () => ({
    getGamificationSnapshot: jest.fn(() => Promise.resolve({
        userId: 'test-user',
        displayName: 'Studio Player',
        streakDays: 2,
        longestStreak: 2,
        didPracticeToday: false,
        streakMessage: 'Ready.',
        completedLessonIds: [],
        completedSongIds: [],
        completedQuizIds: [],
        unlockedBadgeIds: [],
        xp: 90,
        level: 2,
    })),
}));

jest.mock('../../services/lessonCatalog', () => ({
    fetchLessonCatalog: jest.fn(),
}));

function renderTheoryScreen(params?: { lessonInstrument?: 'Guitar' | 'Bass' | 'Piano' | 'Drums'; selectedLessonId?: string }) {
    return render(
        <TheoryScreen
            navigation={{ navigate: mockNavigate } as any}
            route={{ key: 'LessonLibrary', name: 'LessonLibrary', params } as any}
        />,
    );
}

describe('TheoryScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fetchLessonCatalog as jest.Mock).mockImplementation(({ category, instrument }) => {
            if (category === 'practical' && instrument === 'Guitar') {
                return Promise.resolve([guitarLesson]);
            }

            if (category === 'theory') {
                return Promise.resolve([theoryLesson]);
            }

            return Promise.resolve([]);
        });
    });

    it('opens on the instrument picker with the expected paths', async () => {
        renderTheoryScreen();

        await waitFor(() => expect(fetchLessonCatalog).toHaveBeenCalled());

        expect(screen.getByText('Choose your path')).toBeTruthy();
        expect(screen.getAllByText('Guitar').length).toBeGreaterThan(0);
        expect(screen.getByText('Bass')).toBeTruthy();
        expect(screen.getByText('Piano')).toBeTruthy();
        expect(screen.getByText('Drums')).toBeTruthy();
        expect(screen.getByText('Theory')).toBeTruthy();
    });

    it('shows lessons for the selected path and opens lesson detail', async () => {
        renderTheoryScreen();

        fireEvent.press(screen.getByText('Open selected path'));

        expect(await screen.findByText('Guitar lessons')).toBeTruthy();
        expect(screen.getByText('Clean Open Chords')).toBeTruthy();

        fireEvent.press(screen.getByText('Clean Open Chords'));
        expect(mockNavigate).toHaveBeenCalledWith('LessonDetail', { lessonId: 'gtr-1' });
    });

    it('returns from lesson list to the instrument picker', async () => {
        renderTheoryScreen();

        fireEvent.press(screen.getByText('Open selected path'));
        expect(await screen.findByText('Guitar lessons')).toBeTruthy();

        fireEvent.press(screen.getByText('Change path'));
        expect(screen.getByText('Choose your path')).toBeTruthy();
    });

    it('handles an empty instrument path without crashing', async () => {
        renderTheoryScreen();

        fireEvent.press(screen.getByText('Bass'));
        fireEvent.press(screen.getByText('Open selected path'));

        expect(await screen.findByText('No bass lessons yet')).toBeTruthy();
        expect(screen.getByText(/Try Guitar, Piano, Drums, or Theory/i)).toBeTruthy();
    });
});
