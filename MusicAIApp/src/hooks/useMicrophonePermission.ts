import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Audio } from 'expo-av';

export type MicrophonePermissionState =
    | 'unknown'
    | 'checking'
    | 'granted'
    | 'denied'
    | 'blocked'
    | 'unavailable'
    | 'error';

export interface MicrophonePermissionResponseLike {
    status?: string | null;
    granted?: boolean | null;
    canAskAgain?: boolean | null;
}

export interface UseMicrophonePermissionResult {
    status: MicrophonePermissionState;
    canRecord: boolean;
    canAskAgain: boolean;
    errorMessage: string | null;
    checkPermission: () => Promise<void>;
    requestPermission: () => Promise<MicrophonePermissionState>;
}

const MICROPHONE_BLOCKED_MESSAGE = 'Enable microphone access in your device settings, then return to TuneUp.';
const MICROPHONE_DENIED_MESSAGE = 'Microphone access is required for tuning and live scoring.';
const MICROPHONE_UNAVAILABLE_MESSAGE = 'Microphone input is unavailable in this app environment.';
const MICROPHONE_ERROR_MESSAGE = 'Could not check microphone permission. Please try again.';

type AudioPermissionApi = typeof Audio & {
    getPermissionsAsync?: () => Promise<MicrophonePermissionResponseLike>;
};

function isGranted(response: MicrophonePermissionResponseLike) {
    return response.status === 'granted' || response.granted === true;
}

export function classifyMicrophonePermission(
    response: MicrophonePermissionResponseLike | null | undefined,
    nativeAvailable = true,
): MicrophonePermissionState {
    if (!nativeAvailable) {
        return 'unavailable';
    }

    if (!response) {
        return 'unknown';
    }

    if (isGranted(response)) {
        return 'granted';
    }

    if (response.canAskAgain === false) {
        return 'blocked';
    }

    if (response.status === 'denied' || response.granted === false) {
        return 'denied';
    }

    return 'unknown';
}

export function getMicrophonePermissionMessage(status: MicrophonePermissionState) {
    if (status === 'blocked') {
        return MICROPHONE_BLOCKED_MESSAGE;
    }

    if (status === 'denied') {
        return MICROPHONE_DENIED_MESSAGE;
    }

    if (status === 'unavailable') {
        return MICROPHONE_UNAVAILABLE_MESSAGE;
    }

    if (status === 'error') {
        return MICROPHONE_ERROR_MESSAGE;
    }

    return null;
}

export function useMicrophonePermission(nativeAvailable = true): UseMicrophonePermissionResult {
    const [permissionResponse, requestExpoPermission] = Audio.usePermissions();
    const [manualResponse, setManualResponse] = useState<MicrophonePermissionResponseLike | null>(null);
    const [overrideStatus, setOverrideStatus] = useState<MicrophonePermissionState | null>(null);
    const mountedRef = useRef(true);

    const response = manualResponse ?? permissionResponse;
    const classifiedStatus = classifyMicrophonePermission(response, nativeAvailable);
    const status = overrideStatus ?? classifiedStatus;

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
        };
    }, []);

    const checkPermission = useCallback(async () => {
        if (!nativeAvailable) {
            if (mountedRef.current) {
                setOverrideStatus('unavailable');
            }
            return;
        }

        const audioApi = Audio as AudioPermissionApi;
        if (!audioApi.getPermissionsAsync) {
            if (mountedRef.current) {
                setOverrideStatus(null);
            }
            return;
        }

        setOverrideStatus('checking');
        try {
            const nextResponse = await audioApi.getPermissionsAsync();
            if (mountedRef.current) {
                setManualResponse(nextResponse);
                setOverrideStatus(null);
            }
        } catch {
            if (mountedRef.current) {
                setOverrideStatus('error');
            }
        }
    }, [nativeAvailable]);

    const requestPermission = useCallback(async () => {
        if (!nativeAvailable) {
            if (mountedRef.current) {
                setOverrideStatus('unavailable');
            }
            return 'unavailable';
        }

        setOverrideStatus('checking');
        try {
            const nextResponse = await requestExpoPermission();
            const nextStatus = classifyMicrophonePermission(nextResponse, nativeAvailable);
            if (mountedRef.current) {
                setManualResponse(nextResponse);
                setOverrideStatus(null);
            }
            return nextStatus;
        } catch {
            if (mountedRef.current) {
                setOverrideStatus('error');
            }
            return 'error';
        }
    }, [nativeAvailable, requestExpoPermission]);

    return useMemo(() => ({
        status,
        canRecord: status === 'granted',
        canAskAgain: response?.canAskAgain ?? status !== 'blocked',
        errorMessage: getMicrophonePermissionMessage(status),
        checkPermission,
        requestPermission,
    }), [checkPermission, requestPermission, response?.canAskAgain, status]);
}
