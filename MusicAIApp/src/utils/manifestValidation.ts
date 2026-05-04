import {
    SongAnalysisConfidence,
    SongChordEvent,
    SongLesson,
    SongTabNote,
    SongTuningMetadata,
} from '../data/songLessons';

export type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; errors: string[] };

type SongDifficulty = SongLesson['difficulty'];

export interface ValidatedSongManifest {
    id?: string;
    title?: string;
    artist?: string;
    difficulty?: SongDifficulty;
    bpm?: number;
    durationSec?: number;
    chordEvents: SongChordEvent[];
    tabNotes: SongTabNote[];
    instrument?: string;
    tuning?: SongTuningMetadata;
    aiDraft?: boolean;
    confidence?: SongAnalysisConfidence;
    warnings?: string[];
}

const MIN_CHORD_LANE_ROW = 0;
const MAX_CHORD_LANE_ROW = 3;
const MIN_STRING_INDEX = 0;
const MAX_STRING_INDEX = 5;
const MAX_ERROR_COUNT = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeTime(value: unknown): value is number {
    return isFiniteNumber(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
    return isFiniteNumber(value) && value > 0;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
    return Number.isInteger(value) && typeof value === 'number' && value >= min && value <= max;
}

function addError(errors: string[], message: string) {
    if (errors.length < MAX_ERROR_COUNT) {
        errors.push(message);
    }
}

function validateOptionalString(
    value: unknown,
    fieldName: string,
    errors: string[],
): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string') {
        addError(errors, `${fieldName} must be a string if present.`);
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

function validateDifficulty(value: unknown, errors: string[]): SongDifficulty | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === 'Easy' || value === 'Medium' || value === 'Hard') {
        return value;
    }

    addError(errors, 'difficulty must be Easy, Medium, or Hard if present.');
    return undefined;
}

function validateChordEvents(value: unknown, errors: string[]): SongChordEvent[] {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value)) {
        addError(errors, 'chordEvents must be an array.');
        return [];
    }

    const events: SongChordEvent[] = [];

    value.forEach((entry, index) => {
        if (!isRecord(entry)) {
            addError(errors, `chordEvents[${index}] must be an object.`);
            return;
        }

        if (!isNonNegativeTime(entry.timeSec)) {
            addError(errors, `chordEvents[${index}].timeSec must be a finite number >= 0.`);
        }

        if (typeof entry.chord !== 'string' || !entry.chord.trim()) {
            addError(errors, `chordEvents[${index}].chord must be a non-empty string.`);
        }

        if (!isIntegerInRange(entry.laneRow, MIN_CHORD_LANE_ROW, MAX_CHORD_LANE_ROW)) {
            addError(
                errors,
                `chordEvents[${index}].laneRow must be an integer between 0 and 3.`,
            );
        }

        const timeSec = entry.timeSec;
        const chord = entry.chord;
        const laneRow = entry.laneRow;
        if (
            isNonNegativeTime(timeSec)
            && typeof chord === 'string'
            && chord.trim()
            && isIntegerInRange(laneRow, MIN_CHORD_LANE_ROW, MAX_CHORD_LANE_ROW)
        ) {
            events.push({
                timeSec,
                chord: chord.trim(),
                laneRow,
            });
        }
    });

    return events.sort((a, b) => a.timeSec - b.timeSec);
}

function validateTabNotes(value: unknown, errors: string[]): SongTabNote[] {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value)) {
        addError(errors, 'tabNotes must be an array.');
        return [];
    }

    const notes: SongTabNote[] = [];

    value.forEach((entry, index) => {
        if (!isRecord(entry)) {
            addError(errors, `tabNotes[${index}] must be an object.`);
            return;
        }

        if (!isNonNegativeTime(entry.timeSec)) {
            addError(errors, `tabNotes[${index}].timeSec must be a finite number >= 0.`);
        }

        if (!isIntegerInRange(entry.stringIndex, MIN_STRING_INDEX, MAX_STRING_INDEX)) {
            addError(
                errors,
                `tabNotes[${index}].stringIndex must be an integer between 0 and 5.`,
            );
        }

        if (!Number.isInteger(entry.fret) || typeof entry.fret !== 'number' || entry.fret < 0) {
            addError(errors, `tabNotes[${index}].fret must be a non-negative integer.`);
        }

        if (entry.durationSec !== undefined && !isPositiveNumber(entry.durationSec)) {
            addError(errors, `tabNotes[${index}].durationSec must be a positive number if present.`);
        }

        const timeSec = entry.timeSec;
        const stringIndex = entry.stringIndex;
        const fret = entry.fret;
        const durationSec = entry.durationSec;
        if (
            isNonNegativeTime(timeSec)
            && isIntegerInRange(stringIndex, MIN_STRING_INDEX, MAX_STRING_INDEX)
            && Number.isInteger(fret)
            && typeof fret === 'number'
            && fret >= 0
            && (durationSec === undefined || isPositiveNumber(durationSec))
        ) {
            notes.push({
                timeSec,
                stringIndex,
                fret,
                ...(durationSec !== undefined ? { durationSec } : {}),
            });
        }
    });

    return notes.sort((a, b) => a.timeSec - b.timeSec);
}

function validateUnusedTimingArray(
    value: unknown,
    fieldName: 'markers' | 'sections',
    errors: string[],
) {
    if (value === undefined) {
        return;
    }

    if (!Array.isArray(value)) {
        addError(errors, `${fieldName} must be an array if present.`);
        return;
    }

    value.forEach((entry, index) => {
        if (!isRecord(entry)) {
            addError(errors, `${fieldName}[${index}] must be an object.`);
            return;
        }

        if (!isNonNegativeTime(entry.timeSec)) {
            addError(errors, `${fieldName}[${index}].timeSec must be a finite number >= 0.`);
        }

        const label = fieldName === 'markers' ? entry.label : entry.name;
        if (label !== undefined && typeof label !== 'string') {
            addError(errors, `${fieldName}[${index}] label/name must be a string if present.`);
        }
    });
}

function validateStringArray(value: unknown, fieldName: string, errors: string[]): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        addError(errors, `${fieldName} must be an array if present.`);
        return undefined;
    }

    const strings: string[] = [];
    value.forEach((entry, index) => {
        if (typeof entry !== 'string' || !entry.trim()) {
            addError(errors, `${fieldName}[${index}] must be a non-empty string.`);
            return;
        }
        strings.push(entry.trim());
    });

    return strings;
}

function validateTuning(value: unknown, errors: string[]): SongTuningMetadata | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!isRecord(value)) {
        addError(errors, 'tuning must be an object if present.');
        return undefined;
    }

    const id = validateOptionalString(value.id, 'tuning.id', errors);
    const name = validateOptionalString(value.name, 'tuning.name', errors);
    const stringNotes = validateStringArray(value.stringNotes, 'tuning.stringNotes', errors);

    if (!id) {
        addError(errors, 'tuning.id must be a non-empty string if tuning is present.');
    }

    if (!name) {
        addError(errors, 'tuning.name must be a non-empty string if tuning is present.');
    }

    if (!stringNotes) {
        addError(errors, 'tuning.stringNotes must be present when tuning is present.');
    }

    if (!id || !name || !stringNotes) {
        return undefined;
    }

    return { id, name, stringNotes };
}

function validateConfidence(value: unknown, errors: string[]): SongAnalysisConfidence | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!isRecord(value)) {
        addError(errors, 'confidence must be an object if present.');
        return undefined;
    }

    const confidence: Partial<SongAnalysisConfidence> = {};
    (['overall', 'chords', 'tabs', 'sections'] as const).forEach((key) => {
        const score = value[key];
        if (!isFiniteNumber(score) || score < 0 || score > 1) {
            addError(errors, `confidence.${key} must be a number between 0 and 1 if present.`);
            return;
        }
        confidence[key] = score;
    });

    if (
        confidence.overall === undefined
        || confidence.chords === undefined
        || confidence.tabs === undefined
        || confidence.sections === undefined
    ) {
        return undefined;
    }

    return confidence as SongAnalysisConfidence;
}

export function validateSongManifest(input: unknown): ValidationResult<ValidatedSongManifest> {
    const errors: string[] = [];

    if (!isRecord(input)) {
        return { ok: false, errors: ['Song manifest must be a JSON object.'] };
    }

    const id = validateOptionalString(input.id, 'id', errors);
    const title = validateOptionalString(input.title, 'title', errors);
    const artist = validateOptionalString(input.artist, 'artist', errors);
    const instrument = validateOptionalString(input.instrument, 'instrument', errors);
    const difficulty = validateDifficulty(input.difficulty, errors);
    const tuning = validateTuning(input.tuning, errors);
    const normalizedInstrument = instrument?.toLowerCase();
    if (tuning && tuning.stringNotes.length > 0) {
        if (normalizedInstrument === 'guitar' && tuning.stringNotes.length !== 6) {
            addError(errors, 'guitar tuning.stringNotes must contain exactly 6 strings.');
        }
        if (normalizedInstrument === 'bass' && tuning.stringNotes.length !== 4) {
            addError(errors, 'bass tuning.stringNotes must contain exactly 4 strings.');
        }
    }
    const confidence = validateConfidence(input.confidence, errors);
    const warnings = validateStringArray(input.warnings, 'warnings', errors);
    const aiDraft = input.aiDraft === undefined ? undefined : input.aiDraft === true;

    let bpm: number | undefined;
    const rawBpm = input.bpm;
    if (rawBpm !== undefined) {
        if (isPositiveNumber(rawBpm)) {
            bpm = rawBpm;
        } else {
            addError(errors, 'bpm must be a positive number if present.');
        }
    }

    let durationSec: number | undefined;
    const rawDurationSec = input.durationSec;
    if (rawDurationSec !== undefined) {
        if (isPositiveNumber(rawDurationSec)) {
            durationSec = rawDurationSec;
        } else {
            addError(errors, 'durationSec must be a positive number if present.');
        }
    }

    const chordEvents = validateChordEvents(input.chordEvents, errors);
    const tabNotes = validateTabNotes(input.tabNotes, errors);
    validateUnusedTimingArray(input.markers, 'markers', errors);
    validateUnusedTimingArray(input.sections, 'sections', errors);

    if (chordEvents.length === 0 && tabNotes.length === 0) {
        addError(errors, 'Manifest must contain at least one chord event or tab note.');
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        value: {
            ...(id ? { id } : {}),
            ...(title ? { title } : {}),
            ...(artist ? { artist } : {}),
            ...(instrument ? { instrument } : {}),
            ...(difficulty ? { difficulty } : {}),
            ...(bpm !== undefined ? { bpm } : {}),
            ...(durationSec !== undefined ? { durationSec } : {}),
            ...(tuning ? { tuning } : {}),
            ...(aiDraft !== undefined ? { aiDraft } : {}),
            ...(confidence ? { confidence } : {}),
            ...(warnings ? { warnings } : {}),
            chordEvents,
            tabNotes,
        },
    };
}

export function parseSongManifestJson(text: string): ValidationResult<ValidatedSongManifest> {
    if (!text.trim()) {
        return {
            ok: false,
            errors: ['This file is empty. Please choose a valid TuneUp song manifest.'],
        };
    }

    try {
        return validateSongManifest(JSON.parse(text) as unknown);
    } catch {
        return {
            ok: false,
            errors: ['This file is not valid JSON. Please choose a valid TuneUp song manifest.'],
        };
    }
}

export function formatManifestValidationError(errors: string[]) {
    const shownErrors = errors.slice(0, 4);
    const suffix = errors.length > shownErrors.length
        ? `\n- ${errors.length - shownErrors.length} more issue(s).`
        : '';

    return `Invalid song manifest. Please fix the following issues:\n- ${shownErrors.join('\n- ')}${suffix}`;
}
