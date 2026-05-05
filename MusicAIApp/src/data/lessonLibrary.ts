export type LessonInstrument = 'Guitar' | 'Bass' | 'Piano' | 'Drums';
export type LessonTier = 'Beginner' | 'Early Intermediate' | 'Intermediate' | 'Upper Intermediate';
import { LESSON_VISUALS, LessonVisual } from './lessonVisuals';

export interface LessonPackage {
    id: string;
    instrument: LessonInstrument;
    tier: LessonTier;
    title: string;
    subtitle: string;
    durationMin: number;
    goal: string;
    focusTags: string[];
    warmup: string[];
    lessonSteps: string[];
    practiceLoop: string[];
    coachNotes: string[];
    checkpoint: string;
    visuals: LessonVisual[];
}

// The roadmap asked for real lesson JSON packs, so these stay as JSON and get loaded here.
type LessonPackageJson = Omit<LessonPackage, 'visuals'>;

function withVisuals(lesson: LessonPackageJson): LessonPackage {
    return {
        ...lesson,
        visuals: LESSON_VISUALS[lesson.id] ?? [],
    };
}

const guitarLessons = (require('./lessonPacks/guitarLessons.json') as LessonPackageJson[]).map(withVisuals);
const pianoLessons = (require('./lessonPacks/pianoLessons.json') as LessonPackageJson[]).map(withVisuals);
const drumLessons = (require('./lessonPacks/drumLessons.json') as LessonPackageJson[]).map(withVisuals);

export const LESSON_PACKS: LessonPackage[] = [...guitarLessons, ...pianoLessons, ...drumLessons];

export const LESSON_PACK_COUNTS: Record<LessonInstrument, number> = {
    Guitar: guitarLessons.length,
    Bass: 0,
    Piano: pianoLessons.length,
    Drums: drumLessons.length,
};

export function getLessonPackagesByInstrument(instrument: LessonInstrument): LessonPackage[] {
    return LESSON_PACKS.filter((lesson) => lesson.instrument === instrument);
}
