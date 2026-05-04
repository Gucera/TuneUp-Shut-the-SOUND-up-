import { act, renderHook } from '@testing-library/react-native';
import { useTuner } from './useTuner';

const mockDetector = {
    isAvailable: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
};

let mockMicrophonePermission = {
    status: 'granted',
    canRecord: true,
    canAskAgain: true,
    errorMessage: null as string | null,
    checkPermission: jest.fn(),
    requestPermission: jest.fn(),
};

jest.mock('../services/tunerDetector', () => ({
    createPitchyTunerDetector: jest.fn(() => mockDetector),
}));

jest.mock('./useMicrophonePermission', () => ({
    getMicrophonePermissionMessage: jest.fn((status: string) => (
        status === 'blocked'
            ? 'Microphone access is off. Open Settings to enable the tuner.'
            : 'Microphone access is required for tuning and live scoring.'
    )),
    useMicrophonePermission: jest.fn(() => mockMicrophonePermission),
}));

describe('useTuner lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDetector.isAvailable.mockReturnValue(true);
        mockDetector.start.mockResolvedValue(undefined);
        mockDetector.stop.mockResolvedValue(undefined);
        mockMicrophonePermission = {
            status: 'granted',
            canRecord: true,
            canAskAgain: true,
            errorMessage: null,
            checkPermission: jest.fn(),
            requestPermission: jest.fn(),
        };
    });

    it('starts the detector when permission is granted', async () => {
        const { result } = renderHook(() => useTuner());

        let didStart = false;

        await act(async () => {
            didStart = await result.current.start();
        });

        expect(didStart).toBe(true);
        expect(mockDetector.start).toHaveBeenCalledTimes(1);
    });

    it('prevents duplicate detector starts while startup is pending', async () => {
        let resolveStart: () => void = () => {};
        mockDetector.start.mockReturnValue(new Promise<void>((resolve) => {
            resolveStart = resolve;
        }));

        const { result } = renderHook(() => useTuner());

        await act(async () => {
            const firstStart = result.current.start();
            const secondStart = result.current.start();
            resolveStart();
            await firstStart;
            await secondStart;
        });

        expect(mockDetector.start).toHaveBeenCalledTimes(1);
    });

    it('turns detector startup failures into a safe error state', async () => {
        mockDetector.start.mockRejectedValue(new Error('native audio format failed'));

        const { result } = renderHook(() => useTuner());

        let didStart = true;

        await act(async () => {
            didStart = await result.current.start();
        });

        expect(didStart).toBe(false);
        expect(mockDetector.stop).toHaveBeenCalled();
    });

    it('stops and resets the detector cleanup state', async () => {
        const { result } = renderHook(() => useTuner());

        await act(async () => {
            await result.current.start();
            await result.current.stop();
        });

        expect(mockDetector.stop).toHaveBeenCalled();
    });

});
