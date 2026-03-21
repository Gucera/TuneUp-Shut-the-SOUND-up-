import { centsBetween, getClosestString, instrumentPitchRange } from './tuningData';

describe('tuningData', () => {
    describe('centsBetween', () => {
        it('returns 0 when the frequency matches the target exactly', () => {
            expect(centsBetween(110, 110)).toBe(0);
        });

        it('returns a positive value when the frequency is sharp', () => {
            expect(centsBetween(112, 110)).toBeGreaterThan(0);
        });

        it('returns a negative value when the frequency is flat', () => {
            expect(centsBetween(108, 110)).toBeLessThan(0);
        });
    });

    describe('instrumentPitchRange', () => {
        it('returns the expected guitar range', () => {
            expect(instrumentPitchRange('Guitar')).toEqual({ min: 60, max: 420 });
        });

        it('returns the expected bass range', () => {
            expect(instrumentPitchRange('Bass')).toEqual({ min: 30, max: 180 });
        });

        it('returns the expected ukulele range', () => {
            expect(instrumentPitchRange('Ukulele')).toEqual({ min: 180, max: 500 });
        });

        it('returns the expected drums range', () => {
            expect(instrumentPitchRange('Drums')).toEqual({ min: 40, max: 1200 });
        });
    });

    describe('getClosestString', () => {
        it('matches A2 for a perfectly tuned guitar A string', () => {
            expect(getClosestString(110, 'Guitar')).toEqual({
                stringName: 'A2',
                targetFreq: 110,
                cents: 0,
                diffHz: 0,
                isPerfect: true,
                isClose: true,
            });
        });

        it('matches E4 for a perfectly tuned ukulele E string', () => {
            expect(getClosestString(329.63, 'Ukulele')).toEqual({
                stringName: 'E4',
                targetFreq: 329.63,
                cents: 0,
                diffHz: 0,
                isPerfect: true,
                isClose: true,
            });
        });

        it('returns the drum placeholder object for drums', () => {
            expect(getClosestString(250, 'Drums')).toEqual({
                stringName: '--',
                targetFreq: 0,
                cents: 0,
                diffHz: 0,
                isPerfect: false,
                isClose: false,
            });
        });

        it('finds G2 as the closest bass string for a very high bass frequency', () => {
            const result = getClosestString(1000, 'Bass');

            expect(result.stringName).toBe('G2');
            expect(result.targetFreq).toBe(98);
            expect(result.diffHz).toBe(902);
            expect(result.cents).toBeGreaterThan(0);
            expect(result.isPerfect).toBe(false);
            expect(result.isClose).toBe(false);
        });

        it('surfaces non-finite cents for an invalid zero frequency input', () => {
            const result = getClosestString(0, 'Guitar');

            expect(result.stringName).toBe('E2');
            expect(result.targetFreq).toBe(82.41);
            expect(result.diffHz).toBeCloseTo(-82.41, 5);
            expect(Number.isFinite(result.cents)).toBe(false);
            expect(result.isPerfect).toBe(false);
            expect(result.isClose).toBe(false);
        });
    });
});
