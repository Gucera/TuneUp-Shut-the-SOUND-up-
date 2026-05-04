import {
    calculateBassCents,
    calculateTunerCents,
    clampTunerCents,
    classifyTuning,
    getNearestGuitarString,
    getNearestBassString,
    isValidBassFrequency,
    isValidTunerFrequency,
    smoothTunerFrequency,
    STANDARD_BASS_STRINGS,
} from './tunerMath';

describe('tunerMath', () => {
    it('calculates cents relative to a target frequency', () => {
        expect(calculateTunerCents(110, 110)).toBeCloseTo(0, 5);
        expect(calculateTunerCents(112, 110)).toBeGreaterThan(0);
        expect(calculateTunerCents(108, 110)).toBeLessThan(0);
    });

    it('rejects invalid or out-of-guitar-range frequencies', () => {
        expect(isValidTunerFrequency(null)).toBe(false);
        expect(isValidTunerFrequency(0)).toBe(false);
        expect(isValidTunerFrequency(-82.41)).toBe(false);
        expect(isValidTunerFrequency(Number.NaN)).toBe(false);
        expect(isValidTunerFrequency(Number.POSITIVE_INFINITY)).toBe(false);
        expect(isValidTunerFrequency(39.9)).toBe(false);
        expect(isValidTunerFrequency(601)).toBe(false);
        expect(isValidTunerFrequency(82.41)).toBe(true);
    });

    it('clamps cents for safe needle display', () => {
        expect(clampTunerCents(80)).toBe(50);
        expect(clampTunerCents(-80)).toBe(-50);
        expect(clampTunerCents(12)).toBe(12);
        expect(clampTunerCents(Number.NaN)).toBe(0);
    });

    it('classifies tuning state from cents', () => {
        expect(classifyTuning(0)).toBe('in_tune');
        expect(classifyTuning(12)).toBe('close');
        expect(classifyTuning(-18)).toBe('flat');
        expect(classifyTuning(18)).toBe('sharp');
        expect(classifyTuning(Number.NaN)).toBe('no_signal');
    });

    it('selects the nearest standard guitar string', () => {
        expect(getNearestGuitarString(82.41)?.noteName).toBe('E2');
        expect(getNearestGuitarString(111)?.noteName).toBe('A2');
        expect(getNearestGuitarString(330)?.noteName).toBe('E4');
        expect(getNearestGuitarString(20)).toBeNull();
    });

    it('smooths frequency with a bounded exponential step', () => {
        expect(smoothTunerFrequency(100, null)).toBe(100);
        expect(smoothTunerFrequency(120, 100, 0.5)).toBe(110);
        expect(smoothTunerFrequency(Number.NaN, 100)).toBe(100);
    });

    it('defines standard bass tuner targets', () => {
        expect(STANDARD_BASS_STRINGS).toEqual([
            { id: 'bass-e', name: 'E', shortLabel: 'E', instructionLabel: 'E', note: 'E1', noteName: 'E1', frequency: 41.2, frequencyHz: 41.2, stringIndex: 0 },
            { id: 'bass-a', name: 'A', shortLabel: 'A', instructionLabel: 'A', note: 'A1', noteName: 'A1', frequency: 55.0, frequencyHz: 55.0, stringIndex: 1 },
            { id: 'bass-d', name: 'D', shortLabel: 'D', instructionLabel: 'D', note: 'D2', noteName: 'D2', frequency: 73.42, frequencyHz: 73.42, stringIndex: 2 },
            { id: 'bass-g', name: 'G', shortLabel: 'G', instructionLabel: 'G', note: 'G2', noteName: 'G2', frequency: 98.0, frequencyHz: 98.0, stringIndex: 3 },
        ]);
    });

    it('calculates bass cents against the selected target frequency', () => {
        expect(calculateBassCents(41.2, 41.2)).toBeCloseTo(0, 5);
        expect(calculateBassCents(42, 41.2)).toBeGreaterThan(0);
        expect(calculateBassCents(40.5, 41.2)).toBeLessThan(0);
    });

    it('rejects invalid or out-of-bass-range frequencies', () => {
        expect(isValidBassFrequency(null)).toBe(false);
        expect(isValidBassFrequency(0)).toBe(false);
        expect(isValidBassFrequency(-41.2)).toBe(false);
        expect(isValidBassFrequency(Number.NaN)).toBe(false);
        expect(isValidBassFrequency(Number.POSITIVE_INFINITY)).toBe(false);
        expect(isValidBassFrequency(29.9)).toBe(false);
        expect(isValidBassFrequency(251)).toBe(false);
        expect(isValidBassFrequency(41.2)).toBe(true);
    });

    it('selects the nearest standard bass string', () => {
        expect(getNearestBassString(41.2)?.noteName).toBe('E1');
        expect(getNearestBassString(56)?.noteName).toBe('A1');
        expect(getNearestBassString(98)?.noteName).toBe('G2');
        expect(getNearestBassString(20)).toBeNull();
    });

    it('smooths low bass frequencies with the bass range', () => {
        expect(smoothTunerFrequency(35, null, 0.5, 30, 500)).toBe(35);
        expect(smoothTunerFrequency(40, 35, 0.5, 30, 500)).toBe(37.5);
    });
});
