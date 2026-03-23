import { Buffer } from 'buffer';
import { decodeAudioData, getNoteInfo, medianFrequency } from './pitchDetection';

function createPcmBase64(samples: number[]) {
    const buffer = Buffer.alloc(samples.length * 2);

    samples.forEach((sample, index) => {
        buffer.writeInt16LE(sample, index * 2);
    });

    return buffer.toString('base64');
}

describe('pitchDetection compatibility utils', () => {
    it('maps 440 Hz to A4', () => {
        expect(getNoteInfo(440)).toMatchObject({
            name: 'A4',
            noteClass: 'A',
            octave: 4,
            midi: 69,
        });
    });

    it('returns null for an empty median set', () => {
        expect(medianFrequency([])).toBeNull();
    });

    it('returns the median frequency for an odd set', () => {
        expect(medianFrequency([500, 100, 300])).toBe(300);
    });

    it('decodes pcm16 base64 samples into floats', () => {
        const decoded = decodeAudioData(createPcmBase64([32767, -32768, 0]));

        expect(decoded).toHaveLength(3);
        expect(decoded[0]).toBeCloseTo(0.9999, 3);
        expect(decoded[1]).toBe(-1);
        expect(decoded[2]).toBe(0);
    });
});
