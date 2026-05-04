export const TUNER_MIN_FREQUENCY_HZ = 40;
export const TUNER_MAX_FREQUENCY_HZ = 600;
export const BASS_TUNER_MIN_FREQUENCY_HZ = 30;
export const BASS_TUNER_MAX_FREQUENCY_HZ = 250;
export const TUNER_MAX_NEEDLE_CENTS = 50;
export const TUNER_IN_TUNE_CENTS = 5;
export const TUNER_CLOSE_CENTS = 15;

export type TuningClassification = 'in_tune' | 'close' | 'flat' | 'sharp' | 'no_signal';

export interface GuitarStringTarget {
    id: string;
    name: string;
    shortLabel: string;
    instructionLabel: string;
    note: string;
    noteName: string;
    frequency: number;
    frequencyHz: number;
    stringIndex: number;
}

export const STANDARD_GUITAR_STRINGS: GuitarStringTarget[] = [
    { id: 'low-e', name: 'E', shortLabel: 'E', instructionLabel: 'Low E', note: 'E2', noteName: 'E2', frequency: 82.41, frequencyHz: 82.41, stringIndex: 0 },
    { id: 'a', name: 'A', shortLabel: 'A', instructionLabel: 'A', note: 'A2', noteName: 'A2', frequency: 110.0, frequencyHz: 110.0, stringIndex: 1 },
    { id: 'd', name: 'D', shortLabel: 'D', instructionLabel: 'D', note: 'D3', noteName: 'D3', frequency: 146.83, frequencyHz: 146.83, stringIndex: 2 },
    { id: 'g', name: 'G', shortLabel: 'G', instructionLabel: 'G', note: 'G3', noteName: 'G3', frequency: 196.0, frequencyHz: 196.0, stringIndex: 3 },
    { id: 'b', name: 'B', shortLabel: 'B', instructionLabel: 'B', note: 'B3', noteName: 'B3', frequency: 246.94, frequencyHz: 246.94, stringIndex: 4 },
    { id: 'high-e', name: 'e', shortLabel: 'e', instructionLabel: 'High E', note: 'E4', noteName: 'E4', frequency: 329.63, frequencyHz: 329.63, stringIndex: 5 },
];

export const STANDARD_BASS_STRINGS: GuitarStringTarget[] = [
    { id: 'bass-e', name: 'E', shortLabel: 'E', instructionLabel: 'E', note: 'E1', noteName: 'E1', frequency: 41.2, frequencyHz: 41.2, stringIndex: 0 },
    { id: 'bass-a', name: 'A', shortLabel: 'A', instructionLabel: 'A', note: 'A1', noteName: 'A1', frequency: 55.0, frequencyHz: 55.0, stringIndex: 1 },
    { id: 'bass-d', name: 'D', shortLabel: 'D', instructionLabel: 'D', note: 'D2', noteName: 'D2', frequency: 73.42, frequencyHz: 73.42, stringIndex: 2 },
    { id: 'bass-g', name: 'G', shortLabel: 'G', instructionLabel: 'G', note: 'G2', noteName: 'G2', frequency: 98.0, frequencyHz: 98.0, stringIndex: 3 },
];

export function isValidTunerFrequency(
    value: unknown,
    minFrequencyHz = TUNER_MIN_FREQUENCY_HZ,
    maxFrequencyHz = TUNER_MAX_FREQUENCY_HZ,
) {
    return typeof value === 'number'
        && Number.isFinite(value)
        && value >= minFrequencyHz
        && value <= maxFrequencyHz;
}

export function isValidBassFrequency(value: unknown) {
    return isValidTunerFrequency(value, BASS_TUNER_MIN_FREQUENCY_HZ, BASS_TUNER_MAX_FREQUENCY_HZ);
}

export function calculateTunerCents(
    detectedFrequencyHz: number,
    targetFrequencyHz: number,
    minFrequencyHz = TUNER_MIN_FREQUENCY_HZ,
    maxFrequencyHz = TUNER_MAX_FREQUENCY_HZ,
) {
    if (
        !isValidTunerFrequency(detectedFrequencyHz, minFrequencyHz, maxFrequencyHz)
        || !isValidTunerFrequency(targetFrequencyHz, minFrequencyHz, maxFrequencyHz)
    ) {
        return 0;
    }

    return 1200 * Math.log2(detectedFrequencyHz / targetFrequencyHz);
}

export function clampTunerCents(cents: number, limit = TUNER_MAX_NEEDLE_CENTS) {
    if (!Number.isFinite(cents)) {
        return 0;
    }

    return Math.max(-limit, Math.min(limit, cents));
}

export function classifyTuning(cents: number | null | undefined): TuningClassification {
    if (typeof cents !== 'number' || !Number.isFinite(cents)) {
        return 'no_signal';
    }

    const absoluteCents = Math.abs(cents);

    if (absoluteCents <= TUNER_IN_TUNE_CENTS) {
        return 'in_tune';
    }

    if (absoluteCents <= TUNER_CLOSE_CENTS) {
        return 'close';
    }

    return cents < 0 ? 'flat' : 'sharp';
}

export function getNearestGuitarString(frequencyHz: number) {
    if (!isValidTunerFrequency(frequencyHz)) {
        return null;
    }

    return STANDARD_GUITAR_STRINGS.slice(1).reduce((best, candidate) => {
        const bestCents = Math.abs(calculateTunerCents(frequencyHz, best.frequencyHz));
        const candidateCents = Math.abs(calculateTunerCents(frequencyHz, candidate.frequencyHz));
        return candidateCents < bestCents ? candidate : best;
    }, STANDARD_GUITAR_STRINGS[0]);
}

export function getNearestBassString(frequencyHz: number) {
    if (!isValidBassFrequency(frequencyHz)) {
        return null;
    }

    return STANDARD_BASS_STRINGS.slice(1).reduce((best, candidate) => {
        const bestCents = Math.abs(calculateBassCents(frequencyHz, best.frequencyHz));
        const candidateCents = Math.abs(calculateBassCents(frequencyHz, candidate.frequencyHz));
        return candidateCents < bestCents ? candidate : best;
    }, STANDARD_BASS_STRINGS[0]);
}

export function calculateBassCents(detectedFrequencyHz: number, targetFrequencyHz: number) {
    return calculateTunerCents(
        detectedFrequencyHz,
        targetFrequencyHz,
        BASS_TUNER_MIN_FREQUENCY_HZ,
        BASS_TUNER_MAX_FREQUENCY_HZ,
    );
}

export function smoothTunerFrequency(
    nextFrequencyHz: number,
    previousFrequencyHz: number | null,
    smoothingFactor = 0.35,
    minFrequencyHz = TUNER_MIN_FREQUENCY_HZ,
    maxFrequencyHz = TUNER_MAX_FREQUENCY_HZ,
) {
    if (!isValidTunerFrequency(nextFrequencyHz, minFrequencyHz, maxFrequencyHz)) {
        return previousFrequencyHz;
    }

    if (!previousFrequencyHz || !isValidTunerFrequency(previousFrequencyHz, minFrequencyHz, maxFrequencyHz)) {
        return nextFrequencyHz;
    }

    const safeFactor = Math.max(0, Math.min(1, smoothingFactor));
    return previousFrequencyHz + ((nextFrequencyHz - previousFrequencyHz) * safeFactor);
}
