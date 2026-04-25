import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-gesture-handler', () => {
    const React = require('react');
    const { View } = require('react-native');

    return {
        GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children),
    };
});

jest.mock('../../App', () => jest.requireActual('../../App'));

jest.mock('../screens/AuthScreen', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return function MockAuthScreen() {
        return React.createElement(Text, null, 'Auth Screen');
    };
});

jest.mock('../screens/HomeScreen', () => () => null);
jest.mock('../screens/TheoryScreen', () => () => null);
jest.mock('../screens/LessonDetailScreen', () => () => null);
jest.mock('../screens/TunerScreen', () => () => null);
jest.mock('../screens/SongScreen', () => () => null);
jest.mock('../screens/ProfileScreen', () => () => null);
jest.mock('../screens/TrafficScreen', () => () => null);

jest.mock('../services/supabaseClient', () => ({
    restoreSupabaseSession: jest.fn(() => Promise.resolve(null)),
    supabase: {
        auth: {
            signOut: jest.fn(() => Promise.resolve({ error: null })),
            onAuthStateChange: jest.fn(() => ({
                data: {
                    subscription: {
                        unsubscribe: jest.fn(),
                    },
                },
            })),
        },
    },
}));

import App from '../../App';

describe('App bootstrap', () => {
    it('shows the auth screen when no saved session exists', async () => {
        render(<App />);
        await waitFor(() => {
            expect(screen.getByText('Auth Screen')).toBeTruthy();
        });
    });
});
