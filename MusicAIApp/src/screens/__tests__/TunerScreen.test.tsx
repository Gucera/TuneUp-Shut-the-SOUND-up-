import React from 'react';
import { render, screen } from '@testing-library/react-native';
import TunerScreen from '../TunerScreen';

jest.mock('@react-navigation/native', () => ({
    useIsFocused: () => true,
    useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn(), getParent: jest.fn(() => ({ navigate: jest.fn() })) }),
}));

jest.mock('../../hooks/useTuner', () => ({
    GUITAR_STANDARD_STRINGS: [
        { id: 'low-e', shortLabel: 'E', instructionLabel: 'Low E', noteName: 'E2', frequency: 82.41 },
        { id: 'a', shortLabel: 'A', instructionLabel: 'A', noteName: 'A2', frequency: 110.0 },
        { id: 'd', shortLabel: 'D', instructionLabel: 'D3', frequency: 146.83 },
        { id: 'g', shortLabel: 'G', instructionLabel: 'G3', frequency: 196.0 },
        { id: 'b', shortLabel: 'B', instructionLabel: 'B3', frequency: 246.94 },
        { id: 'high-e', shortLabel: 'e', instructionLabel: 'High E', noteName: 'E4', frequency: 329.63 },
    ],
    TUNER_A4_HZ: 440,
    TUNER_BUFFER_SIZE: 2048,
    TUNER_CONFIDENCE_THRESHOLD: 0.8,
    TUNER_IN_TUNE_CENTS: 5,
    TUNER_NATIVE_MODULE_MESSAGE: 'Native build required',
    TUNER_VISUAL_REFRESH_MS: 66,
    useTuner: () => ({
        status: 'listening',
        error: null,
        isNativeModuleAvailable: true,
        canAskPermissionAgain: true,
        isListening: true,
        hasSignal: true,
        frequency: 82.41,
        midi: 40,
        noteName: 'E2',
        noteClass: 'E',
        confidence: 0.94,
        volume: -20,
        cents: 0,
        target: { midi: 40, noteName: 'E2', frequency: 82.41 },
        targetNoteName: 'E2',
        targetFrequency: 82.41,
        targetCents: 0,
        isInTune: true,
        displayStatus: 'Locked on E2',
        diagnostics: { gateState: 'active', analysisDurationMs: 12, stableMidi: 40 },
        needleCents: { value: 0 },
        confidenceValue: { value: 1 },
        stabilityValue: { value: 1 },
        needleRotation: { value: 0 },
        inTuneValue: { value: 1 },
        start: jest.fn(),
        stop: jest.fn(),
    }),
}));

describe('TunerScreen', () => {
    it('renders the professional tuner shell', () => {
        render(<TunerScreen />);
        expect(screen.getByText('Professional Guitar Tuner')).toBeTruthy();
        expect(screen.getByText('Current target')).toBeTruthy();
        expect(screen.getAllByText('E2').length).toBeGreaterThan(0);
    });
});
