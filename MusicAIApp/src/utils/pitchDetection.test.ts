import { Buffer } from 'buffer';
import { decodeAudioData, getNoteInfo, medianFrequency } from './pitchDetection';

function createPcmBase64(samples: number[]) {
    const pcmBuffer = Buffer.alloc(samples.length * 2);

    samples.forEach((sample, index) => {
        pcmBuffer.writeInt16LE(sample, index * 2);
    });

    return pcmBuffer.toString('base64');
}

function createWavBase64(samples: number[], sampleRate = 44100) {
    const dataSize = samples.length * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    samples.forEach((sample, index) => {
        buffer.writeInt16LE(sample, 44 + (index * 2));
    });

    return buffer.toString('base64');
}

describe('pitchDetection', () => {
    describe('getNoteInfo', () => {
        it('returns A4 for 440 Hz', () => {
            expect(getNoteInfo(440)).toEqual({
                name: 'A4',
                octave: 4,
                cents: 0,
                midi: 69,
            });
        });

        it('returns C4 for 261.63 Hz', () => {
            const result = getNoteInfo(261.63);

            expect(result.name).toBe('C4');
            expect(result.octave).toBe(4);
            expect(result.midi).toBe(60);
            expect(result.cents).toBeCloseTo(0, 0);
        });

        it('returns A#4 for 466.16 Hz', () => {
            const result = getNoteInfo(466.16);

            expect(result.name).toBe('A#4');
            expect(result.octave).toBe(4);
            expect(result.midi).toBe(70);
            expect(result.cents).toBeCloseTo(0, 0);
        });

        it('surfaces invalid numeric output for a zero frequency', () => {
            const result = getNoteInfo(0);

            expect(Number.isFinite(result.midi)).toBe(false);
            expect(Number.isFinite(result.octave)).toBe(false);
            expect(Number.isNaN(result.cents)).toBe(true);
            expect(result.name).toContain('undefined');
        });
    });

    describe('medianFrequency', () => {
        it('returns the only value for a single-item array', () => {
            expect(medianFrequency([440])).toBe(440);
        });

        it('returns the middle value for an odd-length array', () => {
            expect(medianFrequency([440, 445, 435])).toBe(440);
        });

        it('returns the average of the two middle values for an even-length array', () => {
            expect(medianFrequency([100, 200, 300, 400])).toBe(250);
        });

        it('sorts before finding the median', () => {
            expect(medianFrequency([500, 100, 300])).toBe(300);
        });

        it('returns null for an empty array', () => {
            expect(medianFrequency([])).toBeNull();
        });
    });

    describe('decodeAudioData', () => {
        it('returns an empty Float32Array for an empty input string', () => {
            expect(decodeAudioData('')).toEqual(new Float32Array(0));
        });

        it('decodes a WAV payload and skips the header', () => {
            const decoded = decodeAudioData(createWavBase64([0]));

            expect(decoded).toHaveLength(1);
            expect(decoded[0]).toBe(0);
        });

        it('decodes the max positive 16-bit PCM sample', () => {
            const decoded = decodeAudioData(createPcmBase64([32767]));

            expect(decoded).toHaveLength(1);
            expect(decoded[0]).toBeCloseTo(32767 / 32768, 6);
        });

        it('decodes the min negative 16-bit PCM sample', () => {
            const decoded = decodeAudioData(createPcmBase64([-32768]));

            expect(decoded).toHaveLength(1);
            expect(decoded[0]).toBe(-1);
        });
    });
});
