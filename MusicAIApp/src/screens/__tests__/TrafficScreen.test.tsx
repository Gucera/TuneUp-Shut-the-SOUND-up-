import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import TrafficScreen from '../TrafficScreen';

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: (callback: () => void | (() => void)) => {
        const React = require('react');
        React.useEffect(() => callback(), [callback]);
    },
    useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn(), getParent: jest.fn(() => ({ navigate: jest.fn() })) }),
    useRoute: () => ({ params: {} }),
    useIsFocused: () => true,
}));

jest.mock('../../services/appSettings', () => ({
    getAppSettings: jest.fn(() => Promise.resolve({
        studioShowPresetNotes: true,
        studioShowFocusNotes: true,
        studioShowQuickMarkers: true,
    })),
}));

jest.mock('../../services/gamification', () => ({
    getGamificationSnapshot: jest.fn(() => Promise.resolve({ userId: 'user-1' })),
}));

jest.mock('../../hooks/useAudioAnalysisJob', () => ({
    useAudioAnalysisJob: () => ({
        isScanning: false,
        progressText: 'Idle',
        result: null,
        error: null,
        startScan: jest.fn(),
        clearResult: jest.fn(),
        clearError: jest.fn(),
        resetJob: jest.fn(),
    }),
}));

describe('TrafficScreen', () => {
    it('renders the studio analyzer shell', async () => {
        render(<TrafficScreen />);
        await waitFor(() => expect(screen.getByText('Studio Grid')).toBeTruthy());
        expect(screen.getByText('Built-In Traffic Studies')).toBeTruthy();
    });
});
