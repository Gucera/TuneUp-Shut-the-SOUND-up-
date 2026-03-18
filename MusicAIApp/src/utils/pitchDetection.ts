import { Buffer } from 'buffer';

const NOTE_STRINGS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface NoteInfo {
    name: string;
    octave: number;
    cents: number;
    midi: number;
}

function getPcmStartOffset(buffer: Buffer): number {
    const riff = buffer.toString('ascii', 0, 4);
    if (riff === 'RIFF') {
        let offset = 12;
        while (offset + 8 <= buffer.length) {
            const chunkId = buffer.toString('ascii', offset, offset + 4);
            const chunkSize = buffer.readUInt32LE(offset + 4);
            if (chunkId === 'data') {
                return offset + 8;
            }
            offset += 8 + chunkSize;
        }
    }

    return 0;
}

export function getNote(frequency: number): string {
    return getNoteInfo(frequency).name;
}

export function getNoteInfo(frequency: number): NoteInfo {
    const midi = Math.round(69 + (12 * Math.log2(frequency / 440)));
    const noteIndex = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const nearestFrequency = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = 1200 * Math.log2(frequency / nearestFrequency);

    return {
        name: `${NOTE_STRINGS[noteIndex]}${octave}`,
        octave,
        cents,
        midi,
    };
}

export function autoCorrelate(buffer: Float32Array, sampleRate: number, minFreq = 40, maxFreq = 1200) {
    let size = buffer.length;
    if (size < 512) {
        return -1;
    }

    let mean = 0;
    for (let i = 0; i < size; i += 1) {
        mean += buffer[i];
    }
    mean /= size;

    const prepared = new Float32Array(size);
    let rms = 0;
    for (let i = 0; i < size; i += 1) {
        const window = 0.5 - (0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
        const centered = (buffer[i] - mean) * window;
        prepared[i] = centered;
        rms += centered * centered;
    }

    rms = Math.sqrt(rms / size);
    if (rms < 0.008) {
        return -1;
    }

    const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
    const maxLag = Math.min(Math.floor(sampleRate / minFreq), size - 1);
    if (maxLag <= minLag) {
        return -1;
    }

    const correlations = new Float32Array(maxLag + 1);
    let bestLag = -1;
    let bestCorrelation = 0;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
        let difference = 0;
        const limit = size - lag;

        for (let i = 0; i < limit; i += 1) {
            difference += Math.abs(prepared[i] - prepared[i + lag]);
        }

        const correlation = 1 - (difference / limit);
        correlations[lag] = correlation;

        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestLag = lag;
        }
    }

    if (bestLag < 0 || bestCorrelation < 0.82) {
        return -1;
    }

    const prev = correlations[bestLag - 1] || correlations[bestLag];
    const center = correlations[bestLag];
    const next = correlations[bestLag + 1] || correlations[bestLag];
    const denom = (2 * center) - prev - next;
    const shift = denom !== 0 ? (next - prev) / (2 * denom) : 0;

    return sampleRate / (bestLag + shift);
}

export function decodeAudioData(base64String: string): Float32Array {
    if (!base64String) {
        return new Float32Array(0);
    }

    const buffer = Buffer.from(base64String, 'base64');
    const startOffset = getPcmStartOffset(buffer);
    const pcmLength = Math.floor((buffer.length - startOffset) / 2);
    const pcmValues = new Float32Array(pcmLength);

    for (let i = 0; i < pcmLength; i += 1) {
        const byteIndex = startOffset + (i * 2);
        pcmValues[i] = buffer.readInt16LE(byteIndex) / 32768;
    }

    return pcmValues;
}

export function medianFrequency(values: number[]): number | null {
    if (values.length === 0) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}
