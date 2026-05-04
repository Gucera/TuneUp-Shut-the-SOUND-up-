import { act, renderHook } from '@testing-library/react-native';
import { Audio } from 'expo-av';
import {
    classifyMicrophonePermission,
    getMicrophonePermissionMessage,
    useMicrophonePermission,
} from './useMicrophonePermission';

describe('microphone permission helpers', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('classifies missing response as unknown', () => {
        expect(classifyMicrophonePermission(null)).toBe('unknown');
    });

    it('classifies granted permission as recordable', () => {
        expect(classifyMicrophonePermission({ status: 'granted', canAskAgain: true })).toBe('granted');
    });

    it('classifies denied permission as denied when it can be requested again', () => {
        expect(classifyMicrophonePermission({ status: 'denied', canAskAgain: true })).toBe('denied');
    });

    it('classifies denied permission as blocked when it cannot be requested again', () => {
        expect(classifyMicrophonePermission({ status: 'denied', canAskAgain: false })).toBe('blocked');
    });

    it('classifies unavailable native audio as unavailable', () => {
        expect(classifyMicrophonePermission({ status: 'granted' }, false)).toBe('unavailable');
    });

    it('returns helpful blocked guidance', () => {
        expect(getMicrophonePermissionMessage('blocked')).toContain('device settings');
    });

    it('turns request failures into a safe error state', async () => {
        jest.spyOn(Audio, 'usePermissions').mockReturnValue([
            null,
            jest.fn(() => Promise.reject(new Error('native permission failure'))),
        ] as any);

        const { result } = renderHook(() => useMicrophonePermission(true));

        await act(async () => {
            const nextStatus = await result.current.requestPermission();
            expect(nextStatus).toBe('error');
        });

        expect(result.current.status).toBe('error');
        expect(result.current.canRecord).toBe(false);
        expect(result.current.errorMessage).toContain('Could not check microphone permission');
    });
});
