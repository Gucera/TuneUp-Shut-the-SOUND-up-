import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { PitchyAlgorithm } from 'react-native-pitchy';
import {
    DerivedValue,
    SharedValue,
    useDerivedValue,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import {
    createPitchyTunerDetector,
    TunerDetectorGateState,
    TunerReading,
} from '../services/tunerDetector';
import { centsBetween, InstrumentType, TUNINGS } from '../utils/tuningData';
import {
    calculateTunerCents,
    clampTunerCents,
    getNearestGuitarString,
    GuitarStringTarget,
    isValidTunerFrequency,
    smoothTunerFrequency,
    STANDARD_GUITAR_STRINGS,
    TUNER_MAX_FREQUENCY_HZ,
    TUNER_IN_TUNE_CENTS,
    TUNER_MIN_FREQUENCY_HZ,
    TUNER_MAX_NEEDLE_CENTS,
} from '../utils/tunerMath';
import {
    getMicrophonePermissionMessage,
    MicrophonePermissionState,
    useMicrophonePermission,
} from './useMicrophonePermission';

export { TUNER_IN_TUNE_CENTS, TUNER_MAX_NEEDLE_CENTS } from '../utils/tunerMath';
export { BASS_TUNER_MAX_FREQUENCY_HZ, BASS_TUNER_MIN_FREQUENCY_HZ } from '../utils/tunerMath';

export const TUNER_A4_HZ = 440;
export const TUNER_BUFFER_SIZE = 2048;
export const TUNER_MIN_VOLUME_DB = -58;
export const TUNER_CONFIDENCE_THRESHOLD = 0.8;
export const TUNER_TARGET_TOLERANCE_CENTS = 18;
export const TUNER_NO_SIGNAL_TIMEOUT_MS = 1200;
export const TUNER_NATIVE_MODULE_MESSAGE = 'Native tuner module is not available in this build. Use a development or production native build instead of Expo Go.';
export const TUNER_STARTUP_FAILURE_MESSAGE = 'Could not start tuner audio input. If you are using iOS Simulator, try a real iPhone.';
export const TUNER_VISUAL_REFRESH_MS = 66;

const PITCHY_ALGORITHM: PitchyAlgorithm = 'MPM';
const NOTE_SEQUENCE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const GUITAR_TAB_OPEN_MIDI = [64, 59, 55, 50, 45, 40] as const;
const TARGET_INSTRUMENTS: TunerInstrument[] = ['Guitar', 'Bass', 'Ukulele', 'Chromatic'];
const TUNER_NEEDLE_RESPONSE_MS = 34;
const TUNER_NEEDLE_RETURN_MS = 120;
const TUNER_CONFIDENCE_FADE_MS = 48;
const TUNER_STABILITY_FADE_MS = 90;
const TUNER_NEEDLE_SMOOTHING_FACTOR = 0.38;
const TUNER_NEEDLE_CENTER_SNAP_CENTS = 0.45;
const TUNER_MEDIAN_PITCH_WINDOW = 5;

export type NativeGateState = TunerDetectorGateState;

export type TunerInstrument = Exclude<InstrumentType, 'Drums'> | 'Chromatic';
export type TunerStatus = 'idle' | 'checking_permission' | 'starting' | 'listening' | 'no_signal' | 'error';

export interface NoteLookupEntry {
    midi: number;
    noteName: string;
    noteClass: string;
    octave: number;
}

interface PitchFrame {
    frequency: number | null;
    midi: number | null;
    noteName: string;
    noteClass: string;
    centsFromNote: number;
    confidence: number;
    volume: number;
    updatedAt: number;
    hasSignal: boolean;
    gateState: NativeGateState;
    analysisDurationMs: number | null;
    stableMidi: number | null;
}

export interface TunerTarget {
    midi: number;
    noteName: string;
    frequency: number;
}

export interface UseTunerOptions {
    calibrationHz?: number;
    bufferSize?: number;
    minVolume?: number;
    confidenceThreshold?: number;
    instrument?: TunerInstrument;
    targetMidi?: number | null;
    targetFrequency?: number | null;
    enabled?: boolean;
    minFrequencyHz?: number;
    maxFrequencyHz?: number;
    frequencySmoothingFactor?: number;
    noSignalTimeoutMs?: number;
    uiSnapshotIntervalMs?: number;
}

export interface UseTunerResult {
    status: TunerStatus;
    error: string | null;
    microphonePermissionStatus: MicrophonePermissionState;
    microphonePermissionMessage: string | null;
    isNativeModuleAvailable: boolean;
    canAskPermissionAgain: boolean;
    isListening: boolean;
    hasSignal: boolean;
    frequency: number | null;
    midi: number | null;
    noteName: string;
    noteClass: string;
    confidence: number;
    volume: number;
    cents: number;
    target: TunerTarget | null;
    targetNoteName: string;
    targetFrequency: number | null;
    targetCents: number;
    isInTune: boolean;
    displayStatus: string;
    diagnostics: {
        gateState: NativeGateState;
        analysisDurationMs: number | null;
        stableMidi: number | null;
    };
    needleCents: SharedValue<number>;
    confidenceValue: SharedValue<number>;
    stabilityValue: SharedValue<number>;
    needleRotation: DerivedValue<number>;
    inTuneValue: DerivedValue<0 | 1>;
    start: () => Promise<boolean>;
    stop: () => Promise<void>;
    checkMicrophonePermission: () => Promise<void>;
}

export const GUITAR_STANDARD_STRINGS: GuitarStringTarget[] = STANDARD_GUITAR_STRINGS;

const EMPTY_FRAME: PitchFrame = {
    frequency: null,
    midi: null,
    noteName: '--',
    noteClass: '--',
    centsFromNote: 0,
    confidence: 0,
    volume: -120,
    updatedAt: 0,
    hasSignal: false,
    gateState: 'buffering',
    analysisDurationMs: null,
    stableMidi: null,
};

export const MIDI_NOTE_LOOKUP: NoteLookupEntry[] = Array.from({ length: 128 }, (_, midi) => {
    const noteClass = NOTE_SEQUENCE[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;

    return {
        midi,
        noteName: `${noteClass}${octave}`,
        noteClass,
        octave,
    };
});

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function median(values: number[]) {
    if (values.length === 0) {
        return 0;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 1) {
        return sorted[middle];
    }

    return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function midiToFrequency(midi: number, calibrationHz = TUNER_A4_HZ) {
    return calibrationHz * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number) {
    const safeMidi = clamp(Math.round(midi), 0, MIDI_NOTE_LOOKUP.length - 1);
    return MIDI_NOTE_LOOKUP[safeMidi].noteName;
}

export function getNoteClass(noteName: string) {
    return noteName.replace(/-?\d+/g, '');
}

export function frequencyToNote(frequency: number, calibrationHz = TUNER_A4_HZ) {
    const midiFloat = 69 + (12 * Math.log2(frequency / calibrationHz));
    const midi = clamp(Math.round(midiFloat), 0, MIDI_NOTE_LOOKUP.length - 1);
    const note = MIDI_NOTE_LOOKUP[midi];
    const nearestFrequency = midiToFrequency(midi, calibrationHz);
    const centsFromNote = 1200 * Math.log2(frequency / nearestFrequency);

    return {
        frequency,
        midi,
        noteName: note.noteName,
        noteClass: note.noteClass,
        centsFromNote,
    };
}

export function buildMidiTarget(midi: number, calibrationHz = TUNER_A4_HZ): TunerTarget {
    return {
        midi,
        noteName: midiToNoteName(midi),
        frequency: midiToFrequency(midi, calibrationHz),
    };
}

export function buildTabTarget(stringIndex: number, fret: number, calibrationHz = TUNER_A4_HZ): TunerTarget {
    const safeIndex = clamp(stringIndex, 0, GUITAR_TAB_OPEN_MIDI.length - 1);
    return buildMidiTarget(GUITAR_TAB_OPEN_MIDI[safeIndex] + fret, calibrationHz);
}

export function calculateCentsOffset(pitch: number, targetFrequency: number) {
    return calculateTunerCents(pitch, targetFrequency);
}

function resolveTunerTarget(
    frequency: number | null,
    instrument: TunerInstrument,
    targetMidi: number | null,
    targetFrequency: number | null,
    calibrationHz = TUNER_A4_HZ,
) {
    if (targetFrequency !== null) {
        const targetNote = frequencyToNote(targetFrequency, calibrationHz);

        return {
            midi: targetNote.midi,
            noteName: targetNote.noteName,
            frequency: targetFrequency,
        };
    }

    if (targetMidi !== null) {
        return buildMidiTarget(targetMidi, calibrationHz);
    }

    if (instrument !== 'Chromatic' && frequency) {
        return getClosestInstrumentTarget(frequency, instrument);
    }

    return null;
}

function getClosestInstrumentTarget(frequency: number, instrument: Exclude<TunerInstrument, 'Chromatic'>): TunerTarget {
    if (instrument === 'Guitar') {
        const closestGuitarString = getNearestGuitarString(frequency);

        if (closestGuitarString) {
            const midi = clamp(Math.round(69 + (12 * Math.log2(closestGuitarString.frequencyHz / TUNER_A4_HZ))), 0, MIDI_NOTE_LOOKUP.length - 1);

            return {
                midi,
                noteName: closestGuitarString.noteName,
                frequency: closestGuitarString.frequencyHz,
            };
        }
    }

    const strings = TUNINGS[instrument];
    const initial = strings[0];

    const closest = strings.slice(1).reduce((best, candidate) => (
        Math.abs(centsBetween(frequency, candidate.freq)) < Math.abs(centsBetween(frequency, best.freq))
            ? candidate
            : best
    ), initial);

    const midi = clamp(Math.round(69 + (12 * Math.log2(closest.freq / TUNER_A4_HZ))), 0, MIDI_NOTE_LOOKUP.length - 1);

    return {
        midi,
        noteName: closest.name,
        frequency: closest.freq,
    };
}

export function isPitchMatchForTarget(
    frequency: number,
    targetMidi: number,
    calibrationHz = TUNER_A4_HZ,
    toleranceCents = TUNER_TARGET_TOLERANCE_CENTS,
) {
    return Math.abs(centsBetween(frequency, midiToFrequency(targetMidi, calibrationHz))) <= toleranceCents;
}

export function isSupportedTunerInstrument(value: string): value is TunerInstrument {
    return TARGET_INSTRUMENTS.includes(value as TunerInstrument);
}

export function useTuner({
    calibrationHz = TUNER_A4_HZ,
    bufferSize = TUNER_BUFFER_SIZE,
    minVolume = TUNER_MIN_VOLUME_DB,
    confidenceThreshold = TUNER_CONFIDENCE_THRESHOLD,
    instrument = 'Guitar',
    targetMidi = null,
    targetFrequency = null,
    enabled = false,
    minFrequencyHz = TUNER_MIN_FREQUENCY_HZ,
    maxFrequencyHz = TUNER_MAX_FREQUENCY_HZ,
    frequencySmoothingFactor = 0.35,
    noSignalTimeoutMs = TUNER_NO_SIGNAL_TIMEOUT_MS,
    uiSnapshotIntervalMs = 0,
}: UseTunerOptions = {}): UseTunerResult {
    const detector = useMemo(() => createPitchyTunerDetector({
        algorithm: PITCHY_ALGORITHM,
        bufferSize,
        minVolume,
    }), [bufferSize, minVolume]);
    const isDetectorAvailable = detector.isAvailable();
    const microphonePermission = useMicrophonePermission(isDetectorAvailable);
    const [status, setStatus] = useState<TunerStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [frame, setFrame] = useState<PitchFrame>(EMPTY_FRAME);

    const mountedRef = useRef(true);
    const isListeningRef = useRef(false);
    const isStartingRef = useRef(false);
    const wasEnabledRef = useRef(enabled);
    const latestAcceptedFrameRef = useRef<PitchFrame>(EMPTY_FRAME);
    const latestCommittedFrameRef = useRef<PitchFrame>(EMPTY_FRAME);
    const latestCommittedStatusRef = useRef<TunerStatus>('idle');
    const latestCommittedErrorRef = useRef<string | null>(null);
    const lastUiCommitAtRef = useRef(0);
    const pitchHistoryRef = useRef<number[]>([]);
    const smoothedNeedleCentsRef = useRef(0);
    const smoothedFrequencyRef = useRef<number | null>(null);
    const noSignalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const liveOptionsRef = useRef({
        calibrationHz,
        confidenceThreshold,
        minVolume,
        instrument,
        targetMidi,
        targetFrequency,
        minFrequencyHz,
        maxFrequencyHz,
        frequencySmoothingFactor,
        uiSnapshotIntervalMs,
    });
    const needleCents = useSharedValue(0);
    const confidenceValue = useSharedValue(0);
    const stabilityValue = useSharedValue(0);

    useEffect(() => {
        liveOptionsRef.current = {
            calibrationHz,
            confidenceThreshold,
            minVolume,
            instrument,
            targetMidi,
            targetFrequency,
            minFrequencyHz,
            maxFrequencyHz,
            frequencySmoothingFactor,
            uiSnapshotIntervalMs,
        };
    }, [calibrationHz, confidenceThreshold, frequencySmoothingFactor, instrument, maxFrequencyHz, minFrequencyHz, minVolume, targetFrequency, targetMidi, uiSnapshotIntervalMs]);

    const pushUiSnapshot = useCallback((
        nextFrame: PitchFrame,
        nextStatus: TunerStatus,
        nextError: string | null,
        force = false,
        now = Date.now(),
    ) => {
        const noteChanged = nextFrame.noteName !== latestCommittedFrameRef.current.noteName;
        const signalChanged = nextFrame.hasSignal !== latestCommittedFrameRef.current.hasSignal;
        const statusChanged = nextStatus !== latestCommittedStatusRef.current;
        const errorChanged = nextError !== latestCommittedErrorRef.current;
        const intervalMs = liveOptionsRef.current.uiSnapshotIntervalMs;
        const intervalReached = intervalMs <= 0 || (now - lastUiCommitAtRef.current) >= intervalMs;

        if (!force && !noteChanged && !signalChanged && !statusChanged && !errorChanged && !intervalReached) {
            return;
        }

        latestCommittedFrameRef.current = nextFrame;
        latestCommittedStatusRef.current = nextStatus;
        latestCommittedErrorRef.current = nextError;
        lastUiCommitAtRef.current = now;

        if (!mountedRef.current) {
            return;
        }

        const commitSnapshot = () => {
            setFrame(nextFrame);
            setStatus(nextStatus);
            setError(nextError);
        };

        if (force) {
            commitSnapshot();
            return;
        }

        startTransition(commitSnapshot);
    }, []);

    const animateNeedle = useCallback((nextTargetCents: number, duration = TUNER_NEEDLE_RESPONSE_MS) => {
        const centeredTarget = Math.abs(nextTargetCents) <= TUNER_NEEDLE_CENTER_SNAP_CENTS ? 0 : nextTargetCents;
        const clampedTarget = clampTunerCents(centeredTarget, TUNER_MAX_NEEDLE_CENTS);
        const smoothed = smoothedNeedleCentsRef.current
            + ((clampedTarget - smoothedNeedleCentsRef.current) * TUNER_NEEDLE_SMOOTHING_FACTOR);

        smoothedNeedleCentsRef.current = smoothed;
        needleCents.value = withTiming(smoothed, { duration });
    }, [needleCents]);

    const centerNeedle = useCallback((duration = TUNER_NEEDLE_RETURN_MS) => {
        smoothedNeedleCentsRef.current = 0;
        needleCents.value = withTiming(0, { duration });
    }, [needleCents]);

    const clearNoSignalTimeout = useCallback(() => {
        if (noSignalTimeoutRef.current) {
            clearTimeout(noSignalTimeoutRef.current);
            noSignalTimeoutRef.current = null;
        }
    }, []);

    const resetSignalFrame = useCallback((
        nextStatus: TunerStatus,
        gateState: NativeGateState = 'buffering',
        confidence = 0,
        volume = -120,
        now = Date.now(),
    ) => {
        pitchHistoryRef.current = [];
        smoothedFrequencyRef.current = null;
        latestAcceptedFrameRef.current = EMPTY_FRAME;
        centerNeedle();
        confidenceValue.value = withTiming(0, { duration: TUNER_CONFIDENCE_FADE_MS });
        stabilityValue.value = withTiming(0, { duration: TUNER_STABILITY_FADE_MS });
        pushUiSnapshot({
            ...EMPTY_FRAME,
            confidence,
            volume,
            updatedAt: now,
            gateState,
        }, nextStatus, null, true, now);
    }, [centerNeedle, confidenceValue, pushUiSnapshot, stabilityValue]);

    const markNoSignal = useCallback((gateState: NativeGateState = 'buffering', confidence = 0, volume = -120, now = Date.now()) => {
        if (!isListeningRef.current) {
            return;
        }

        resetSignalFrame('no_signal', gateState, confidence, volume, now);
    }, [resetSignalFrame]);

    const scheduleNoSignalTimeout = useCallback(() => {
        clearNoSignalTimeout();

        noSignalTimeoutRef.current = setTimeout(() => {
            markNoSignal();
        }, noSignalTimeoutMs);
    }, [clearNoSignalTimeout, markNoSignal, noSignalTimeoutMs]);

    const applyFrame = useCallback((reading: TunerReading) => {
        const {
            calibrationHz: liveCalibrationHz,
            confidenceThreshold: liveConfidenceThreshold,
            minVolume: liveMinVolume,
            instrument: liveInstrument,
            targetMidi: liveTargetMidi,
            targetFrequency: liveTargetFrequency,
            minFrequencyHz: liveMinFrequencyHz,
            maxFrequencyHz: liveMaxFrequencyHz,
            frequencySmoothingFactor: liveFrequencySmoothingFactor,
        } = liveOptionsRef.current;
        const now = reading.timestamp;
        const volume = typeof reading.volumeDb === 'number' && Number.isFinite(reading.volumeDb) ? reading.volumeDb : -120;
        const confidence = typeof reading.confidence === 'number' && Number.isFinite(reading.confidence) ? reading.confidence : 1;
        const validPitch = isValidTunerFrequency(reading.frequencyHz, liveMinFrequencyHz, liveMaxFrequencyHz);
        const hasStrongConfidence = reading.confidence === undefined || confidence >= liveConfidenceThreshold;
        const hasStrongVolume = reading.volumeDb === undefined || volume >= liveMinVolume;
        const hasConfidentSignal = validPitch && hasStrongConfidence && hasStrongVolume;
        const gateState = reading.gateState ?? (
            !validPitch
                ? 'blocked-pitch'
                : volume < liveMinVolume
                    ? 'blocked-volume'
                    : confidence < liveConfidenceThreshold
                        ? 'blocked-confidence'
                        : 'active'
        );
        const analysisDurationMs = reading.analysisDurationMs ?? null;
        const nativeStableMidi = reading.stableMidi ?? null;

        if (hasConfidentSignal) {
            confidenceValue.value = withTiming(confidence, { duration: TUNER_CONFIDENCE_FADE_MS });
            stabilityValue.value = withTiming(1, { duration: TUNER_STABILITY_FADE_MS });
            const smoothedFrequency = smoothTunerFrequency(
                reading.frequencyHz,
                smoothedFrequencyRef.current,
                liveFrequencySmoothingFactor,
                liveMinFrequencyHz,
                liveMaxFrequencyHz,
            ) ?? reading.frequencyHz;
            smoothedFrequencyRef.current = smoothedFrequency;
            pitchHistoryRef.current = [...pitchHistoryRef.current, smoothedFrequency].slice(-TUNER_MEDIAN_PITCH_WINDOW);
            const stabilizedFrequency = median(pitchHistoryRef.current);
            const detected = frequencyToNote(stabilizedFrequency, liveCalibrationHz);
            const stableLookup = nativeStableMidi !== null
                ? MIDI_NOTE_LOOKUP[clamp(nativeStableMidi, 0, MIDI_NOTE_LOOKUP.length - 1)]
                : null;
            const detectedMidi = stableLookup?.midi ?? detected.midi;
            const detectedNoteName = stableLookup?.noteName ?? detected.noteName;
            const detectedNoteClass = stableLookup?.noteClass ?? detected.noteClass;
            const detectedReferenceFrequency = stableLookup
                ? midiToFrequency(stableLookup.midi, liveCalibrationHz)
                : midiToFrequency(detected.midi, liveCalibrationHz);
            const centsFromStableNote = calculateTunerCents(
                detected.frequency,
                detectedReferenceFrequency,
                liveMinFrequencyHz,
                liveMaxFrequencyHz,
            );
            const target = resolveTunerTarget(
                detected.frequency,
                liveInstrument,
                liveTargetMidi,
                liveTargetFrequency,
                liveCalibrationHz,
            );
            const targetCents = target
                ? calculateTunerCents(detected.frequency, target.frequency, liveMinFrequencyHz, liveMaxFrequencyHz)
                : detected.centsFromNote;

            const nextFrame = {
                frequency: detected.frequency,
                midi: detectedMidi,
                noteName: detectedNoteName,
                noteClass: detectedNoteClass,
                centsFromNote: centsFromStableNote,
                confidence,
                volume,
                updatedAt: now,
                hasSignal: true,
                gateState,
                analysisDurationMs,
                stableMidi: nativeStableMidi,
            };
            latestAcceptedFrameRef.current = nextFrame;
            animateNeedle(targetCents);
            scheduleNoSignalTimeout();
            pushUiSnapshot(nextFrame, 'listening', null, false, now);
            return;
        }

        if (!latestAcceptedFrameRef.current.frequency) {
            pushUiSnapshot({
                ...EMPTY_FRAME,
                confidence: 0,
                volume,
                updatedAt: now,
                gateState,
                analysisDurationMs,
            }, 'listening', null, false, now);
        }
    }, [animateNeedle, confidenceValue, pushUiSnapshot, scheduleNoSignalTimeout, stabilityValue]);

    const stop = useCallback(async () => {
        clearNoSignalTimeout();
        await detector.stop();

        isListeningRef.current = false;
        isStartingRef.current = false;
        pitchHistoryRef.current = [];
        smoothedFrequencyRef.current = null;
        centerNeedle();
        confidenceValue.value = withTiming(0, { duration: 80 });
        stabilityValue.value = withTiming(0, { duration: 80 });
        latestAcceptedFrameRef.current = EMPTY_FRAME;
        pushUiSnapshot(EMPTY_FRAME, 'idle', null, true);
    }, [centerNeedle, clearNoSignalTimeout, confidenceValue, detector, pushUiSnapshot, stabilityValue]);

    const start = useCallback(async () => {
        if (isStartingRef.current || isListeningRef.current) {
            return true;
        }

        if (!detector.isAvailable()) {
            pushUiSnapshot(EMPTY_FRAME, 'error', TUNER_NATIVE_MODULE_MESSAGE, true);
            return false;
        }

        isStartingRef.current = true;
        clearNoSignalTimeout();
        pushUiSnapshot(EMPTY_FRAME, 'checking_permission', null, true);

        try {
            const permissionStatus = microphonePermission.canRecord
                ? 'granted'
                : await microphonePermission.requestPermission();

            if (permissionStatus !== 'granted') {
                pushUiSnapshot(
                    EMPTY_FRAME,
                    'error',
                    getMicrophonePermissionMessage(permissionStatus)
                        ?? microphonePermission.errorMessage
                        ?? 'Microphone access is required for tuning and live scoring.',
                    true,
                );
                return false;
            }

            pushUiSnapshot(EMPTY_FRAME, 'starting', null, true);
            await detector.start(applyFrame);
            isListeningRef.current = true;
            scheduleNoSignalTimeout();
            pushUiSnapshot(latestAcceptedFrameRef.current, 'listening', null, true);
            return true;
        } catch {
            await detector.stop();
            clearNoSignalTimeout();
            pushUiSnapshot(
                EMPTY_FRAME,
                'error',
                TUNER_STARTUP_FAILURE_MESSAGE,
                true,
            );

            isListeningRef.current = false;
            return false;
        } finally {
            isStartingRef.current = false;
        }
    }, [applyFrame, clearNoSignalTimeout, detector, microphonePermission, pushUiSnapshot, scheduleNoSignalTimeout]);

    useEffect(() => {
        mountedRef.current = true;
        void microphonePermission.checkPermission();

        return () => {
            mountedRef.current = false;
        };
    }, [microphonePermission.checkPermission]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'background' || nextState === 'inactive') {
                void stop();
            }
        });

        return () => {
            subscription.remove();
        };
    }, [stop]);

    useEffect(() => {
        if (enabled) {
            void start();
        } else if (wasEnabledRef.current) {
            void stop();
        }

        wasEnabledRef.current = enabled;
    }, [enabled, start, stop]);

    useEffect(() => () => {
        void stop();
    }, [stop]);

    const target = useMemo(() => {
        return resolveTunerTarget(frame.frequency, instrument, targetMidi, targetFrequency, calibrationHz);
    }, [calibrationHz, frame.frequency, instrument, targetFrequency, targetMidi]);

    const targetCents = useMemo(() => {
        if (!frame.frequency) {
            return 0;
        }

        if (target) {
            return calculateTunerCents(frame.frequency, target.frequency, minFrequencyHz, maxFrequencyHz);
        }

        return frame.centsFromNote;
    }, [frame.centsFromNote, frame.frequency, maxFrequencyHz, minFrequencyHz, target]);

    useEffect(() => {
        const activeFrame = latestAcceptedFrameRef.current;
        if (!activeFrame.frequency || !isListeningRef.current) {
            return;
        }

        const nextTarget = resolveTunerTarget(
            activeFrame.frequency,
            instrument,
            targetMidi,
            targetFrequency,
            calibrationHz,
        );
        const nextTargetCents = nextTarget
            ? calculateTunerCents(activeFrame.frequency, nextTarget.frequency, minFrequencyHz, maxFrequencyHz)
            : activeFrame.centsFromNote;

        animateNeedle(nextTargetCents);
    }, [animateNeedle, calibrationHz, instrument, maxFrequencyHz, minFrequencyHz, targetFrequency, targetMidi]);

    const needleRotation = useDerivedValue(
        () => (needleCents.value / TUNER_MAX_NEEDLE_CENTS) * 88,
        [needleCents],
    );

    const inTuneValue = useDerivedValue(
        () => (Math.abs(needleCents.value) <= TUNER_IN_TUNE_CENTS ? 1 : 0),
        [needleCents],
    );

    const displayStatus = useMemo(() => {
        if (status === 'error') {
            return error ?? 'Tuner engine error.';
        }

        if (status === 'checking_permission') {
            return 'Checking microphone permission...';
        }

        if (status === 'starting') {
            return 'Starting microphone...';
        }

        if (status === 'idle' && !frame.hasSignal) {
            return 'Tap Start Listening to begin.';
        }

        if (status === 'no_signal' || !frame.frequency || !frame.hasSignal) {
            if (frame.gateState === 'blocked-volume') {
                return 'Listening, but the signal is still under the noise gate.';
            }

            if (frame.gateState === 'blocked-confidence') {
                return 'Listening, but the note is not stable enough yet.';
            }

            return 'Listening for a confident note...';
        }

        if (Math.abs(targetCents) <= TUNER_IN_TUNE_CENTS) {
            return `Locked on ${target?.noteName ?? frame.noteName}`;
        }

        return targetCents > 0
            ? `Sharp by ${Math.round(Math.abs(targetCents))} cents`
            : `Flat by ${Math.round(Math.abs(targetCents))} cents`;
    }, [error, frame.frequency, frame.gateState, frame.hasSignal, status, target, targetCents]);

    return {
        status,
        error,
        microphonePermissionStatus: microphonePermission.status,
        microphonePermissionMessage: microphonePermission.errorMessage,
        isNativeModuleAvailable: isDetectorAvailable,
        canAskPermissionAgain: microphonePermission.canAskAgain,
        isListening: isListeningRef.current,
        hasSignal: frame.hasSignal,
        frequency: frame.frequency,
        midi: frame.midi,
        noteName: frame.noteName,
        noteClass: frame.noteClass,
        confidence: frame.confidence,
        volume: frame.volume,
        cents: target ? targetCents : frame.centsFromNote,
        target,
        targetNoteName: target?.noteName ?? '--',
        targetFrequency: target?.frequency ?? null,
        targetCents,
        isInTune: Math.abs(targetCents) <= TUNER_IN_TUNE_CENTS && !!frame.frequency,
        displayStatus,
        diagnostics: {
            gateState: frame.gateState,
            analysisDurationMs: frame.analysisDurationMs,
            stableMidi: frame.stableMidi,
        },
        needleCents,
        confidenceValue,
        stabilityValue,
        needleRotation,
        inTuneValue,
        start,
        stop,
        checkMicrophonePermission: microphonePermission.checkPermission,
    };
}
