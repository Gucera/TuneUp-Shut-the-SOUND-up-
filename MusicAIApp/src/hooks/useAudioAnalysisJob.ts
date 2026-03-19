import { AppState, AppStateStatus } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AnalysisResultPayload,
    analyzeSongFile,
    fetchAnalysisTaskStatus,
    uploadAudioForAnalysis,
} from '../services/api';

interface StartScanInput {
    fileUri: string;
    fileName: string;
}

interface UseAudioAnalysisJobOptions {
    pollIntervalMs?: number;
}

export function useAudioAnalysisJob({
    pollIntervalMs = 4000,
}: UseAudioAnalysisJobOptions = {}) {
    const [isScanning, setIsScanning] = useState(false);
    const [progressText, setProgressText] = useState('Load a track to start a scan.');
    const [result, setResult] = useState<AnalysisResultPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);

    const activeTaskIdRef = useRef<string | null>(null);
    const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    const clearPollTimeout = useCallback(() => {
        if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
        }
    }, []);

    const resetJob = useCallback(() => {
        clearPollTimeout();
        activeTaskIdRef.current = null;
        setTaskId(null);
        setIsScanning(false);
        setProgressText('Load a track to start a scan.');
        setResult(null);
        setError(null);
    }, [clearPollTimeout]);

    const clearResult = useCallback(() => {
        setResult(null);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const pollTaskStatus = useCallback(async (nextTaskId: string) => {
        const status = await fetchAnalysisTaskStatus(nextTaskId);

        if (status.status === 'completed') {
            clearPollTimeout();
            activeTaskIdRef.current = null;
            setTaskId(null);
            setIsScanning(false);
            setProgressText(status.progressText);
            setError(null);
            setResult(status.result);
            return;
        }

        if (status.status === 'failed' || status.status === 'error') {
            clearPollTimeout();
            activeTaskIdRef.current = null;
            setTaskId(null);
            setIsScanning(false);
            setProgressText('progressText' in status ? status.progressText : 'Analysis failed.');
            setError(status.message);
            return;
        }

        setProgressText('progressText' in status ? status.progressText : 'Analysis is still running...');

        if (appStateRef.current === 'active') {
            clearPollTimeout();
            pollTimeoutRef.current = setTimeout(() => {
                pollTimeoutRef.current = null;
                void pollTaskStatus(nextTaskId);
            }, pollIntervalMs);
        }
    }, [clearPollTimeout, pollIntervalMs]);

    const startScan = useCallback(async ({ fileUri, fileName }: StartScanInput) => {
        clearPollTimeout();
        setResult(null);
        setError(null);
        setIsScanning(true);
        setProgressText('Waking the scan server and uploading your track...');

        const uploadResult = await uploadAudioForAnalysis(fileUri, fileName);

        if (uploadResult.status !== 'accepted' || !uploadResult.taskId) {
            setProgressText('Background scan is unavailable on this server. Falling back to direct scan. Keep TuneUp open.');
            const fallbackResult = await analyzeSongFile(fileUri, fileName);

            activeTaskIdRef.current = null;
            setTaskId(null);
            setIsScanning(false);

            if (fallbackResult.status === 'success') {
                setProgressText('Analysis complete.');
                setError(null);
                setResult({
                    bpm: fallbackResult.bpm,
                    markers: fallbackResult.markers,
                    message: fallbackResult.message,
                });
                return uploadResult;
            }

            setProgressText('Could not start the scan.');
            setError(
                'statusCode' in uploadResult && uploadResult.statusCode === 404
                    ? `Background scan is not deployed on the live backend yet. ${fallbackResult.message}`
                    : fallbackResult.message || uploadResult.message,
            );
            return uploadResult;
        }

        activeTaskIdRef.current = uploadResult.taskId;
        setTaskId(uploadResult.taskId);
        setProgressText(uploadResult.progressText);
        await pollTaskStatus(uploadResult.taskId);
        return uploadResult;
    }, [clearPollTimeout, pollTaskStatus]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            const hasActiveTask = !!activeTaskIdRef.current;
            appStateRef.current = nextState;

            if (!hasActiveTask) {
                return;
            }

            if (nextState === 'background' || nextState === 'inactive') {
                clearPollTimeout();
                setProgressText('Scan still running in the background. Polling will resume when you return.');
                return;
            }

            if (nextState === 'active' && activeTaskIdRef.current) {
                clearPollTimeout();
                setProgressText('Checking scan progress...');
                void pollTaskStatus(activeTaskIdRef.current);
            }
        });

        return () => {
            subscription.remove();
            clearPollTimeout();
        };
    }, [clearPollTimeout, pollTaskStatus]);

    return {
        isScanning,
        progressText,
        result,
        error,
        taskId,
        startScan,
        clearResult,
        clearError,
        resetJob,
    };
}
