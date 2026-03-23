import { Buffer } from 'buffer';

export interface NoteInfo {
    name: string;
    noteClass: string;
    octave: number;
    cents: number;
    frequency: number;
    midi: number;
}

const NOTE_SEQUENCE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const A4_HZ = 440;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function findWavDataOffset(buffer: Buffer) {
    if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
        return 0;
    }

    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        const chunkStart = offset + 8;

        if (chunkId === 'data') {
            return chunkStart;
        }

        offset = chunkStart + chunkSize;
    }

    return 44;
}

export function getNearestNoteName(frequency: number) {
    return getNoteInfo(frequency).name;
}

export function getNoteInfo(frequency: number): NoteInfo {
    if (!Number.isFinite(frequency) || frequency <= 0) {
        return {
            name: '--',
            noteClass: '--',
            octave: 0,
            cents: 0,
            frequency: 0,
            midi: 0,
        };
    }

    const midiFloat = 69 + (12 * Math.log2(frequency / A4_HZ));
    const midi = clamp(Math.round(midiFloat), 0, 127);
    const noteClass = NOTE_SEQUENCE[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    const targetFrequency = A4_HZ * Math.pow(2, (midi - 69) / 12);
    const cents = 1200 * Math.log2(frequency / targetFrequency);

    return {
        name: `${noteClass}${octave}`,
        noteClass,
        octave,
        cents,
        frequency,
        midi,
    };
}

export function autoCorrelate(buffer: Float32Array, sampleRate: number, minFreq = 40, maxFreq = 1200) {
    if (!buffer.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
        return 0;
    }

    let rms = 0;
    for (let i = 0; i < buffer.length; i += 1) {
        rms += buffer[i] * buffer[i];
    }

    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.01) {
        return 0;
    }

    const minLag = Math.max(1, Math.floor(sampleRate / maxFreq));
    const maxLag = Math.max(minLag + 1, Math.floor(sampleRate / minFreq));
    let bestLag = -1;
    let bestCorrelation = Number.NEGATIVE_INFINITY;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
        let correlation = 0;

        for (let i = 0; i + lag < buffer.length; i += 1) {
            correlation += buffer[i] * buffer[i + lag];
        }

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestLag = lag;
        }
    }

    return bestLag > 0 ? sampleRate / bestLag : 0;
}

export function decodeAudioData(base64String: string): Float32Array {
    if (!base64String) {
        return new Float32Array(0);
    }

    const binary = Buffer.from(base64String, 'base64');
    const pcm = binary.slice(findWavDataOffset(binary));
    const sampleCount = Math.floor(pcm.length / 2);
    const samples = new Float32Array(sampleCount);

    for (let i = 0; i < sampleCount; i += 1) {
        const sample = pcm.readInt16LE(i * 2);
        samples[i] = sample / 32768;
    }

    return samples;
}

export function medianFrequency(values: number[]): number | null {
    if (!values.length) {
        return null;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 1) {
        return sorted[middle];
    }

    return (sorted[middle - 1] + sorted[middle]) / 2;
}
