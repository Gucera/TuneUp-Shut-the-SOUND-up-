export interface AudioChordQuestion {
    id: string;
    prompt: string;
    correctChord: string;
    options: string[];
    audioSource: number;
    xpReward: number;
}

export const AUDIO_CHORD_QUESTIONS: AudioChordQuestion[] = [
    {
        id: 'audio-c-major',
        prompt: 'Which chord did you hear?',
        correctChord: 'C Major',
        options: ['C Major', 'A Minor', 'G Major', 'F Major'],
        audioSource: require('../../assets/audio/chords/c_major.wav'),
        xpReward: 20,
    },
    {
        id: 'audio-g-major',
        prompt: 'Which chord did you hear?',
        correctChord: 'G Major',
        options: ['F Major', 'G Major', 'A Minor', 'C Major'],
        audioSource: require('../../assets/audio/chords/g_major.wav'),
        xpReward: 20,
    },
    {
        id: 'audio-a-minor',
        prompt: 'Which chord did you hear?',
        correctChord: 'A Minor',
        options: ['C Major', 'A Minor', 'F Major', 'G Major'],
        audioSource: require('../../assets/audio/chords/a_minor.wav'),
        xpReward: 20,
    },
    {
        id: 'audio-f-major',
        prompt: 'Which chord did you hear?',
        correctChord: 'F Major',
        options: ['A Minor', 'G Major', 'F Major', 'C Major'],
        audioSource: require('../../assets/audio/chords/f_major.wav'),
        xpReward: 20,
    },
];

export function getRandomAudioQuestion(excludeId?: string): AudioChordQuestion {
    const pool = excludeId
        ? AUDIO_CHORD_QUESTIONS.filter((question) => question.id !== excludeId)
        : AUDIO_CHORD_QUESTIONS;

    const safePool = pool.length > 0 ? pool : AUDIO_CHORD_QUESTIONS;
    const randomIndex = Math.floor(Math.random() * safePool.length);
    return safePool[randomIndex];
}
