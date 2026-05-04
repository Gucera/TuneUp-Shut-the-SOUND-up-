import { parseSongManifestJson, validateSongManifest } from './manifestValidation';

describe('validateSongManifest', () => {
    it('passes a valid manifest with chordEvents', () => {
        const result = validateSongManifest({
            title: 'Synthetic Chords',
            chordEvents: [
                { timeSec: 2, chord: 'G', laneRow: 0 },
                { timeSec: 0, chord: 'Em', laneRow: 2 },
            ],
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.chordEvents.map((event) => event.timeSec)).toEqual([0, 2]);
            expect(result.value.tabNotes).toEqual([]);
        }
    });

    it('passes a valid manifest with tabNotes', () => {
        const result = validateSongManifest({
            title: 'Synthetic Tabs',
            tabNotes: [
                { timeSec: 0, stringIndex: 0, fret: 3, durationSec: 0.5 },
            ],
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.chordEvents).toEqual([]);
            expect(result.value.tabNotes[0].stringIndex).toBe(0);
        }
    });

    it('fails when playable arrays are missing', () => {
        const result = validateSongManifest({ title: 'Empty' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('Manifest must contain at least one chord event or tab note.');
        }
    });

    it('fails when playable arrays are empty', () => {
        const result = validateSongManifest({ chordEvents: [], tabNotes: [] });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('Manifest must contain at least one chord event or tab note.');
        }
    });

    it('fails invalid JSON safely', () => {
        const result = parseSongManifestJson('{not-json');

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors[0]).toContain('not valid JSON');
        }
    });

    it('fails invalid laneRow', () => {
        const result = validateSongManifest({
            chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 4 }],
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('chordEvents[0].laneRow must be an integer between 0 and 3.');
        }
    });

    it('fails invalid stringIndex', () => {
        const result = validateSongManifest({
            tabNotes: [{ timeSec: 0, stringIndex: 6, fret: 1 }],
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('tabNotes[0].stringIndex must be an integer between 0 and 5.');
        }
    });

    it('fails negative event time', () => {
        const result = validateSongManifest({
            chordEvents: [{ timeSec: -1, chord: 'C', laneRow: 1 }],
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('chordEvents[0].timeSec must be a finite number >= 0.');
        }
    });

    it('fails non-object top-level JSON', () => {
        const result = validateSongManifest([]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('Song manifest must be a JSON object.');
        }
    });

    it('fails malformed markers when present', () => {
        const result = validateSongManifest({
            tabNotes: [{ timeSec: 0, stringIndex: 1, fret: 0 }],
            markers: [{ label: 'Verse' }],
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('markers[0].timeSec must be a finite number >= 0.');
        }
    });

    it('accepts guitar tuning metadata with six string notes', () => {
        const result = validateSongManifest({
            instrument: 'guitar',
            tuning: {
                id: 'guitar_drop_c_sharp',
                name: 'Drop C#',
                stringNotes: ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'],
            },
            tabNotes: [{ timeSec: 0, stringIndex: 5, fret: 0 }],
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.tuning?.name).toBe('Drop C#');
        }
    });

    it('rejects guitar tuning metadata with the wrong string count', () => {
        const result = validateSongManifest({
            instrument: 'guitar',
            tuning: {
                id: 'broken',
                name: 'Broken',
                stringNotes: ['E1', 'A1', 'D2', 'G2'],
            },
            tabNotes: [{ timeSec: 0, stringIndex: 0, fret: 0 }],
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toContain('guitar tuning.stringNotes must contain exactly 6 strings.');
        }
    });

    it('accepts bass tuning metadata with four string notes', () => {
        const result = validateSongManifest({
            instrument: 'bass',
            tuning: {
                id: 'bass_standard',
                name: 'Standard Bass',
                stringNotes: ['E1', 'A1', 'D2', 'G2'],
            },
            tabNotes: [{ timeSec: 0, stringIndex: 0, fret: 0 }],
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.tuning?.stringNotes).toEqual(['E1', 'A1', 'D2', 'G2']);
        }
    });
});
