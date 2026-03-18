export interface GuitarChordShape {
    name: string;
    frets: Array<number | 'x' | 0>;
    fingers?: Array<number | null>;
    startFret?: number;
}

export interface PianoVisualGroup {
    label: string;
    notes: string[];
}

export interface DrumGrooveLane {
    label: string;
    hits: number[];
    accents?: number[];
}

export type LessonVisual =
    | {
        type: 'guitar-chords';
        title: string;
        caption: string;
        shapes: GuitarChordShape[];
    }
    | {
        type: 'guitar-tab';
        title: string;
        caption: string;
        lines: string[];
    }
    | {
        type: 'piano-keys';
        title: string;
        caption: string;
        groups: PianoVisualGroup[];
    }
    | {
        type: 'drum-groove';
        title: string;
        caption: string;
        steps: number;
        lanes: DrumGrooveLane[];
    }
    | {
        type: 'pattern-strip';
        title: string;
        caption: string;
        tokens: string[];
    };

const chords = (title: string, caption: string, shapes: GuitarChordShape[]): LessonVisual => ({
    type: 'guitar-chords',
    title,
    caption,
    shapes,
});

const tab = (title: string, caption: string, lines: string[]): LessonVisual => ({
    type: 'guitar-tab',
    title,
    caption,
    lines,
});

const keys = (title: string, caption: string, groups: PianoVisualGroup[]): LessonVisual => ({
    type: 'piano-keys',
    title,
    caption,
    groups,
});

const groove = (title: string, caption: string, steps: number, lanes: DrumGrooveLane[]): LessonVisual => ({
    type: 'drum-groove',
    title,
    caption,
    steps,
    lanes,
});

const pattern = (title: string, caption: string, tokens: string[]): LessonVisual => ({
    type: 'pattern-strip',
    title,
    caption,
    tokens,
});

export const LESSON_VISUALS: Record<string, LessonVisual[]> = {
    'gtr-01-posture-tone': [
        tab('Open-String Check', 'Use this to listen for even attack and clean release on every string.', [
            'e|-----0-----0-----|',
            'B|---0-----0-------|',
            'G|-0-----0---------|',
            'D|-----0-----0-----|',
            'A|---0-----0-------|',
            'E|-0-----0---------|',
        ]),
    ],
    'gtr-02-fretboard-anchors': [
        tab('1-2-3-4 Anchor Run', 'Stay close to the fretboard and keep every finger ready.', [
            'e|--1-2-3-4---------|',
            'B|----------1-2-3-4-|',
            'G|--1-2-3-4---------|',
            'D|----------1-2-3-4-|',
            'A|--1-2-3-4---------|',
            'E|----------1-2-3-4-|',
        ]),
    ],
    'gtr-03-open-chords-core': [
        chords('Open Chord Map', 'These four shapes are the main engine for your early song work.', [
            { name: 'C', frets: ['x', 3, 2, 0, 1, 0], fingers: [null, 3, 2, null, 1, null] },
            { name: 'G', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, null, null, null, 3] },
            { name: 'Am', frets: ['x', 0, 2, 2, 1, 0], fingers: [null, null, 2, 3, 1, null] },
            { name: 'Fmaj7', frets: ['x', 'x', 3, 2, 1, 0], fingers: [null, null, 3, 2, 1, null] },
        ]),
    ],
    'gtr-04-chord-change-engine': [
        chords('Change Targets', 'Practice landing these shapes on beat 1 without stopping the hand.', [
            { name: 'C', frets: ['x', 3, 2, 0, 1, 0], fingers: [null, 3, 2, null, 1, null] },
            { name: 'G', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, null, null, null, 3] },
            { name: 'D', frets: ['x', 'x', 0, 2, 3, 2], fingers: [null, null, null, 1, 3, 2] },
            { name: 'Am', frets: ['x', 0, 2, 2, 1, 0], fingers: [null, null, 2, 3, 1, null] },
        ]),
    ],
    'gtr-05-strumming-basics': [
        pattern('Starter Strum', 'Keep the arm moving through the full motion even when one stroke is silent.', ['1', '&', '2', '&', '3', '&', '4', '&', 'D', 'D', 'U', 'U', 'D', 'U']),
    ],
    'gtr-06-arpeggio-clarity': [
        tab('Am Broken Chord', 'Aim the pick like a tiny staircase, one string at a time.', [
            'e|--------0---------|',
            'B|------1---1-------|',
            'G|----2-------2-----|',
            'D|--2-----------2---|',
            'A|0-----------------|',
            'E|------------------|',
        ]),
    ],
    'gtr-07-power-chords': [
        chords('Movable 5 Shapes', 'Slide the same shape around and keep the muting hand steady.', [
            { name: 'G5', frets: [3, 5, 5, 'x', 'x', 'x'], fingers: [1, 3, 4, null, null, null], startFret: 3 },
            { name: 'A5', frets: [5, 7, 7, 'x', 'x', 'x'], fingers: [1, 3, 4, null, null, null], startFret: 5 },
            { name: 'C5', frets: [8, 10, 10, 'x', 'x', 'x'], fingers: [1, 3, 4, null, null, null], startFret: 8 },
        ]),
    ],
    'gtr-08-twelve-bar-blues': [
        chords('I-IV-V Blues Shapes', 'Use these to feel the form in A before you worry about flashier rhythm ideas.', [
            { name: 'A7', frets: ['x', 0, 2, 0, 2, 0], fingers: [null, null, 2, null, 1, null] },
            { name: 'D7', frets: ['x', 'x', 0, 2, 1, 2], fingers: [null, null, null, 2, 1, 3] },
            { name: 'E7', frets: [0, 2, 0, 1, 0, 0], fingers: [null, 2, null, 1, null, null] },
        ]),
        pattern('12-Bar Form', 'Count the bars and hear the story of the form as you play.', ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'I']),
    ],
    'gtr-09-major-scale-map': [
        tab('One-Position Major Scale', 'This box is enough to start hearing melody targets inside a position.', [
            'e|----------------2-3-|',
            'B|------------3-5-----|',
            'G|--------2-4---------|',
            'D|----2-4-------------|',
            'A|2-3-----------------|',
            'E|--------------------|',
        ]),
    ],
    'gtr-10-pentatonic-phrasing': [
        tab('Minor Pentatonic Hook', 'Leave space after the bend so the phrase can actually breathe.', [
            'e|----------------------|',
            'B|------5b7--5----------|',
            'G|--5/7--------7-5------|',
            'D|------------------7-5-|',
            'A|----------------------|',
            'E|----------------------|',
        ]),
    ],
    'gtr-11-barre-chord-entry': [
        chords('First Barre Targets', 'Check the light pressure line of the index before squeezing harder.', [
            { name: 'F', frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], startFret: 1 },
            { name: 'Fm', frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], startFret: 1 },
            { name: 'Gm', frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], startFret: 3 },
        ]),
    ],
    'gtr-12-triad-navigation': [
        tab('Top-String Triads', 'Keep the shapes small and let the top note lead the listener.', [
            'e|--3-----5-----8-----|',
            'B|--5-----5-----8-----|',
            'G|--5-----5-----9-----|',
            'D|--------------------|',
            'A|--------------------|',
            'E|--------------------|',
        ]),
    ],
    'gtr-13-fingerstyle-patterns': [
        tab('Thumb + Fingers Roll', 'Bass first, then the upper notes bloom after it.', [
            'e|--------0---------0-|',
            'B|------1---1-----1---|',
            'G|----0-------0-0-----|',
            'D|--2-----------------|',
            'A|3-------------------|',
            'E|--------------------|',
        ]),
    ],
    'gtr-14-rhythm-accents': [
        pattern('Accent Grid', 'Hit the big accents cleanly and let the ghost strokes stay light.', ['1', '&', '2', '&', '3', '&', '4', '&', 'ACCENT', 'ghost', 'ACCENT', 'ghost']),
    ],
    'gtr-15-dynamics-tone-shaping': [
        pattern('Dynamic Arc', 'Use the same part, but shape the energy like sections in a real song.', ['Soft verse', 'tight mute', 'open pre', 'big chorus']),
    ],
    'gtr-16-lead-target-notes': [
        tab('Target-Note Phrase', 'Circle the chord tone at the end of the line and let it feel final.', [
            'e|----------------5-7-|',
            'B|----------5-7-8-----|',
            'G|------4-7-----------|',
            'D|--5/7---------------|',
            'A|--------------------|',
            'E|--------------------|',
        ]),
    ],
    'gtr-17-double-stops-hooks': [
        tab('Double-Stop Hook', 'Play both notes with one intention, not as two separate stabs.', [
            'e|--5/7--7--5---------|',
            'B|--5/7--7--5---------|',
            'G|------------7--5----|',
            'D|------------7--5----|',
            'A|--------------------|',
            'E|--------------------|',
        ]),
    ],
    'gtr-18-chord-melody-basics': [
        tab('Melody on Top', 'The upper voice has to sing above the harmony underneath it.', [
            'e|--0-----0-----3-----|',
            'B|--1-----1-----0-----|',
            'G|--0-----2-----0-----|',
            'D|--2-----2-----0-----|',
            'A|--3-----0-----2-----|',
            'E|--------------3-----|',
        ]),
    ],
    'gtr-19-groove-pocket-session': [
        pattern('Pocket Count', 'This is the feel check: clean starts, dead stops, steady subdivision.', ['1e&a', '2e&a', '3e&a', '4e&a', 'lock', 'rest', 'lock', 'rest']),
    ],
    'gtr-20-performance-polish': [
        pattern('Performance Shape', 'Think in sections instead of one long blur of practice.', ['Intro', 'Verse', 'Chorus', 'Repair', 'Full take']),
    ],

    'pn-01-posture-hand-shape': [
        keys('Five-Finger Home Base', 'Let the fingers sit naturally over this simple shape before moving bigger.', [
            { label: 'C Position', notes: ['C', 'D', 'E', 'F', 'G'] },
        ]),
    ],
    'pn-02-keyboard-geography': [
        keys('Keyboard Landmarks', 'These anchor notes help you stop feeling lost on the keyboard.', [
            { label: 'C', notes: ['C'] },
            { label: 'F', notes: ['F'] },
            { label: 'G', notes: ['G'] },
        ]),
    ],
    'pn-03-five-finger-control': [
        keys('Five-Note Control', 'Keep the fingertips close and let every note sound equally calm.', [
            { label: 'Right Hand', notes: ['C', 'D', 'E', 'F', 'G'] },
            { label: 'Left Hand', notes: ['C', 'D', 'E', 'F', 'G'] },
        ]),
    ],
    'pn-04-c-major-foundation': [
        keys('C Major Scale', 'This is the cleanest place to learn fingering flow and phrase shape.', [
            { label: 'Scale', notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
        ]),
    ],
    'pn-05-left-hand-roots': [
        keys('Root + Fifth Targets', 'These bass shapes hold a progression together without overplaying.', [
            { label: 'C', notes: ['C', 'G'] },
            { label: 'Am', notes: ['A', 'E'] },
            { label: 'F', notes: ['F', 'C'] },
            { label: 'G', notes: ['G', 'D'] },
        ]),
    ],
    'pn-06-broken-chords': [
        keys('Broken Chord Shapes', 'Hear each chord unfold one note at a time instead of landing all at once.', [
            { label: 'C', notes: ['C', 'E', 'G'] },
            { label: 'Am', notes: ['A', 'C', 'E'] },
            { label: 'F', notes: ['F', 'A', 'C'] },
        ]),
    ],
    'pn-07-triads-in-root-position': [
        keys('Root Position Triads', 'These are the core shapes behind a lot of pop harmony.', [
            { label: 'C', notes: ['C', 'E', 'G'] },
            { label: 'F', notes: ['F', 'A', 'C'] },
            { label: 'G', notes: ['G', 'B', 'D'] },
            { label: 'Am', notes: ['A', 'C', 'E'] },
        ]),
    ],
    'pn-08-pedal-basics': [
        pattern('Pedal Timing', 'Play first, pedal second, then change only after the next harmony lands.', ['Play', 'Press', 'Change', 'Lift']),
    ],
    'pn-09-pop-comping-1': [
        keys('Pop Comping Chords', 'Simple triads plus a steady bass hand already sound musical.', [
            { label: 'C', notes: ['C', 'E', 'G'] },
            { label: 'G', notes: ['G', 'B', 'D'] },
            { label: 'Am', notes: ['A', 'C', 'E'] },
            { label: 'F', notes: ['F', 'A', 'C'] },
        ]),
    ],
    'pn-10-inversions-flow': [
        keys('C Major Inversions', 'The point is to move less while still outlining the harmony clearly.', [
            { label: 'Root', notes: ['C', 'E', 'G'] },
            { label: '1st Inv', notes: ['E', 'G', 'C'] },
            { label: '2nd Inv', notes: ['G', 'C', 'E'] },
        ]),
    ],
    'pn-11-major-scales-two-keys': [
        keys('New Key Notes', 'See the changed tones before you start worrying about hand motion.', [
            { label: 'G Major', notes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'] },
            { label: 'F Major', notes: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'] },
        ]),
    ],
    'pn-12-minor-sound-world': [
        keys('Minor Color Map', 'These notes give the lesson its darker but still focused sound.', [
            { label: 'A Minor', notes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
            { label: 'D Minor', notes: ['D', 'E', 'F', 'G', 'A', 'Bb', 'C'] },
        ]),
    ],
    'pn-13-syncopation-groove': [
        pattern('Offbeat Chord Feel', 'Bass on the beat, chords around the beat. That contrast is the whole lesson.', ['1', '&', '2', '&', '3', '&', '4', '&', 'Bass', '-', 'Chord', '-', 'Bass', '-', 'Chord', '-']),
    ],
    'pn-14-lead-sheet-reading': [
        pattern('Lead Sheet Read', 'Read the symbol first, then choose the cleanest voicing you already know.', ['C', 'G', 'Am', 'F']),
    ],
    'pn-15-arpeggio-ladders': [
        keys('Arpeggio Targets', 'Think root-third-fifth as a path, not as random jumps.', [
            { label: 'C', notes: ['C', 'E', 'G'] },
            { label: 'Am', notes: ['A', 'C', 'E'] },
            { label: 'F', notes: ['F', 'A', 'C'] },
            { label: 'G', notes: ['G', 'B', 'D'] },
        ]),
    ],
    'pn-16-sus-add-color': [
        keys('Color Tone Swap', 'Notice how one note change can make the chord feel much more modern.', [
            { label: 'Csus2', notes: ['C', 'D', 'G'] },
            { label: 'Cadd9', notes: ['C', 'E', 'G', 'D'] },
            { label: 'Gsus4', notes: ['G', 'C', 'D'] },
        ]),
    ],
    'pn-17-gospel-walkups': [
        keys('Walkup Bass Path', 'The bass moves forward while the harmony prepares the landing.', [
            { label: 'Walkup', notes: ['C', 'D', 'E', 'F'] },
            { label: 'Target', notes: ['F', 'A', 'C'] },
        ]),
    ],
    'pn-18-reading-rhythm-stack': [
        pattern('Rhythm Stack Count', 'Feel the held note and the moving part as two jobs that happen together.', ['Hold', 'count', 'move', 'hold', 'release', 'reset']),
    ],
    'pn-19-accompaniment-arranging': [
        pattern('Texture Choices', 'Use texture changes to tell the listener when the section changes.', ['Block', 'Broken', 'Pad', 'Stab']),
    ],
    'pn-20-performance-touch': [
        pattern('Performance Arc', 'Shape the line first, then let the touch support that shape.', ['Soft', 'lift', 'bloom', 'resolve']),
    ],

    'drm-01-setup-grip': [
        pattern('Stick Flow', 'Loose rebound is the visual cue here. Let the sticks come back to you.', ['R', 'L', 'R', 'L', 'R', 'L', 'R', 'L']),
    ],
    'drm-02-single-strokes': [
        pattern('Single Stroke Grid', 'Stay even first. Speed is a later reward, not the first target.', ['R', 'L', 'R', 'L', 'R', 'L', 'R', 'L']),
    ],
    'drm-03-backbeat-foundation': [
        groove('Starter Backbeat', 'Hi-hat holds the pulse while the snare defines the groove shape.', 8, [
            { label: 'HH', hits: [0, 1, 2, 3, 4, 5, 6, 7] },
            { label: 'SD', hits: [2, 6], accents: [2, 6] },
            { label: 'BD', hits: [0, 4] },
        ]),
    ],
    'drm-04-hi-hat-control': [
        groove('Open Hat Accent', 'Let the one open hat speak, then close it cleanly right away.', 8, [
            { label: 'HH', hits: [0, 1, 2, 3, 4, 5, 6, 7], accents: [7] },
            { label: 'SD', hits: [2, 6], accents: [2, 6] },
            { label: 'BD', hits: [0, 4] },
            { label: 'FT', hits: [0] },
        ]),
    ],
    'drm-05-kick-consistency': [
        groove('Kick Lock', 'Keep the low-end notes as even and calm as the hi-hat pulse.', 8, [
            { label: 'HH', hits: [0, 1, 2, 3, 4, 5, 6, 7] },
            { label: 'SD', hits: [2, 6], accents: [2, 6] },
            { label: 'BD', hits: [0, 3, 4, 7] },
        ]),
    ],
    'drm-06-ghost-note-entry': [
        groove('Ghost Note Balance', 'Big backbeats, tiny ghost notes. That contrast is the whole pocket.', 8, [
            { label: 'HH', hits: [0, 1, 2, 3, 4, 5, 6, 7] },
            { label: 'SD', hits: [1, 2, 5, 6], accents: [2, 6] },
            { label: 'BD', hits: [0, 4] },
        ]),
    ],
    'drm-07-fill-construction': [
        groove('One-Beat Fill', 'Keep the grid steady even when the hands start moving across the kit.', 8, [
            { label: 'HH', hits: [0, 1, 2, 3, 4, 5] },
            { label: 'SD', hits: [2, 6], accents: [2] },
            { label: 'T1', hits: [6] },
            { label: 'FT', hits: [7] },
            { label: 'BD', hits: [0, 4] },
        ]),
    ],
    'drm-08-shuffle-feel': [
        groove('Shuffle Grid', 'Think triplet bounce, not straight sixteenth-note stiffness.', 12, [
            { label: 'HH', hits: [0, 2, 3, 5, 6, 8, 9, 11] },
            { label: 'SD', hits: [3, 9], accents: [3, 9] },
            { label: 'BD', hits: [0, 6, 8] },
        ]),
    ],
    'drm-09-linear-groove-basics': [
        groove('Simple Linear Phrase', 'No two limbs together. Let each note have its own slot.', 8, [
            { label: 'HH', hits: [0, 2, 4, 6] },
            { label: 'SD', hits: [1, 5], accents: [5] },
            { label: 'BD', hits: [3, 7] },
        ]),
    ],
    'drm-10-song-form-drummer': [
        pattern('Form Map', 'Pick one groove role for each section before adding fills.', ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Final chorus', 'Outro']),
    ],
};
