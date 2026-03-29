import type { LessonInstrument } from '../data/lessonLibrary';

export type LessonsStackParamList = {
    LessonLibrary: {
        lessonInstrument?: LessonInstrument;
        selectedLessonId?: string;
    } | undefined;
    LessonDetail: {
        lessonId: string;
    };
};
