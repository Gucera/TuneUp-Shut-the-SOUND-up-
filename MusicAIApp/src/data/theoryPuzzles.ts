export type PuzzleDifficulty = 'easy' | 'medium' | 'hard';
export type PuzzleKind = 'order' | 'select';

export interface TheoryPuzzle {
    id: string;
    kind: PuzzleKind;
    title: string;
    instruction: string;
    difficulty: PuzzleDifficulty;
    xpReward: number;
    answer: string[];
    pool: string[];
}

// Friendly display labels for note chips
export const NOTE_LABELS: Record<string, string> = {
    C: 'C',
    'C#': 'C Sharp',
    Db: 'D Flat',
    D: 'D',
    'D#': 'D Sharp',
    Eb: 'E Flat',
    E: 'E',
    F: 'F',
    'F#': 'F Sharp',
    Gb: 'G Flat',
    G: 'G',
    'G#': 'G Sharp',
    Ab: 'A Flat',
    A: 'A',
    'A#': 'A Sharp',
    Bb: 'B Flat',
    B: 'B',
};

export const THEORY_PUZZLES: TheoryPuzzle[] = [
    {
        id: 'order-c-major-scale',
        kind: 'order',
        title: 'C Major Scale',
        instruction: 'Place the notes in order from low to high.',
        difficulty: 'easy',
        xpReward: 15,
        answer: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
        pool: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    },
    {
        id: 'order-a-minor-scale',
        kind: 'order',
        title: 'A Natural Minor Scale',
        instruction: 'Build the A minor scale in the right order.',
        difficulty: 'easy',
        xpReward: 15,
        answer: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        pool: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    },
    {
        id: 'order-g-major-arpeggio',
        kind: 'order',
        title: 'G Major Arpeggio',
        instruction: 'Arrange the G major arpeggio notes in order.',
        difficulty: 'medium',
        xpReward: 20,
        answer: ['G', 'B', 'D', 'F#'],
        pool: ['G', 'B', 'D', 'F#', 'A', 'E'],
    },
    {
        id: 'order-d-minor7-arpeggio',
        kind: 'order',
        title: 'D Minor 7 Arpeggio',
        instruction: 'Build the Dm7 arpeggio in the correct order.',
        difficulty: 'medium',
        xpReward: 20,
        answer: ['D', 'F', 'A', 'C'],
        pool: ['D', 'F', 'A', 'C', 'E', 'G'],
    },
    {
        id: 'order-f-major-scale',
        kind: 'order',
        title: 'F Major Scale',
        instruction: 'Place the F major scale notes in order.',
        difficulty: 'medium',
        xpReward: 20,
        answer: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
        pool: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
    },
    {
        id: 'order-e-minor-pentatonic',
        kind: 'order',
        title: 'E Minor Pentatonic',
        instruction: 'Arrange the pentatonic notes in the right order.',
        difficulty: 'medium',
        xpReward: 20,
        answer: ['E', 'G', 'A', 'B', 'D'],
        pool: ['E', 'G', 'A', 'B', 'D', 'F#', 'C'],
    },
    {
        id: 'select-c-major-triad',
        kind: 'select',
        title: 'C Major Chord',
        instruction: 'Select the notes that make up a C major chord.',
        difficulty: 'easy',
        xpReward: 15,
        answer: ['C', 'E', 'G'],
        pool: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    },
    {
        id: 'select-a-minor-triad',
        kind: 'select',
        title: 'A Minor Chord',
        instruction: 'Find the notes of the A minor chord.',
        difficulty: 'easy',
        xpReward: 15,
        answer: ['A', 'C', 'E'],
        pool: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    },
    {
        id: 'select-g7',
        kind: 'select',
        title: 'G7 (Dominant 7)',
        instruction: 'Select the notes that make up a G7 chord.',
        difficulty: 'medium',
        xpReward: 20,
        answer: ['G', 'B', 'D', 'F'],
        pool: ['G', 'A', 'B', 'C', 'D', 'E', 'F'],
    },
    {
        id: 'select-fmaj7',
        kind: 'select',
        title: 'F Major 7',
        instruction: 'Pick the correct notes for an Fmaj7 chord.',
        difficulty: 'medium',
        xpReward: 20,
        answer: ['F', 'A', 'C', 'E'],
        pool: ['F', 'G', 'A', 'B', 'C', 'D', 'E'],
    },
    {
        id: 'select-b-diminished',
        kind: 'select',
        title: 'B Diminished (Bdim)',
        instruction: 'Select the notes that form a Bdim chord.',
        difficulty: 'hard',
        xpReward: 25,
        answer: ['B', 'D', 'F'],
        pool: ['B', 'C', 'D', 'E', 'F', 'G', 'A'],
    },
    {
        id: 'select-eb-major',
        kind: 'select',
        title: 'Eb Major Chord',
        instruction: 'Pick the Eb major chord notes.',
        difficulty: 'hard',
        xpReward: 25,
        answer: ['Eb', 'G', 'Bb'],
        pool: ['Eb', 'E', 'F', 'G', 'A', 'Bb', 'B'],
    },
];

// Randomly shuffle an array of notes
export function shuffleNotes(notes: string[]): string[] {
    const shuffled = [...notes];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Get a random puzzle, optionally excluding a specific one
export function getRandomPuzzle(excludeId?: string): TheoryPuzzle {
    const pool = excludeId
        ? THEORY_PUZZLES.filter((puzzle) => puzzle.id !== excludeId)
        : THEORY_PUZZLES;

    const safePool = pool.length > 0 ? pool : THEORY_PUZZLES;
    const randomIndex = Math.floor(Math.random() * safePool.length);
    return safePool[randomIndex];
}
