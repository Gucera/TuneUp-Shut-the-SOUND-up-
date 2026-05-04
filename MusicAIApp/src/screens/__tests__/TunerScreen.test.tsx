import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import TunerScreen from '../TunerScreen';

const mockStart = jest.fn();
const mockStop = jest.fn();
let mockTunerState: Record<string, unknown>;

jest.mock('@react-navigation/native', () => ({
    useIsFocused: () => true,
    useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn(), getParent: jest.fn(() => ({ navigate: jest.fn() })) }),
}));

jest.mock('../../hooks/useTuner', () => ({
    BASS_TUNER_MAX_FREQUENCY_HZ: 250,
    BASS_TUNER_MIN_FREQUENCY_HZ: 30,
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
    useTuner: () => mockTunerState,
}));

function createMockTunerState(overrides: Record<string, unknown> = {}) {
    return {
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
        target: { midi: 40, noteName: 'E2', frequency: 82.41 },
        targetNoteName: 'E2',
        targetFrequency: 82.41,
        targetCents: 0,
        isInTune: false,
        displayStatus: 'Tap Start Listening to begin.',
        diagnostics: { gateState: 'buffering', analysisDurationMs: null, stableMidi: null },
        needleCents: { value: 0 },
        confidenceValue: { value: 0 },
        stabilityValue: { value: 0 },
        needleRotation: { value: 0 },
        inTuneValue: { value: 0 },
        start: mockStart,
        stop: mockStop,
        checkMicrophonePermission: jest.fn(),
        ...overrides,
    };
}

describe('TunerScreen', () => {
    beforeEach(() => {
        mockStart.mockReset();
        mockStop.mockReset();
        mockStart.mockResolvedValue(true);
        mockStop.mockResolvedValue(undefined);
        mockTunerState = createMockTunerState();
    });

    it('renders the professional tuner shell', () => {
        render(<TunerScreen />);
        expect(screen.getByText('Professional Guitar Tuner')).toBeTruthy();
        expect(screen.getByText('Current target')).toBeTruthy();
        expect(screen.getAllByText('E2').length).toBeGreaterThan(0);
    });

    it('shows a visible start button while idle', () => {
        render(<TunerScreen />);

        expect(screen.getByText('Idle')).toBeTruthy();
        expect(screen.getByText('Tap Start Listening to begin.')).toBeTruthy();

        fireEvent.press(screen.getByLabelText('Start Listening'));

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('shows a stop button and listening copy while waiting for signal', () => {
        mockTunerState = createMockTunerState({
            status: 'no_signal',
            isListening: true,
            displayStatus: 'Listening for a confident note...',
        });

        render(<TunerScreen />);

        expect(screen.getByText('Listening')).toBeTruthy();
        expect(screen.getByText('Listening. Play a clean single string close to the mic.')).toBeTruthy();

        fireEvent.press(screen.getByLabelText('Stop Listening'));

        expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('disables duplicate starts while microphone startup is in progress', () => {
        mockTunerState = createMockTunerState({
            status: 'starting',
            displayStatus: 'Starting microphone...',
        });

        render(<TunerScreen />);

        expect(screen.getAllByText('Starting microphone...').length).toBeGreaterThan(0);

        fireEvent.press(screen.getByLabelText('Starting microphone...'));

        expect(mockStart).not.toHaveBeenCalled();
    });

    it('disables duplicate starts while checking microphone permission', () => {
        mockTunerState = createMockTunerState({
            status: 'checking_permission',
            displayStatus: 'Checking microphone permission...',
        });

        render(<TunerScreen />);

        expect(screen.getAllByText('Checking microphone permission...').length).toBeGreaterThan(0);

        fireEvent.press(screen.getByLabelText('Checking microphone permission...'));

        expect(mockStart).not.toHaveBeenCalled();
    });

    it('shows a retry button for tuner startup errors', () => {
        mockTunerState = createMockTunerState({
            status: 'error',
            error: 'Could not start tuner audio input.',
            displayStatus: 'Could not start tuner audio input.',
        });

        render(<TunerScreen />);

        expect(screen.getByText('Error')).toBeTruthy();
        expect(screen.getByText('Could not start tuner audio input.')).toBeTruthy();

        fireEvent.press(screen.getByLabelText('Try Again'));

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('adds an internal Guitar and Bass mode switch', () => {
        render(<TunerScreen />);

        expect(screen.getByText('Guitar')).toBeTruthy();
        expect(screen.getByText('Bass')).toBeTruthy();
        expect(screen.getByText('Guided sequence')).toBeTruthy();
    });

    it('shows bass strings without replacing the tuner screen design', () => {
        render(<TunerScreen />);

        fireEvent.press(screen.getByText('Bass'));

        expect(screen.getByText('Tune bass by string.')).toBeTruthy();
        expect(screen.getByText('Bass strings')).toBeTruthy();
        expect(screen.getAllByText('E1').length).toBeGreaterThan(0);
        expect(screen.getAllByText('A1').length).toBeGreaterThan(0);
        expect(screen.getAllByText('D2').length).toBeGreaterThan(0);
        expect(screen.getAllByText('G2').length).toBeGreaterThan(0);
    });

    it('updates the bass target when a bass string card is selected', () => {
        render(<TunerScreen />);

        fireEvent.press(screen.getByText('Bass'));
        fireEvent.press(screen.getByText('G2'));

        expect(screen.getAllByText('98.00 Hz').length).toBeGreaterThan(0);
        expect(screen.getByText('Bass string 4 of 4')).toBeTruthy();
    });

    it('uses bass-specific waiting copy while listening without signal', () => {
        mockTunerState = createMockTunerState({
            status: 'no_signal',
            isListening: true,
            displayStatus: 'Listening for a confident note...',
        });

        render(<TunerScreen />);

        fireEvent.press(screen.getByText('Bass'));

        expect(screen.getByText('Listening. Pluck the selected bass string clearly.')).toBeTruthy();
    });

    it('keeps guitar mode on guitar strings', () => {
        mockTunerState = createMockTunerState({
            hasSignal: true,
            frequency: 82.41,
            targetCents: 0,
            confidence: 0.96,
            displayStatus: 'Locked on E2',
        });

        render(<TunerScreen />);

        expect(screen.getByText('Guided')).toBeTruthy();
        expect(screen.getAllByText('E2').length).toBeGreaterThan(0);
        expect(screen.queryByText('Bass strings')).toBeNull();
    });
});
