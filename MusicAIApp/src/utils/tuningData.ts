export type InstrumentType = 'Guitar' | 'Bass' | 'Ukulele' | 'Drums';

interface StringData {
    name: string;
    freq: number;
}

interface ClosestStringResult {
    stringName: string;
    targetFreq: number;
    cents: number;
    diffHz: number;
    isPerfect: boolean;
    isClose: boolean;
}

export const TUNINGS: Record<Exclude<InstrumentType, 'Drums'>, StringData[]> = {
    Guitar: [
        { name: 'E2', freq: 82.41 },
        { name: 'A2', freq: 110.0 },
        { name: 'D3', freq: 146.83 },
        { name: 'G3', freq: 196.0 },
        { name: 'B3', freq: 246.94 },
        { name: 'E4', freq: 329.63 },
    ],
    Bass: [
        { name: 'E1', freq: 41.2 },
        { name: 'A1', freq: 55.0 },
        { name: 'D2', freq: 73.42 },
        { name: 'G2', freq: 98.0 },
    ],
    Ukulele: [
        { name: 'G4', freq: 392.0 },
        { name: 'C4', freq: 261.63 },
        { name: 'E4', freq: 329.63 },
        { name: 'A4', freq: 440.0 },
    ],
};

export function centsBetween(freq: number, targetFreq: number): number {
    return 1200 * Math.log2(freq / targetFreq);
}

export function instrumentPitchRange(instrument: InstrumentType) {
    switch (instrument) {
        case 'Bass':
            return { min: 30, max: 180 };
        case 'Ukulele':
            return { min: 180, max: 500 };
        case 'Drums':
            return { min: 40, max: 1200 };
        case 'Guitar':
        default:
            return { min: 60, max: 420 };
    }
}

export function getClosestString(freq: number, instrument: InstrumentType): ClosestStringResult {
    if (instrument === 'Drums') {
        return {
            stringName: '--',
            targetFreq: 0,
            cents: 0,
            diffHz: 0,
            isPerfect: false,
            isClose: false,
        };
    }

    const strings = TUNINGS[instrument];
    let closestString = strings[0];
    let smallestCents = Math.abs(centsBetween(freq, strings[0].freq));

    for (let i = 1; i < strings.length; i += 1) {
        const cents = Math.abs(centsBetween(freq, strings[i].freq));
        if (cents < smallestCents) {
            smallestCents = cents;
            closestString = strings[i];
        }
    }

    const cents = centsBetween(freq, closestString.freq);
    return {
        stringName: closestString.name,
        targetFreq: closestString.freq,
        cents,
        diffHz: freq - closestString.freq,
        isPerfect: Math.abs(cents) <= 5,
        isClose: Math.abs(cents) <= 15,
    };
}
