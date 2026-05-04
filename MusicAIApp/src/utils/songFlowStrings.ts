import { SongLesson } from '../data/songLessons';

export const STANDARD_GUITAR_STRING_LABELS_TOP_TO_BOTTOM = ['e', 'B', 'G', 'D', 'A', 'E'];
export const LEGACY_STANDARD_OPEN_MIDI = [64, 59, 55, 50, 45, 40] as const;
export const FALLBACK_STANDARD_TUNING_WARNING = 'This chart used fallback standard tuning. Fret positions may need correction.';

type SongStringMetadata = Pick<SongLesson, 'instrument' | 'tuning'>;

const NOTE_TO_SEMITONE: Record<string, number> = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
};

export function stripStringNoteOctave(note: string) {
    return note.trim().replace(/-?\d+$/, '');
}

export function stringNoteToMidi(note: string) {
    const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note.trim());
    if (!match) {
        return null;
    }

    const semitone = NOTE_TO_SEMITONE[match[1]];
    const octave = Number.parseInt(match[2], 10);
    if (semitone === undefined || !Number.isInteger(octave)) {
        return null;
    }

    return ((octave + 1) * 12) + semitone;
}

export function hasExplicitTuning(song: SongStringMetadata) {
    return Array.isArray(song.tuning?.stringNotes) && song.tuning.stringNotes.length > 0;
}

export function getSongStringLabels(song: SongStringMetadata) {
    const stringNotes = song.tuning?.stringNotes;
    if (!stringNotes || stringNotes.length === 0) {
        return STANDARD_GUITAR_STRING_LABELS_TOP_TO_BOTTOM;
    }

    return stringNotes
        .slice()
        .reverse()
        .map(stripStringNoteOctave);
}

export function getDisplayStringLabels(song: SongStringMetadata) {
    return getSongStringLabels(song);
}

export function getDisplayStringIndex(song: SongStringMetadata, stringIndex: number) {
    const labels = getSongStringLabels(song);
    const maxIndex = labels.length - 1;

    if (!Number.isInteger(stringIndex)) {
        return 0;
    }

    const clampedIndex = Math.max(0, Math.min(maxIndex, stringIndex));

    return hasExplicitTuning(song)
        ? maxIndex - clampedIndex
        : clampedIndex;
}

export function getStringLabelForTabNote(song: SongStringMetadata, stringIndex: number) {
    const labels = getSongStringLabels(song);
    return labels[getDisplayStringIndex(song, stringIndex)] ?? '--';
}

export function getTabNoteTargetMidi(
    song: SongStringMetadata,
    stringIndex: number,
    fret: number,
) {
    const openStringMidis = hasExplicitTuning(song)
        ? song.tuning?.stringNotes.map(stringNoteToMidi) ?? []
        : [...LEGACY_STANDARD_OPEN_MIDI];
    const maxIndex = openStringMidis.length - 1;

    if (maxIndex < 0 || !Number.isInteger(stringIndex) || !Number.isInteger(fret) || fret < 0) {
        return null;
    }

    const clampedIndex = Math.max(0, Math.min(maxIndex, stringIndex));
    const openMidi = openStringMidis[clampedIndex];
    if (openMidi === null || openMidi === undefined) {
        return null;
    }

    return openMidi + fret;
}
