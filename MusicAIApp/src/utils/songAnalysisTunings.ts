export type SongAnalysisInstrument = 'guitar' | 'bass';

export type SongAnalysisTuningPreset = {
    id: string;
    instrument: SongAnalysisInstrument;
    name: string;
    displayName: string;
    stringNotes: string[];
    isUnknown?: boolean;
};

export const SONG_ANALYSIS_TUNINGS: SongAnalysisTuningPreset[] = [
    {
        id: 'guitar_standard',
        instrument: 'guitar',
        name: 'Standard',
        displayName: 'Standard - E A D G B e',
        stringNotes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    },
    {
        id: 'guitar_drop_d',
        instrument: 'guitar',
        name: 'Drop D',
        displayName: 'Drop D - D A D G B e',
        stringNotes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    },
    {
        id: 'guitar_half_step_down',
        instrument: 'guitar',
        name: 'Half Step Down',
        displayName: 'Half Step Down - Eb Ab Db Gb Bb Eb',
        stringNotes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
    },
    {
        id: 'guitar_drop_c_sharp',
        instrument: 'guitar',
        name: 'Drop C#',
        displayName: 'Drop C# - C# G# C# F# A# D#',
        stringNotes: ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'],
    },
    {
        id: 'guitar_custom_unknown',
        instrument: 'guitar',
        name: 'Custom / Unknown',
        displayName: 'Custom / Unknown',
        stringNotes: [],
        isUnknown: true,
    },
    {
        id: 'bass_standard',
        instrument: 'bass',
        name: 'Standard Bass',
        displayName: 'Standard Bass - E A D G',
        stringNotes: ['E1', 'A1', 'D2', 'G2'],
    },
    {
        id: 'bass_drop_d',
        instrument: 'bass',
        name: 'Drop D Bass',
        displayName: 'Drop D Bass - D A D G',
        stringNotes: ['D1', 'A1', 'D2', 'G2'],
    },
    {
        id: 'bass_half_step_down',
        instrument: 'bass',
        name: 'Half Step Down Bass',
        displayName: 'Half Step Down Bass - Eb Ab Db Gb',
        stringNotes: ['Eb1', 'Ab1', 'Db2', 'Gb2'],
    },
    {
        id: 'bass_custom_unknown',
        instrument: 'bass',
        name: 'Custom / Unknown',
        displayName: 'Custom / Unknown',
        stringNotes: [],
        isUnknown: true,
    },
];

export const DEFAULT_SONG_ANALYSIS_TUNING = SONG_ANALYSIS_TUNINGS[0];

export function getSongAnalysisTuningsForInstrument(instrument: SongAnalysisInstrument) {
    return SONG_ANALYSIS_TUNINGS.filter((preset) => preset.instrument === instrument);
}

export function getSongAnalysisTuningById(id: string) {
    return SONG_ANALYSIS_TUNINGS.find((preset) => preset.id === id) ?? DEFAULT_SONG_ANALYSIS_TUNING;
}

export function getDefaultSongAnalysisTuning(instrument: SongAnalysisInstrument) {
    return instrument === 'bass'
        ? getSongAnalysisTuningById('bass_standard')
        : DEFAULT_SONG_ANALYSIS_TUNING;
}
