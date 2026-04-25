import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { TurboModuleRegistry } from 'react-native';
import type { PitchyAlgorithm, PitchyEvent } from 'react-native-pitchy';
import {
    DerivedValue,
    SharedValue,
    useDerivedValue,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { centsBetween, InstrumentType, TUNINGS } from '../utils/tuningData';

export const TUNER_A4_HZ = 440;
export const TUNER_BUFFER_SIZE = 2048;
export const TUNER_MIN_VOLUME_DB = -58;
export const TUNER_CONFIDENCE_THRESHOLD = 0.8;
export const TUNER_IN_TUNE_CENTS = 5;
export const TUNER_TARGET_TOLERANCE_CENTS = 18;
export const TUNER_MAX_NEEDLE_CENTS = 50;
export const TUNER_SIGNAL_HOLD_MS = 180;
export const TUNER_NATIVE_MODULE_MESSAGE = 'Pitchy is not available in this app binary yet. Expo Go cannot load this native module; rebuild the app with a development build or native run.';
export const TUNER_VISUAL_REFRESH_MS = 66;

const PITCHY_ALGORITHM: PitchyAlgorithm = 'MPM';
const NOTE_SEQUENCE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const GUITAR_TAB_OPEN_MIDI = [64, 59, 55, 50, 45, 40] as const;
const TARGET_INSTRUMENTS: TunerInstrument[] = ['Guitar', 'Bass', 'Ukulele', 'Chromatic'];
const TUNER_AUDIO_MODE = {
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
} as const;
const DEFAULT_AUDIO_MODE = {
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
} as const;
const TUNER_NEEDLE_RESPONSE_MS = 34;
const TUNER_NEEDLE_RETURN_MS = 120;
const TUNER_CONFIDENCE_FADE_MS = 48;
const TUNER_STABILITY_FADE_MS = 90;
const TUNER_NEEDLE_SMOOTHING_FACTOR = 0.38;
const TUNER_NEEDLE_CENTER_SNAP_CENTS = 0.45;
const TUNER_MEDIAN_PITCH_WINDOW = 5;

export type NativeGateState =
    | 'buffering'
    | 'active'
    | 'blocked-volume'
    | 'blocked-confidence'
    | 'blocked-pitch'
    | 'holding';

export type TunerInstrument = Exclude<InstrumentType, 'Drums'> | 'Chromatic';
export type TunerStatus = 'idle' | 'starting' | 'listening' | 'holding' | 'no-signal' | 'permission-denied' | 'error';

export interface GuitarStringTarget {
    id: string;
    shortLabel: string;
    instructionLabel: string;
    noteName: string;
    frequency: number;
}

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
    uiSnapshotIntervalMs?: number;
}

export interface UseTunerResult {
    status: TunerStatus;
    error: string | null;
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
}

export const GUITAR_STANDARD_STRINGS: GuitarStringTarget[] = [
    { id: 'low-e', shortLabel: 'E', instructionLabel: 'Low E', noteName: 'E2', frequency: 82.41 },
    { id: 'a', shortLabel: 'A', instructionLabel: 'A', noteName: 'A2', frequency: 110.0 },
    { id: 'd', shortLabel: 'D', instructionLabel: 'D', noteName: 'D3', frequency: 146.83 },
    { id: 'g', shortLabel: 'G', instructionLabel: 'G', noteName: 'G3', frequency: 196.0 },
    { id: 'b', shortLabel: 'B', instructionLabel: 'B', noteName: 'B3', frequency: 246.94 },
    { id: 'high-e', shortLabel: 'e', instructionLabel: 'High E', noteName: 'E4', frequency: 329.63 },
];

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

interface NativePitchyEvent extends PitchyEvent {
    gateState?: NativeGateState;
    analysisDurationMs?: number;
    stableMidi?: number;
    stabilizedPitch?: number;
}

interface NativePitchyModule {
    init: (config?: {
        algorithm?: PitchyAlgorithm;
        bufferSize?: number;
        minVolume?: number;
    }) => void;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    isRecording: () => Promise<boolean>;
    addListener: (callback: (event: PitchyEvent) => void) => { remove: () => void };
}

let cachedPitchyModule: NativePitchyModule | null | undefined;

function getPitchyModule(): NativePitchyModule | null {
    if (cachedPitchyModule !== undefined) {
        return cachedPitchyModule;
    }

    if (!TurboModuleRegistry.get('Pitchy')) {
        cachedPitchyModule = null;
        return cachedPitchyModule;
    }

    try {
        // The native module is only safe to require once we know the TurboModule is registered.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const loadedModule = require('react-native-pitchy') as { default?: NativePitchyModule };
        cachedPitchyModule = loadedModule.default ?? null;
    } catch {
        cachedPitchyModule = null;
    }

    return cachedPitchyModule;
}

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
    return 1200 * Math.log2(pitch / targetFrequency);
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
    uiSnapshotIntervalMs = 0,
}: UseTunerOptions = {}): UseTunerResult {
    const pitchyModule = getPitchyModule();
    const [permissionResponse, requestPermission] = Audio.usePermissions();
    const [status, setStatus] = useState<TunerStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [frame, setFrame] = useState<PitchFrame>(EMPTY_FRAME);

    const subscriptionRef = useRef<{ remove: () => void } | null>(null);
    const isListeningRef = useRef(false);
    const isStartingRef = useRef(false);
    const configuredRef = useRef(false);
    const latestAcceptedFrameRef = useRef<PitchFrame>(EMPTY_FRAME);
    const latestCommittedFrameRef = useRef<PitchFrame>(EMPTY_FRAME);
    const latestCommittedStatusRef = useRef<TunerStatus>('idle');
    const latestCommittedErrorRef = useRef<string | null>(null);
    const lastUiCommitAtRef = useRef(0);
    const pitchHistoryRef = useRef<number[]>([]);
    const smoothedNeedleCentsRef = useRef(0);
    const liveOptionsRef = useRef({
        calibrationHz,
        confidenceThreshold,
        minVolume,
        instrument,
        targetMidi,
        targetFrequency,
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
            uiSnapshotIntervalMs,
        };
    }, [calibrationHz, confidenceThreshold, instrument, minVolume, targetFrequency, targetMidi, uiSnapshotIntervalMs]);

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

        startTransition(() => {
            setFrame(nextFrame);
            setStatus(nextStatus);
            setError(nextError);
        });
    }, []);

    const animateNeedle = useCallback((nextTargetCents: number, duration = TUNER_NEEDLE_RESPONSE_MS) => {
        const centeredTarget = Math.abs(nextTargetCents) <= TUNER_NEEDLE_CENTER_SNAP_CENTS ? 0 : nextTargetCents;
        const clampedTarget = clamp(centeredTarget, -TUNER_MAX_NEEDLE_CENTS, TUNER_MAX_NEEDLE_CENTS);
        const smoothed = smoothedNeedleCentsRef.current
            + ((clampedTarget - smoothedNeedleCentsRef.current) * TUNER_NEEDLE_SMOOTHING_FACTOR);

        smoothedNeedleCentsRef.current = smoothed;
        needleCents.value = withTiming(smoothed, { duration });
    }, [needleCents]);

    const centerNeedle = useCallback((duration = TUNER_NEEDLE_RETURN_MS) => {
        smoothedNeedleCentsRef.current = 0;
        needleCents.value = withTiming(0, { duration });
    }, [needleCents]);

    const applyFrame = useCallback((event: PitchyEvent) => {
        const nativeEvent = event as NativePitchyEvent;
        const {
            calibrationHz: liveCalibrationHz,
            confidenceThreshold: liveConfidenceThreshold,
            minVolume: liveMinVolume,
            instrument: liveInstrument,
            targetMidi: liveTargetMidi,
            targetFrequency: liveTargetFrequency,
        } = liveOptionsRef.current;
        const now = Date.now();
        const volume = Number.isFinite(event.volume) ? event.volume : -120;
        const confidence = Number.isFinite(event.confidence) ? event.confidence : 0;
        const sourcePitch = Number.isFinite(nativeEvent.stabilizedPitch) && (nativeEvent.stabilizedPitch ?? 0) > 0
            ? nativeEvent.stabilizedPitch ?? 0
            : event.pitch;
        const validPitch = Number.isFinite(sourcePitch) && sourcePitch > 0;
        const hasConfidentSignal = validPitch && confidence >= liveConfidenceThreshold && volume >= liveMinVolume;
        const gateState = nativeEvent.gateState ?? (
            !validPitch
                ? 'blocked-pitch'
                : volume < liveMinVolume
                    ? 'blocked-volume'
                    : confidence < liveConfidenceThreshold
                        ? 'blocked-confidence'
                        : 'active'
        );
        const analysisDurationMs = Number.isFinite(nativeEvent.analysisDurationMs)
            ? nativeEvent.analysisDurationMs ?? null
            : null;
        const nativeStableMidi = Number.isFinite(nativeEvent.stableMidi) ? Math.round(nativeEvent.stableMidi ?? 0) : null;

        confidenceValue.value = withTiming(hasConfidentSignal ? confidence : 0, { duration: TUNER_CONFIDENCE_FADE_MS });
        stabilityValue.value = withTiming(hasConfidentSignal ? 1 : 0, { duration: TUNER_STABILITY_FADE_MS });

        let nextFrame = EMPTY_FRAME;
        let nextStatus: TunerStatus = 'no-signal';

        if (hasConfidentSignal) {
            pitchHistoryRef.current = [...pitchHistoryRef.current, sourcePitch].slice(-TUNER_MEDIAN_PITCH_WINDOW);
            const stabilizedFrequency = nativeEvent.stabilizedPitch ?? median(pitchHistoryRef.current);
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
            const centsFromStableNote = 1200 * Math.log2(detected.frequency / detectedReferenceFrequency);
            const target = resolveTunerTarget(
                detected.frequency,
                liveInstrument,
                liveTargetMidi,
                liveTargetFrequency,
                liveCalibrationHz,
            );
            const targetCents = target
                ? calculateCentsOffset(detected.frequency, target.frequency)
                : detected.centsFromNote;

            nextFrame = {
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
            nextStatus = 'listening';
            animateNeedle(targetCents);
        } else {
            const heldFrame = latestAcceptedFrameRef.current;
            if (
                heldFrame.frequency
                && (now - heldFrame.updatedAt) <= TUNER_SIGNAL_HOLD_MS
            ) {
                nextFrame = {
                    ...heldFrame,
                    confidence,
                    volume,
                    hasSignal: false,
                    gateState: 'holding',
                    analysisDurationMs,
                };
                nextStatus = 'holding';
            } else {
                pitchHistoryRef.current = [];
                latestAcceptedFrameRef.current = EMPTY_FRAME;
                nextFrame = {
                    ...EMPTY_FRAME,
                    confidence,
                    volume,
                    updatedAt: now,
                    gateState,
                    analysisDurationMs,
                };
                nextStatus = 'no-signal';
                centerNeedle();
            }
        }

        pushUiSnapshot(nextFrame, nextStatus, null, false, now);
    }, [animateNeedle, centerNeedle, confidenceValue, pushUiSnapshot, stabilityValue]);

    const stop = useCallback(async () => {
        if (subscriptionRef.current) {
            subscriptionRef.current.remove();
            subscriptionRef.current = null;
        }

        try {
            const recording = pitchyModule ? await pitchyModule.isRecording() : false;
            if (recording && pitchyModule) {
                await pitchyModule.stop();
            }
        } catch {
            // The native engine can already be stopped when the screen unmounts quickly.
        }

        isListeningRef.current = false;
        pitchHistoryRef.current = [];
        centerNeedle();
        confidenceValue.value = withTiming(0, { duration: 80 });
        stabilityValue.value = withTiming(0, { duration: 80 });
        latestAcceptedFrameRef.current = EMPTY_FRAME;
        pushUiSnapshot(EMPTY_FRAME, 'idle', null, true);

        await Audio.setAudioModeAsync(DEFAULT_AUDIO_MODE);
    }, [centerNeedle, confidenceValue, pitchyModule, pushUiSnapshot, stabilityValue]);

    const start = useCallback(async () => {
        if (isStartingRef.current || isListeningRef.current) {
            return true;
        }

        if (!pitchyModule) {
            pushUiSnapshot(EMPTY_FRAME, 'error', TUNER_NATIVE_MODULE_MESSAGE, true);
            return false;
        }

        isStartingRef.current = true;
        pushUiSnapshot(EMPTY_FRAME, 'starting', null, true);

        try {
            const permission = permissionResponse?.status === 'granted'
                ? permissionResponse
                : await requestPermission();

            if (permission.status !== 'granted') {
                pushUiSnapshot(EMPTY_FRAME, 'permission-denied', 'Microphone permission is required for the zero-lag tuner.', true);
                return false;
            }

            await Audio.setAudioModeAsync(TUNER_AUDIO_MODE);

            if (!configuredRef.current) {
                pitchyModule.init({
                    algorithm: PITCHY_ALGORITHM,
                    bufferSize,
                    minVolume,
                });
                configuredRef.current = true;
            }

            if (!subscriptionRef.current) {
                subscriptionRef.current = pitchyModule.addListener(applyFrame);
            }

            await pitchyModule.start();
            isListeningRef.current = true;
            pushUiSnapshot(latestAcceptedFrameRef.current, 'listening', null, true);
            return true;
        } catch (nextError) {
            const message = nextError instanceof Error
                ? nextError.message
                : 'The native tuner engine could not start.';
            pushUiSnapshot(EMPTY_FRAME, 'error', message, true);

            if (subscriptionRef.current) {
                subscriptionRef.current.remove();
                subscriptionRef.current = null;
            }

            return false;
        } finally {
            isStartingRef.current = false;
        }
    }, [applyFrame, bufferSize, minVolume, permissionResponse, pitchyModule, pushUiSnapshot, requestPermission]);

    useEffect(() => {
        if (enabled) {
            void start();
            return () => {
                void stop();
            };
        }

        void stop();
        return undefined;
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
            return calculateCentsOffset(frame.frequency, target.frequency);
        }

        return frame.centsFromNote;
    }, [frame.centsFromNote, frame.frequency, target]);

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
            ? calculateCentsOffset(activeFrame.frequency, nextTarget.frequency)
            : activeFrame.centsFromNote;

        animateNeedle(nextTargetCents);
    }, [animateNeedle, calibrationHz, instrument, targetFrequency, targetMidi]);

    const needleRotation = useDerivedValue(
        () => (needleCents.value / TUNER_MAX_NEEDLE_CENTS) * 88,
        [needleCents],
    );

    const inTuneValue = useDerivedValue(
        () => (Math.abs(needleCents.value) <= TUNER_IN_TUNE_CENTS ? 1 : 0),
        [needleCents],
    );

    const displayStatus = useMemo(() => {
        if (status === 'permission-denied') {
            return permissionResponse?.canAskAgain === false
                ? 'Microphone access is off. Open Settings to enable the tuner.'
                : 'Microphone permission is required.';
        }

        if (status === 'error') {
            return error ?? 'Tuner engine error.';
        }

        if (status === 'starting') {
            return 'Starting zero-lag tuner...';
        }

        if (status === 'idle') {
            return 'Tap Start Listening to begin.';
        }

        if (!frame.frequency || !frame.hasSignal) {
            if (status === 'holding' && latestAcceptedFrameRef.current.noteName !== '--') {
                return `Holding ${latestAcceptedFrameRef.current.noteName}`;
            }

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
    }, [error, frame.frequency, frame.gateState, frame.hasSignal, frame.noteName, permissionResponse?.canAskAgain, status, target, targetCents]);

    return {
        status,
        error,
        isNativeModuleAvailable: !!pitchyModule,
        canAskPermissionAgain: permissionResponse?.canAskAgain ?? true,
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
    };
}
