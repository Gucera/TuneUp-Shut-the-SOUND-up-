export type SongTrackSource = number | { uri: string };

export interface SongChordEvent {
    timeSec: number;
    chord: string;
    laneRow: number;
}

export interface SongTabNote {
    timeSec: number;
    stringIndex: number;
    fret: number;
    durationSec?: number;
}

export interface SongSectionMarker {
    timeSec: number;
    label: string;
}

export interface SongTuningMetadata {
    id: string;
    name: string;
    stringNotes: string[];
}

export interface SongAnalysisConfidence {
    overall: number;
    chords: number;
    tabs: number;
    sections: number;
}

export interface SongLesson {
    id: string;
    title: string;
    artist: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    backingTrack: SongTrackSource;
    bpm?: number;
    durationSec: number;
    chordEvents: SongChordEvent[];
    tabNotes: SongTabNote[];
    markers?: SongSectionMarker[];
    isImported?: boolean;
    source?: 'demo' | 'import' | 'ai';
    isDemo?: boolean;
    isVerified?: boolean;
    instrument?: string;
    tuning?: SongTuningMetadata;
    aiDraft?: boolean;
    confidence?: SongAnalysisConfidence;
    warnings?: string[];
    createdAt?: string;
    updatedAt?: string;
    isFavorite?: boolean;
    sourceFileName?: string;
}

export const SONG_LESSONS: SongLesson[] = [
    {
        id: 'tuneup-demo-riff',
        title: 'TuneUp Demo Riff',
        artist: 'TuneUp',
        difficulty: 'Easy',
        backingTrack: require('../../assets/audio/backing/tuneup_demo_riff.wav'),
        bpm: 120,
        durationSec: 32,
        source: 'demo',
        isDemo: true,
        isVerified: true,
        instrument: 'guitar',
        tuning: {
            id: 'guitar_standard',
            name: 'Standard',
            stringNotes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
        },
        markers: [
            { timeSec: 0, label: 'Intro' },
            { timeSec: 8, label: 'Main Riff' },
            { timeSec: 16, label: 'Chord Groove' },
            { timeSec: 24, label: 'Lead Tag' },
            { timeSec: 32, label: 'End' },
        ],
        chordEvents: [
            { timeSec: 0, chord: 'Em', laneRow: 2 },
            { timeSec: 4, chord: 'G', laneRow: 0 },
            { timeSec: 8, chord: 'D', laneRow: 1 },
            { timeSec: 12, chord: 'A', laneRow: 3 },
            { timeSec: 16, chord: 'Em', laneRow: 2 },
            { timeSec: 20, chord: 'G', laneRow: 0 },
            { timeSec: 24, chord: 'D', laneRow: 1 },
            { timeSec: 28, chord: 'A', laneRow: 3 },
        ],
        tabNotes: [
            { timeSec: 0, stringIndex: 0, fret: 0, durationSec: 0.35 },
            { timeSec: 0.5, stringIndex: 0, fret: 2, durationSec: 0.35 },
            { timeSec: 1, stringIndex: 0, fret: 3, durationSec: 0.35 },
            { timeSec: 1.5, stringIndex: 1, fret: 2, durationSec: 0.35 },
            { timeSec: 2, stringIndex: 0, fret: 0, durationSec: 0.35 },
            { timeSec: 2.5, stringIndex: 0, fret: 2, durationSec: 0.35 },
            { timeSec: 3, stringIndex: 0, fret: 5, durationSec: 0.35 },
            { timeSec: 3.5, stringIndex: 0, fret: 7, durationSec: 0.35 },
            { timeSec: 4, stringIndex: 0, fret: 3, durationSec: 0.35 },
            { timeSec: 4.5, stringIndex: 0, fret: 5, durationSec: 0.35 },
            { timeSec: 5, stringIndex: 1, fret: 2, durationSec: 0.35 },
            { timeSec: 5.5, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 6, stringIndex: 0, fret: 7, durationSec: 0.35 },
            { timeSec: 6.5, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 7, stringIndex: 1, fret: 2, durationSec: 0.35 },
            { timeSec: 7.5, stringIndex: 0, fret: 3, durationSec: 0.35 },
            { timeSec: 8, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 8.5, stringIndex: 1, fret: 7, durationSec: 0.35 },
            { timeSec: 9, stringIndex: 2, fret: 4, durationSec: 0.35 },
            { timeSec: 9.5, stringIndex: 2, fret: 7, durationSec: 0.35 },
            { timeSec: 10, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 10.5, stringIndex: 1, fret: 7, durationSec: 0.35 },
            { timeSec: 11, stringIndex: 2, fret: 5, durationSec: 0.35 },
            { timeSec: 11.5, stringIndex: 2, fret: 7, durationSec: 0.35 },
            { timeSec: 12, stringIndex: 1, fret: 0, durationSec: 0.35 },
            { timeSec: 12.5, stringIndex: 1, fret: 2, durationSec: 0.35 },
            { timeSec: 13, stringIndex: 1, fret: 4, durationSec: 0.35 },
            { timeSec: 13.5, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 14, stringIndex: 1, fret: 0, durationSec: 0.35 },
            { timeSec: 14.5, stringIndex: 1, fret: 2, durationSec: 0.35 },
            { timeSec: 15, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 15.5, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 16, stringIndex: 0, fret: 0, durationSec: 0.35 },
            { timeSec: 16.5, stringIndex: 0, fret: 2, durationSec: 0.35 },
            { timeSec: 17, stringIndex: 0, fret: 3, durationSec: 0.35 },
            { timeSec: 17.5, stringIndex: 1, fret: 2, durationSec: 0.35 },
            { timeSec: 18, stringIndex: 0, fret: 5, durationSec: 0.35 },
            { timeSec: 18.5, stringIndex: 0, fret: 7, durationSec: 0.35 },
            { timeSec: 19, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 19.5, stringIndex: 2, fret: 4, durationSec: 0.35 },
            { timeSec: 20, stringIndex: 0, fret: 3, durationSec: 0.35 },
            { timeSec: 20.5, stringIndex: 0, fret: 5, durationSec: 0.35 },
            { timeSec: 21, stringIndex: 1, fret: 2, durationSec: 0.35 },
            { timeSec: 21.5, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 22, stringIndex: 0, fret: 7, durationSec: 0.35 },
            { timeSec: 22.5, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 23, stringIndex: 2, fret: 4, durationSec: 0.35 },
            { timeSec: 23.5, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 24, stringIndex: 2, fret: 7, durationSec: 0.35 },
            { timeSec: 24.5, stringIndex: 3, fret: 4, durationSec: 0.35 },
            { timeSec: 25, stringIndex: 3, fret: 7, durationSec: 0.35 },
            { timeSec: 25.5, stringIndex: 4, fret: 5, durationSec: 0.35 },
            { timeSec: 26, stringIndex: 2, fret: 7, durationSec: 0.35 },
            { timeSec: 26.5, stringIndex: 3, fret: 7, durationSec: 0.35 },
            { timeSec: 27, stringIndex: 4, fret: 5, durationSec: 0.35 },
            { timeSec: 27.5, stringIndex: 5, fret: 7, durationSec: 0.35 },
            { timeSec: 28, stringIndex: 1, fret: 0, durationSec: 0.35 },
            { timeSec: 28.5, stringIndex: 1, fret: 2, durationSec: 0.35 },
            { timeSec: 29, stringIndex: 1, fret: 4, durationSec: 0.35 },
            { timeSec: 29.5, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 30, stringIndex: 1, fret: 5, durationSec: 0.35 },
            { timeSec: 30.5, stringIndex: 2, fret: 4, durationSec: 0.35 },
            { timeSec: 31, stringIndex: 0, fret: 3, durationSec: 0.35 },
            { timeSec: 31.5, stringIndex: 0, fret: 0, durationSec: 0.45 },
        ],
    },
    {
        id: 'ocean-echo',
        title: 'Ocean Echo',
        artist: 'TuneUp Demo Band',
        difficulty: 'Medium',
        backingTrack: require('../../assets/audio/backing/ocean_echo.wav'),
        durationSec: 16,
        chordEvents: [
            { timeSec: 0, chord: 'Am', laneRow: 2 },
            { timeSec: 2, chord: 'F', laneRow: 3 },
            { timeSec: 4, chord: 'C', laneRow: 1 },
            { timeSec: 6, chord: 'G', laneRow: 0 },
            { timeSec: 8, chord: 'Am', laneRow: 2 },
            { timeSec: 10, chord: 'F', laneRow: 3 },
            { timeSec: 12, chord: 'C', laneRow: 1 },
            { timeSec: 14, chord: 'G', laneRow: 0 },
        ],
        tabNotes: [
            { timeSec: 0, stringIndex: 1, fret: 1, durationSec: 0.5 },
            { timeSec: 0.5, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 1, stringIndex: 3, fret: 2, durationSec: 0.35 },
            { timeSec: 1.5, stringIndex: 4, fret: 0, durationSec: 0.45 },
            { timeSec: 2, stringIndex: 0, fret: 1, durationSec: 0.45 },
            { timeSec: 2.5, stringIndex: 1, fret: 1, durationSec: 0.35 },
            { timeSec: 3, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 3.5, stringIndex: 3, fret: 3, durationSec: 0.45 },
            { timeSec: 4, stringIndex: 1, fret: 1, durationSec: 0.45 },
            { timeSec: 4.5, stringIndex: 2, fret: 0, durationSec: 0.35 },
            { timeSec: 5, stringIndex: 3, fret: 2, durationSec: 0.35 },
            { timeSec: 5.5, stringIndex: 4, fret: 3, durationSec: 0.45 },
            { timeSec: 6, stringIndex: 0, fret: 3, durationSec: 0.35 },
            { timeSec: 6.5, stringIndex: 1, fret: 0, durationSec: 0.35 },
            { timeSec: 7, stringIndex: 2, fret: 0, durationSec: 0.35 },
            { timeSec: 7.5, stringIndex: 5, fret: 3, durationSec: 0.5 },
            { timeSec: 8, stringIndex: 1, fret: 1, durationSec: 0.5 },
            { timeSec: 8.5, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 9, stringIndex: 3, fret: 2, durationSec: 0.35 },
            { timeSec: 9.5, stringIndex: 4, fret: 0, durationSec: 0.45 },
            { timeSec: 10, stringIndex: 0, fret: 1, durationSec: 0.45 },
            { timeSec: 10.5, stringIndex: 1, fret: 1, durationSec: 0.35 },
            { timeSec: 11, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 11.5, stringIndex: 3, fret: 3, durationSec: 0.45 },
            { timeSec: 12, stringIndex: 1, fret: 1, durationSec: 0.45 },
            { timeSec: 12.5, stringIndex: 2, fret: 0, durationSec: 0.35 },
            { timeSec: 13, stringIndex: 3, fret: 2, durationSec: 0.35 },
            { timeSec: 13.5, stringIndex: 4, fret: 3, durationSec: 0.45 },
            { timeSec: 14, stringIndex: 0, fret: 3, durationSec: 0.35 },
            { timeSec: 14.5, stringIndex: 1, fret: 0, durationSec: 0.35 },
            { timeSec: 15, stringIndex: 2, fret: 0, durationSec: 0.35 },
            { timeSec: 15.5, stringIndex: 5, fret: 3, durationSec: 0.5 },
        ],
    },
    {
        id: 'city-lights',
        title: 'City Lights',
        artist: 'TuneUp Demo Band',
        difficulty: 'Medium',
        backingTrack: require('../../assets/audio/backing/road_jam.wav'),
        durationSec: 16,
        chordEvents: [
            { timeSec: 0, chord: 'Dm', laneRow: 2 },
            { timeSec: 1.5, chord: 'Am', laneRow: 1 },
            { timeSec: 3, chord: 'F', laneRow: 3 },
            { timeSec: 4.5, chord: 'C', laneRow: 1 },
            { timeSec: 6, chord: 'Dm', laneRow: 2 },
            { timeSec: 7.5, chord: 'Am', laneRow: 1 },
            { timeSec: 9, chord: 'F', laneRow: 3 },
            { timeSec: 10.5, chord: 'C', laneRow: 1 },
            { timeSec: 12, chord: 'G', laneRow: 0 },
            { timeSec: 14, chord: 'Am', laneRow: 1 },
        ],
        tabNotes: [
            { timeSec: 0, stringIndex: 0, fret: 1, durationSec: 0.35 },
            { timeSec: 0.5, stringIndex: 1, fret: 3, durationSec: 0.35 },
            { timeSec: 1, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 1.5, stringIndex: 1, fret: 1, durationSec: 0.35 },
            { timeSec: 2, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 2.5, stringIndex: 3, fret: 2, durationSec: 0.35 },
            { timeSec: 3, stringIndex: 0, fret: 1, durationSec: 0.45 },
            { timeSec: 3.5, stringIndex: 1, fret: 1, durationSec: 0.35 },
            { timeSec: 4, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 4.5, stringIndex: 1, fret: 1, durationSec: 0.45 },
            { timeSec: 5, stringIndex: 2, fret: 0, durationSec: 0.35 },
            { timeSec: 5.5, stringIndex: 3, fret: 2, durationSec: 0.35 },
            { timeSec: 6, stringIndex: 0, fret: 1, durationSec: 0.35 },
            { timeSec: 6.5, stringIndex: 1, fret: 3, durationSec: 0.35 },
            { timeSec: 7, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 7.5, stringIndex: 1, fret: 1, durationSec: 0.35 },
            { timeSec: 8, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 8.5, stringIndex: 3, fret: 2, durationSec: 0.35 },
            { timeSec: 9, stringIndex: 0, fret: 1, durationSec: 0.45 },
            { timeSec: 9.5, stringIndex: 1, fret: 1, durationSec: 0.35 },
            { timeSec: 10, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 10.5, stringIndex: 1, fret: 1, durationSec: 0.45 },
            { timeSec: 11, stringIndex: 2, fret: 0, durationSec: 0.35 },
            { timeSec: 11.5, stringIndex: 3, fret: 2, durationSec: 0.35 },
            { timeSec: 12, stringIndex: 0, fret: 3, durationSec: 0.35 },
            { timeSec: 12.5, stringIndex: 1, fret: 0, durationSec: 0.35 },
            { timeSec: 13, stringIndex: 2, fret: 0, durationSec: 0.35 },
            { timeSec: 13.5, stringIndex: 5, fret: 3, durationSec: 0.45 },
            { timeSec: 14, stringIndex: 1, fret: 1, durationSec: 0.45 },
            { timeSec: 14.5, stringIndex: 2, fret: 2, durationSec: 0.35 },
            { timeSec: 15, stringIndex: 3, fret: 2, durationSec: 0.35 },
            { timeSec: 15.5, stringIndex: 4, fret: 0, durationSec: 0.45 },
        ],
    },
    {
        id: 'night-shift',
        title: 'Night Shift',
        artist: 'TuneUp Demo Band',
        difficulty: 'Hard',
        backingTrack: require('../../assets/audio/backing/ocean_echo.wav'),
        durationSec: 16,
        chordEvents: [
            { timeSec: 0, chord: 'Em', laneRow: 2 },
            { timeSec: 1, chord: 'G', laneRow: 0 },
            { timeSec: 2, chord: 'Bm', laneRow: 3 },
            { timeSec: 3, chord: 'C', laneRow: 1 },
            { timeSec: 4, chord: 'Em', laneRow: 2 },
            { timeSec: 5, chord: 'G', laneRow: 0 },
            { timeSec: 6, chord: 'Bm', laneRow: 3 },
            { timeSec: 7, chord: 'C', laneRow: 1 },
            { timeSec: 8, chord: 'Em', laneRow: 2 },
            { timeSec: 9, chord: 'G', laneRow: 0 },
            { timeSec: 10, chord: 'Bm', laneRow: 3 },
            { timeSec: 11, chord: 'C', laneRow: 1 },
            { timeSec: 12, chord: 'Am', laneRow: 2 },
            { timeSec: 13, chord: 'F', laneRow: 3 },
            { timeSec: 14, chord: 'G', laneRow: 0 },
            { timeSec: 15, chord: 'Em', laneRow: 2 },
        ],
        tabNotes: [
            { timeSec: 0, stringIndex: 0, fret: 0, durationSec: 0.3 },
            { timeSec: 0.5, stringIndex: 1, fret: 0, durationSec: 0.3 },
            { timeSec: 1, stringIndex: 0, fret: 3, durationSec: 0.3 },
            { timeSec: 1.5, stringIndex: 1, fret: 3, durationSec: 0.3 },
            { timeSec: 2, stringIndex: 1, fret: 3, durationSec: 0.3 },
            { timeSec: 2.5, stringIndex: 2, fret: 4, durationSec: 0.3 },
            { timeSec: 3, stringIndex: 1, fret: 1, durationSec: 0.3 },
            { timeSec: 3.5, stringIndex: 2, fret: 0, durationSec: 0.3 },
            { timeSec: 4, stringIndex: 0, fret: 0, durationSec: 0.3 },
            { timeSec: 4.5, stringIndex: 1, fret: 0, durationSec: 0.3 },
            { timeSec: 5, stringIndex: 0, fret: 3, durationSec: 0.3 },
            { timeSec: 5.5, stringIndex: 1, fret: 3, durationSec: 0.3 },
            { timeSec: 6, stringIndex: 1, fret: 3, durationSec: 0.3 },
            { timeSec: 6.5, stringIndex: 2, fret: 4, durationSec: 0.3 },
            { timeSec: 7, stringIndex: 1, fret: 1, durationSec: 0.3 },
            { timeSec: 7.5, stringIndex: 2, fret: 0, durationSec: 0.3 },
            { timeSec: 8, stringIndex: 0, fret: 0, durationSec: 0.3 },
            { timeSec: 8.5, stringIndex: 1, fret: 0, durationSec: 0.3 },
            { timeSec: 9, stringIndex: 0, fret: 3, durationSec: 0.3 },
            { timeSec: 9.5, stringIndex: 1, fret: 3, durationSec: 0.3 },
            { timeSec: 10, stringIndex: 1, fret: 3, durationSec: 0.3 },
            { timeSec: 10.5, stringIndex: 2, fret: 4, durationSec: 0.3 },
            { timeSec: 11, stringIndex: 1, fret: 1, durationSec: 0.3 },
            { timeSec: 11.5, stringIndex: 2, fret: 0, durationSec: 0.3 },
            { timeSec: 12, stringIndex: 1, fret: 1, durationSec: 0.3 },
            { timeSec: 12.5, stringIndex: 2, fret: 2, durationSec: 0.3 },
            { timeSec: 13, stringIndex: 0, fret: 1, durationSec: 0.3 },
            { timeSec: 13.5, stringIndex: 1, fret: 1, durationSec: 0.3 },
            { timeSec: 14, stringIndex: 0, fret: 3, durationSec: 0.3 },
            { timeSec: 14.5, stringIndex: 1, fret: 0, durationSec: 0.3 },
            { timeSec: 15, stringIndex: 0, fret: 0, durationSec: 0.3 },
            { timeSec: 15.5, stringIndex: 1, fret: 0, durationSec: 0.3 },
        ],
    },
];
