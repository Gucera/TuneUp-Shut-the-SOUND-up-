import type { LessonInstrument } from '../data/lessonLibrary';
import { supabase } from './supabaseClient';

export type LessonCategory = 'practical' | 'theory' | 'quiz' | 'game';

export const LESSON_CATEGORY_LABELS: Record<LessonCategory, string> = {
    practical: 'Lessons',
    theory: 'Theory',
    quiz: 'Quizzes',
    game: 'Games',
};

interface LessonCourseRow {
    id: string;
    title: string;
    instrument_type?: string | null;
    difficulty_level?: string | null;
}

interface LessonRow {
    id: string;
    title: string;
    order_index?: number | null;
    xp_reward?: number | null;
    image_url?: string | null;
    video_url?: string | null;
    difficulty?: string | null;
    content_json?: unknown;
    content?: unknown;
    type?: string | null;
    courses?: LessonCourseRow | LessonCourseRow[] | null;
    quizzes?: Array<{ id: string }> | null;
}

interface QuizRow {
    id: string;
    question: string;
    options?: unknown;
    correct_option_index?: number | null;
    explanation?: string | null;
    created_at?: string | null;
}

export interface FetchLessonCatalogOptions {
    category: LessonCategory;
    instrument?: LessonInstrument;
}

export interface LessonCatalogItem {
    id: string;
    title: string;
    subtitle: string;
    tier: string;
    category: LessonCategory;
    categoryLabel: string;
    instrument: LessonInstrument | null;
    instrumentLabel: string;
    durationMin: number;
    xpReward: number;
    imageUrl: string | null;
    videoUrl: string | null;
    focusTags: string[];
    courseTitle: string;
    orderIndex: number;
}

export interface LessonQuiz {
    id: string;
    question: string;
    options: string[];
    correctOptionIndex: number;
    explanation: string | null;
}

export interface LessonDetail {
    id: string;
    title: string;
    summary: string;
    steps: string[];
    tier: string;
    category: LessonCategory;
    categoryLabel: string;
    instrument: LessonInstrument | null;
    instrumentLabel: string;
    durationMin: number;
    xpReward: number;
    imageUrl: string | null;
    videoUrl: string | null;
    focusTags: string[];
    courseTitle: string;
    quizzes: LessonQuiz[];
}

interface NormalizedLessonContent {
    summary: string;
    steps: string[];
    focusTags: string[];
    durationMin: number | null;
}

function asSingleRow<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
}

function normalizePracticeInstrument(raw: string | null | undefined): LessonInstrument | null {
    if (raw === 'Piano' || raw === 'Drums') {
        return raw;
    }

    if (raw === 'Guitar') {
        return raw;
    }

    return null;
}

function normalizeLessonCategory(raw: string | null | undefined): LessonCategory {
    if (raw === 'theory' || raw === 'quiz' || raw === 'game') {
        return raw;
    }

    return 'practical';
}

function asStringArray(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0);
}

function normalizeMediaReference(value: string | null | undefined) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function getTierFallback(category: LessonCategory) {
    switch (category) {
        case 'theory':
            return 'Core Theory';
        case 'quiz':
            return 'Challenge Set';
        case 'game':
            return 'Interactive';
        default:
            return 'Beginner';
    }
}

function normalizeLessonContent(contentJson: unknown, legacyContent: unknown): NormalizedLessonContent {
    const primary = contentJson && typeof contentJson === 'object' && !Array.isArray(contentJson)
        ? contentJson as Record<string, unknown>
        : null;
    const legacy = legacyContent && typeof legacyContent === 'object' && !Array.isArray(legacyContent)
        ? legacyContent as Record<string, unknown>
        : null;

    const steps = asStringArray(primary?.steps ?? legacy?.steps);
    const summaryCandidates = [
        primary?.summary,
        legacy?.summary,
        primary?.description,
        legacy?.description,
        steps[0],
    ];
    const summary = summaryCandidates.find((entry) => typeof entry === 'string' && entry.trim().length > 0);

    const focusTags = asStringArray(
        primary?.focus_tags
            ?? primary?.focusTags
            ?? primary?.tags
            ?? legacy?.focus_tags
            ?? legacy?.focusTags
            ?? legacy?.tags,
    );

    const durationCandidate = primary?.duration_min
        ?? primary?.durationMin
        ?? primary?.estimated_minutes
        ?? legacy?.duration_min
        ?? legacy?.durationMin
        ?? legacy?.estimated_minutes;
    const durationMin = typeof durationCandidate === 'number' && Number.isFinite(durationCandidate)
        ? Math.max(1, Math.round(durationCandidate))
        : null;

    return {
        summary: typeof summary === 'string' && summary.trim().length > 0
            ? summary.trim()
            : 'A premium practice lesson with guided steps, checkpoints, and structured XP progression.',
        steps,
        focusTags,
        durationMin,
    };
}

function buildFallbackTags(
    content: NormalizedLessonContent,
    category: LessonCategory,
    instrumentLabel: string,
    tier: string,
    xpReward: number,
    quizCount: number,
) {
    if (content.focusTags.length > 0) {
        return content.focusTags.slice(0, 3);
    }

    const base = category === 'quiz'
        ? [`${Math.max(quizCount, 1)} questions`, tier.toLowerCase(), `${xpReward} xp`]
        : category === 'game'
            ? ['interactive', 'timed play', `${xpReward} xp`]
            : category === 'theory'
                ? ['music theory', tier.toLowerCase(), `${xpReward} xp`]
                : [instrumentLabel.toLowerCase(), tier.toLowerCase(), `${xpReward} xp`];

    return base.slice(0, 3);
}

function mapLessonRowToCatalogItem(row: LessonRow): LessonCatalogItem {
    const course = asSingleRow(row.courses);
    const category = normalizeLessonCategory(row.type);
    const categoryLabel = LESSON_CATEGORY_LABELS[category];
    const instrument = normalizePracticeInstrument(course?.instrument_type);
    const instrumentLabel = category === 'practical'
        ? (instrument ?? 'Instrument')
        : categoryLabel;
    const tier = row.difficulty?.trim() || course?.difficulty_level?.trim() || getTierFallback(category);
    const xpReward = typeof row.xp_reward === 'number' ? row.xp_reward : 0;
    const content = normalizeLessonContent(row.content_json, row.content);
    const quizCount = Array.isArray(row.quizzes) ? row.quizzes.length : 0;
    const durationMin = content.durationMin ?? (
        category === 'quiz'
            ? Math.max(6, Math.min(16, quizCount * 2))
            : category === 'game'
                ? Math.max(5, Math.min(18, (content.steps.length * 3) || 10))
                : Math.max(8, Math.min(28, (content.steps.length * 4) || 12))
    );

    return {
        id: row.id,
        title: row.title,
        subtitle: content.summary,
        tier,
        category,
        categoryLabel,
        instrument,
        instrumentLabel,
        durationMin,
        xpReward,
        imageUrl: normalizeMediaReference(row.image_url),
        videoUrl: normalizeMediaReference(row.video_url),
        focusTags: buildFallbackTags(content, category, instrumentLabel, tier, xpReward, quizCount),
        courseTitle: course?.title?.trim() || `TuneUp ${categoryLabel}`,
        orderIndex: typeof row.order_index === 'number' ? row.order_index : 0,
    };
}

function mapQuizRow(row: QuizRow): LessonQuiz {
    const options = asStringArray(row.options);

    return {
        id: row.id,
        question: row.question,
        options,
        correctOptionIndex: typeof row.correct_option_index === 'number' ? row.correct_option_index : 0,
        explanation: row.explanation ?? null,
    };
}

export async function fetchLessonCatalog({
    category,
    instrument,
}: FetchLessonCatalogOptions): Promise<LessonCatalogItem[]> {
    let query = supabase
        .from('lessons')
        .select(`
            id,
            title,
            order_index,
            xp_reward,
            image_url,
            video_url,
            difficulty,
            content_json,
            content,
            type,
            courses!inner(id,title,instrument_type,difficulty_level),
            quizzes(id)
        `)
        .eq('type', category)
        .order('order_index', { ascending: true });

    if (category === 'practical' && instrument) {
        query = query.eq('courses.instrument_type', instrument);
    }

    const { data, error } = await query;

    if (error) {
        throw error;
    }

    return (data ?? [])
        .map((row) => mapLessonRowToCatalogItem(row as LessonRow))
        .sort((left, right) => left.orderIndex - right.orderIndex);
}

export async function fetchLessonsForInstrument(instrument: LessonInstrument): Promise<LessonCatalogItem[]> {
    return fetchLessonCatalog({ category: 'practical', instrument });
}

export async function fetchLessonDetail(lessonId: string): Promise<LessonDetail> {
    const [{ data: lessonRow, error: lessonError }, { data: quizRows, error: quizError }] = await Promise.all([
        supabase
            .from('lessons')
            .select(`
                id,
                title,
                order_index,
                xp_reward,
                image_url,
                video_url,
                difficulty,
                content_json,
                content,
                type,
                courses!inner(id,title,instrument_type,difficulty_level)
            `)
            .eq('id', lessonId)
            .single(),
        supabase
            .from('quizzes')
            .select('id,question,options,correct_option_index,explanation,created_at')
            .eq('lesson_id', lessonId)
            .order('created_at', { ascending: true }),
    ]);

    if (lessonError) {
        throw lessonError;
    }

    if (quizError) {
        throw quizError;
    }

    const mappedLesson = mapLessonRowToCatalogItem(lessonRow as LessonRow);
    const content = normalizeLessonContent(
        (lessonRow as LessonRow).content_json,
        (lessonRow as LessonRow).content,
    );

    return {
        id: mappedLesson.id,
        title: mappedLesson.title,
        summary: content.summary,
        steps: content.steps,
        tier: mappedLesson.tier,
        category: mappedLesson.category,
        categoryLabel: mappedLesson.categoryLabel,
        instrument: mappedLesson.instrument,
        instrumentLabel: mappedLesson.instrumentLabel,
        durationMin: mappedLesson.durationMin,
        xpReward: mappedLesson.xpReward,
        imageUrl: mappedLesson.imageUrl,
        videoUrl: mappedLesson.videoUrl,
        focusTags: mappedLesson.focusTags,
        courseTitle: mappedLesson.courseTitle,
        quizzes: (quizRows ?? []).map((row) => mapQuizRow(row as QuizRow)),
    };
}
