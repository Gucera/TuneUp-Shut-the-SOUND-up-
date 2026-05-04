import {
    FALLBACK_STANDARD_TUNING_WARNING,
    getDisplayStringIndex,
    getDisplayStringLabels,
    getSongStringLabels,
    getStringLabelForTabNote,
    getTabNoteTargetMidi,
    hasExplicitTuning,
    stripStringNoteOctave,
    stringNoteToMidi,
} from './songFlowStrings';

describe('songFlowStrings', () => {
    it('displays Drop C# tuning high-to-low for tab lanes', () => {
        const song = {
            instrument: 'guitar',
            tuning: {
                id: 'guitar_drop_c_sharp',
                name: 'Drop C#',
                stringNotes: ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'],
            },
        };

        expect(getSongStringLabels(song)).toEqual(['D#', 'A#', 'F#', 'C#', 'G#', 'C#']);
        expect(getDisplayStringLabels(song)).toEqual(['D#', 'A#', 'F#', 'C#', 'G#', 'C#']);
    });

    it('maps tuning string indexes from low-to-high data into high-to-low display rows', () => {
        const song = {
            instrument: 'guitar',
            tuning: {
                id: 'guitar_drop_c_sharp',
                name: 'Drop C#',
                stringNotes: ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'],
            },
        };

        expect(getDisplayStringIndex(song, 0)).toBe(5);
        expect(getDisplayStringIndex(song, 5)).toBe(0);
        expect(getStringLabelForTabNote(song, 5)).toBe('D#');
        expect(getStringLabelForTabNote(song, 0)).toBe('C#');
        expect(getTabNoteTargetMidi(song, 5, 0)).toBe(63);
        expect(getTabNoteTargetMidi(song, 0, 0)).toBe(37);
    });

    it('keeps legacy no-tuning manifests on the existing display indexing', () => {
        const song = {};

        expect(hasExplicitTuning(song)).toBe(false);
        expect(getSongStringLabels(song)).toEqual(['e', 'B', 'G', 'D', 'A', 'E']);
        expect(getDisplayStringIndex(song, 0)).toBe(0);
        expect(getStringLabelForTabNote(song, 0)).toBe('e');
        expect(getTabNoteTargetMidi(song, 0, 0)).toBe(64);
        expect(FALLBACK_STANDARD_TUNING_WARNING).toContain('fallback standard tuning');
    });

    it('strips octaves from note labels without changing accidentals', () => {
        expect(stripStringNoteOctave('Eb4')).toBe('Eb');
        expect(stripStringNoteOctave('C#2')).toBe('C#');
        expect(stringNoteToMidi('Eb4')).toBe(63);
        expect(stringNoteToMidi('C#2')).toBe(37);
    });
});
