import { AppState, AppStateStatus } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AnalysisResultPayload,
    ApiErrorResponse,
    analyzeSongFile,
    fetchAnalysisTaskStatus,
    uploadAudioForAnalysis,
} from '../services/api';

interface StartScanInput {
    fileUri: string;
    fileName: string;
    userId?: string;
}

interface UseAudioAnalysisJobOptions {
    pollIntervalMs?: number;
    maxPollDurationMs?: number;
    maxNetworkErrors?: number;
}

const IDLE_PROGRESS_TEXT = 'Load a track to start a scan.';
const STARTING_PROGRESS_TEXT = 'Waking the scan server and uploading your track...';
const FALLBACK_PROGRESS_TEXT = 'Background scan is unavailable on this server. Falling back to direct scan. Keep TuneUp open.';
const BACKGROUND_PROGRESS_TEXT = 'Scan still running in the background. Polling will resume when you return.';
const RESUME_PROGRESS_TEXT = 'Checking scan progress...';
const FAILURE_PROGRESS_TEXT = 'Could not start the scan.';
const POLL_TIMEOUT_MESSAGE = 'Analysis is taking longer than expected. Please try again or use another audio file.';

function getOptionalProgressText(status: unknown, fallback: string) {
    if (
        typeof status === 'object'
        && status !== null
        && 'progressText' in status
        && typeof status.progressText === 'string'
    ) {
        return status.progressText;
    }

    return fallback;
}

export function useAudioAnalysisJob({
    pollIntervalMs = 4000,
    maxPollDurationMs = 10 * 60 * 1000,
    maxNetworkErrors = 3,
}: UseAudioAnalysisJobOptions = {}) {
    const [isScanning, setIsScanning] = useState(false);
    const [progressText, setProgressText] = useState(IDLE_PROGRESS_TEXT);
    const [result, setResult] = useState<AnalysisResultPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);

    const activeTaskIdRef = useRef<string | null>(null);
    const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const mountedRef = useRef(true);
    const pollStartedAtRef = useRef<number | null>(null);
    const networkErrorCountRef = useRef(0);
    const pollInFlightRef = useRef(false);

    const clearScheduledPoll = useCallback(() => {
        if (!pollTimeoutRef.current) {
            return;
        }

        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
    }, []);

    const stopTrackingTask = useCallback(() => {
        clearScheduledPoll();
        activeTaskIdRef.current = null;
        pollStartedAtRef.current = null;
        networkErrorCountRef.current = 0;
        pollInFlightRef.current = false;
        if (!mountedRef.current) {
            return;
        }
        setTaskId(null);
        setIsScanning(false);
    }, [clearScheduledPoll]);

    const resetJob = useCallback(() => {
        stopTrackingTask();
        setProgressText(IDLE_PROGRESS_TEXT);
        setResult(null);
        setError(null);
    }, [stopTrackingTask]);

    const clearResult = useCallback(() => {
        setResult(null);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const completeScan = useCallback((analysisResult: AnalysisResultPayload, nextProgressText = 'Analysis complete.') => {
        stopTrackingTask();
        if (!mountedRef.current) {
            return;
        }
        setProgressText(nextProgressText);
        setError(null);
        setResult(analysisResult);
    }, [stopTrackingTask]);

    const failScan = useCallback((message: string, nextProgressText = FAILURE_PROGRESS_TEXT) => {
        stopTrackingTask();
        if (!mountedRef.current) {
            return;
        }
        setProgressText(nextProgressText);
        setError(message);
    }, [stopTrackingTask]);

    const pollTask = useCallback(async (nextTaskId: string) => {
        if (!nextTaskId || !mountedRef.current || pollInFlightRef.current) {
            return;
        }

        const startedAt = pollStartedAtRef.current ?? Date.now();
        pollStartedAtRef.current = startedAt;

        if ((Date.now() - startedAt) > maxPollDurationMs) {
            failScan(POLL_TIMEOUT_MESSAGE, 'Analysis is taking longer than expected...');
            return;
        }

        pollInFlightRef.current = true;
        const status = await fetchAnalysisTaskStatus(nextTaskId);
        pollInFlightRef.current = false;

        if (!mountedRef.current || activeTaskIdRef.current !== nextTaskId) {
            return;
        }

        if (status.status === 'completed') {
            completeScan(status.result, status.progressText);
            return;
        }

        if (status.status === 'failed' || status.status === 'timed_out' || status.status === 'cancelled' || status.status === 'expired') {
            failScan(status.message, getOptionalProgressText(status, 'Analysis failed.'));
            return;
        }

        if (status.status === 'error') {
            networkErrorCountRef.current += 1;
            if (networkErrorCountRef.current >= maxNetworkErrors) {
                failScan(status.message, 'Could not connect to the analysis server.');
                return;
            }

            setProgressText('Could not connect to the analysis server. Retrying...');
            clearScheduledPoll();
            pollTimeoutRef.current = setTimeout(() => {
                pollTimeoutRef.current = null;
                void pollTask(nextTaskId);
            }, pollIntervalMs);
            return;
        }

        networkErrorCountRef.current = 0;

        if (status.status !== 'processing') {
            return;
        }

        if (mountedRef.current) {
            setProgressText(status.progressText);
        }

        if (appStateRef.current !== 'active') {
            return;
        }

        clearScheduledPoll();
        pollTimeoutRef.current = setTimeout(() => {
            pollTimeoutRef.current = null;
            void pollTask(nextTaskId);
        }, pollIntervalMs);
    }, [
        clearScheduledPoll,
        completeScan,
        failScan,
        maxNetworkErrors,
        maxPollDurationMs,
        pollIntervalMs,
    ]);

    const runLegacyFallbackScan = useCallback(async (
        fileUri: string,
        fileName: string,
        uploadError: ApiErrorResponse,
    ) => {
        setProgressText(FALLBACK_PROGRESS_TEXT);
        const fallbackResult = await analyzeSongFile(fileUri, fileName);

        if (fallbackResult.status === 'success') {
            completeScan({
                bpm: fallbackResult.bpm,
                markers: fallbackResult.markers,
                message: fallbackResult.message,
            });
            return;
        }

        const errorMessage = uploadError.statusCode === 404
            ? `Background scan is not deployed on the live backend yet. ${fallbackResult.message}`
            : fallbackResult.message || uploadError.message;

        failScan(errorMessage);
    }, [completeScan, failScan]);

    const startScan = useCallback(async ({ fileUri, fileName, userId }: StartScanInput) => {
        clearScheduledPoll();
        activeTaskIdRef.current = null;
        pollStartedAtRef.current = null;
        networkErrorCountRef.current = 0;
        pollInFlightRef.current = false;
        setResult(null);
        setError(null);
        setIsScanning(true);
        setProgressText(STARTING_PROGRESS_TEXT);

        const uploadResult = await uploadAudioForAnalysis(fileUri, fileName, userId);

        if (uploadResult.status !== 'accepted') {
            await runLegacyFallbackScan(fileUri, fileName, uploadResult);
            return uploadResult;
        }

        if (!uploadResult.taskId?.trim()) {
            failScan('Analysis job could not be tracked. Please try again.');
            return uploadResult;
        }

        activeTaskIdRef.current = uploadResult.taskId;
        pollStartedAtRef.current = Date.now();
        setTaskId(uploadResult.taskId);
        setProgressText(uploadResult.progressText);
        await pollTask(uploadResult.taskId);

        return uploadResult;
    }, [clearScheduledPoll, pollTask, runLegacyFallbackScan]);

    useEffect(() => {
        mountedRef.current = true;
        const subscription = AppState.addEventListener('change', (nextState) => {
            appStateRef.current = nextState;

            if (!activeTaskIdRef.current) {
                return;
            }

            if (nextState === 'background' || nextState === 'inactive') {
                clearScheduledPoll();
                setProgressText(BACKGROUND_PROGRESS_TEXT);
                return;
            }

            if (nextState === 'active') {
                clearScheduledPoll();
                setProgressText(RESUME_PROGRESS_TEXT);
                void pollTask(activeTaskIdRef.current);
            }
        });

        return () => {
            mountedRef.current = false;
            subscription.remove();
            clearScheduledPoll();
            activeTaskIdRef.current = null;
            pollStartedAtRef.current = null;
            networkErrorCountRef.current = 0;
            pollInFlightRef.current = false;
        };
    }, [clearScheduledPoll, pollTask]);

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
