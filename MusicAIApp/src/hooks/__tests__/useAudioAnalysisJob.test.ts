import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAudioAnalysisJob } from '../useAudioAnalysisJob';
import {
    analyzeSongFile,
    fetchAnalysisTaskStatus,
    uploadAudioForAnalysis,
} from '../../services/api';

jest.mock('../../services/api', () => ({
    analyzeSongFile: jest.fn(),
    fetchAnalysisTaskStatus: jest.fn(),
    uploadAudioForAnalysis: jest.fn(),
}));

const mockedUploadAudioForAnalysis = jest.mocked(uploadAudioForAnalysis);
const mockedFetchAnalysisTaskStatus = jest.mocked(fetchAnalysisTaskStatus);
const mockedAnalyzeSongFile = jest.mocked(analyzeSongFile);

describe('useAudioAnalysisJob', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-04-25T12:00:00Z'));
        mockedUploadAudioForAnalysis.mockReset();
        mockedFetchAnalysisTaskStatus.mockReset();
        mockedAnalyzeSongFile.mockReset();
        (AppState as any).currentState = 'active';
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('stops polling on success', async () => {
        mockedUploadAudioForAnalysis.mockResolvedValue({
            status: 'accepted',
            taskId: 'task-1',
            progressText: 'Background scan started.',
            message: 'Started.',
        });
        mockedFetchAnalysisTaskStatus.mockResolvedValue({
            status: 'completed',
            taskId: 'task-1',
            progressText: 'Analysis complete.',
            updatedAt: null,
            result: {
                bpm: 120,
                markers: [],
                message: 'Analysis complete.',
            },
        });

        const { result } = renderHook(() => useAudioAnalysisJob({ pollIntervalMs: 10 }));

        await act(async () => {
            await result.current.startScan({ fileUri: 'file://song.mp3', fileName: 'song.mp3' });
        });

        expect(result.current.isScanning).toBe(false);
        expect(result.current.result?.bpm).toBe(120);
        expect(mockedFetchAnalysisTaskStatus).toHaveBeenCalledTimes(1);
    });

    it('stops polling on failed status', async () => {
        mockedUploadAudioForAnalysis.mockResolvedValue({
            status: 'accepted',
            taskId: 'task-1',
            progressText: 'Background scan started.',
            message: 'Started.',
        });
        mockedFetchAnalysisTaskStatus.mockResolvedValue({
            status: 'failed',
            taskId: 'task-1',
            progressText: 'Analysis failed.',
            updatedAt: null,
            message: 'Analysis failed. Please try again.',
        });

        const { result } = renderHook(() => useAudioAnalysisJob({ pollIntervalMs: 10 }));

        await act(async () => {
            await result.current.startScan({ fileUri: 'file://song.mp3', fileName: 'song.mp3' });
        });

        expect(result.current.isScanning).toBe(false);
        expect(result.current.error).toBe('Analysis failed. Please try again.');
    });

    it.each([
        ['cancelled', 'Analysis was cancelled.'],
        ['expired', 'Analysis expired. Please try again.'],
    ])('stops polling on %s terminal status', async (status, message) => {
        mockedUploadAudioForAnalysis.mockResolvedValue({
            status: 'accepted',
            taskId: 'task-1',
            progressText: 'Background scan started.',
            message: 'Started.',
        });
        mockedFetchAnalysisTaskStatus.mockResolvedValue({
            status,
            taskId: 'task-1',
            progressText: message,
            updatedAt: null,
            message,
        } as any);

        const { result } = renderHook(() => useAudioAnalysisJob({ pollIntervalMs: 10 }));

        await act(async () => {
            await result.current.startScan({ fileUri: 'file://song.mp3', fileName: 'song.mp3' });
        });

        expect(result.current.isScanning).toBe(false);
        expect(result.current.error).toBe(message);
        expect(mockedFetchAnalysisTaskStatus).toHaveBeenCalledTimes(1);
    });

    it('does not start polling when the accepted upload has no trackable task id', async () => {
        mockedUploadAudioForAnalysis.mockResolvedValue({
            status: 'accepted',
            taskId: '',
            progressText: 'Background scan started.',
            message: 'Started.',
        });

        const { result } = renderHook(() => useAudioAnalysisJob({ pollIntervalMs: 10 }));

        await act(async () => {
            await result.current.startScan({ fileUri: 'file://song.mp3', fileName: 'song.mp3' });
        });

        expect(result.current.isScanning).toBe(false);
        expect(result.current.taskId).toBeNull();
        expect(result.current.error).toBe('Analysis job could not be tracked. Please try again.');
        expect(mockedFetchAnalysisTaskStatus).not.toHaveBeenCalled();
    });

    it('stops polling on local timeout', async () => {
        mockedUploadAudioForAnalysis.mockResolvedValue({
            status: 'accepted',
            taskId: 'task-1',
            progressText: 'Background scan started.',
            message: 'Started.',
        });
        mockedFetchAnalysisTaskStatus.mockResolvedValue({
            status: 'processing',
            taskId: 'task-1',
            progressText: 'Analyzing audio...',
            updatedAt: null,
        });

        const { result } = renderHook(() =>
            useAudioAnalysisJob({ pollIntervalMs: 10, maxPollDurationMs: 20 }),
        );

        await act(async () => {
            await result.current.startScan({ fileUri: 'file://song.mp3', fileName: 'song.mp3' });
        });

        jest.setSystemTime(new Date('2026-04-25T12:01:00Z'));

        await act(async () => {
            await jest.runOnlyPendingTimersAsync();
        });

        expect(result.current.isScanning).toBe(false);
        expect(result.current.error).toContain('taking longer than expected');
    });

    it('shows a friendly error after repeated network errors', async () => {
        mockedUploadAudioForAnalysis.mockResolvedValue({
            status: 'accepted',
            taskId: 'task-1',
            progressText: 'Background scan started.',
            message: 'Started.',
        });
        mockedFetchAnalysisTaskStatus.mockResolvedValue({
            status: 'error',
            message: 'Could not connect to the analysis server.',
        });

        const { result } = renderHook(() =>
            useAudioAnalysisJob({ pollIntervalMs: 10, maxNetworkErrors: 2 }),
        );

        await act(async () => {
            await result.current.startScan({ fileUri: 'file://song.mp3', fileName: 'song.mp3' });
        });

        await act(async () => {
            jest.advanceTimersByTime(10);
            await Promise.resolve();
        });

        expect(result.current.isScanning).toBe(false);
        expect(result.current.error).toBe('Could not connect to the analysis server.');
    });

    it('cleans up scheduled polling on unmount', async () => {
        mockedUploadAudioForAnalysis.mockResolvedValue({
            status: 'accepted',
            taskId: 'task-1',
            progressText: 'Background scan started.',
            message: 'Started.',
        });
        mockedFetchAnalysisTaskStatus.mockResolvedValue({
            status: 'processing',
            taskId: 'task-1',
            progressText: 'Analyzing audio...',
            updatedAt: null,
        });

        const { result, unmount } = renderHook(() => useAudioAnalysisJob({ pollIntervalMs: 1000 }));

        await act(async () => {
            await result.current.startScan({ fileUri: 'file://song.mp3', fileName: 'song.mp3' });
        });

        expect(mockedFetchAnalysisTaskStatus).toHaveBeenCalledTimes(1);

        unmount();

        await act(async () => {
            jest.advanceTimersByTime(2000);
            await Promise.resolve();
        });

        expect(mockedFetchAnalysisTaskStatus).toHaveBeenCalledTimes(1);
    });
});
