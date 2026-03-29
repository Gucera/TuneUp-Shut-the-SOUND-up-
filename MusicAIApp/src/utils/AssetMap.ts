import type { AVPlaybackSource } from 'expo-av';
import type { ImageSourcePropType } from 'react-native';

export const FALLBACK_IMAGE = require('../../assets/icon.png');

const GUITAR_CAROUSEL = require('../images/instrument-picker/guitar-instrument-picker.png');
const PIANO_CAROUSEL = require('../images/instrument-picker/piano-instrument-picker.png');
const DRUMS_CAROUSEL = require('../images/instrument-picker/drum-instrument-picker.png');
const FOUNDATIONS_THUMB = require('../images/lesson-thumbnails/beginner-chords-thumbnail.png');
const RHYTHM_THUMB = require('../images/lesson-thumbnails/rhythm-timing-thumbnail.png');
const EXPRESSION_THUMB = require('../images/lesson-thumbnails/lead-guitar-thumbnail.png');
const LESSON_INTRO_VIDEO = require('../images/videos/lesson-intro.mp4');

export const IMAGE_ASSET_MAP = {
    guitar_carousel: GUITAR_CAROUSEL,
    piano_carousel: PIANO_CAROUSEL,
    drums_carousel: DRUMS_CAROUSEL,
    guitar_foundations_thumb: FOUNDATIONS_THUMB,
    guitar_rhythm_thumb: RHYTHM_THUMB,
    guitar_expression_thumb: EXPRESSION_THUMB,
    piano_foundations_thumb: FOUNDATIONS_THUMB,
    piano_rhythm_thumb: RHYTHM_THUMB,
    piano_expression_thumb: EXPRESSION_THUMB,
    drums_foundations_thumb: FOUNDATIONS_THUMB,
    drums_rhythm_thumb: RHYTHM_THUMB,
    drums_expression_thumb: EXPRESSION_THUMB,
    theory_icon_1: FOUNDATIONS_THUMB,
    theory_icon_2: RHYTHM_THUMB,
    theory_icon_3: EXPRESSION_THUMB,
    theory_icon_4: PIANO_CAROUSEL,
    theory_icon_5: DRUMS_CAROUSEL,
    practical_guitar_1: FOUNDATIONS_THUMB,
    practical_guitar_2: RHYTHM_THUMB,
    practical_guitar_3: EXPRESSION_THUMB,
    practical_guitar_4: GUITAR_CAROUSEL,
    practical_guitar_5: FOUNDATIONS_THUMB,
    practical_piano_1: PIANO_CAROUSEL,
    practical_piano_2: RHYTHM_THUMB,
    practical_piano_3: FOUNDATIONS_THUMB,
    practical_piano_4: EXPRESSION_THUMB,
    practical_piano_5: PIANO_CAROUSEL,
    practical_drums_1: DRUMS_CAROUSEL,
    practical_drums_2: RHYTHM_THUMB,
    practical_drums_3: EXPRESSION_THUMB,
    practical_drums_4: FOUNDATIONS_THUMB,
    practical_drums_5: DRUMS_CAROUSEL,
    quiz_bg_blue: RHYTHM_THUMB,
    quiz_bg_violet: FOUNDATIONS_THUMB,
    quiz_bg_mint: EXPRESSION_THUMB,
    quiz_bg_cyan: PIANO_CAROUSEL,
    quiz_bg_sky: GUITAR_CAROUSEL,
    quiz_bg_lagoon: DRUMS_CAROUSEL,
    quiz_bg_amethyst: FOUNDATIONS_THUMB,
    quiz_bg_teal: RHYTHM_THUMB,
    quiz_bg_sunset: EXPRESSION_THUMB,
    quiz_bg_aurora: PIANO_CAROUSEL,
    game_logo_ear: EXPRESSION_THUMB,
    game_logo_notes: FOUNDATIONS_THUMB,
    game_logo_rhythm: RHYTHM_THUMB,
    game_logo_chords: GUITAR_CAROUSEL,
    game_logo_intervals: PIANO_CAROUSEL,
} as const;

export const VIDEO_ASSET_MAP = {
    lesson_video_intro: LESSON_INTRO_VIDEO,
    guitar_foundations_video: LESSON_INTRO_VIDEO,
    guitar_rhythm_video: LESSON_INTRO_VIDEO,
    guitar_expression_video: LESSON_INTRO_VIDEO,
    piano_foundations_video: LESSON_INTRO_VIDEO,
    piano_rhythm_video: LESSON_INTRO_VIDEO,
    piano_expression_video: LESSON_INTRO_VIDEO,
    drums_foundations_video: LESSON_INTRO_VIDEO,
    drums_rhythm_video: LESSON_INTRO_VIDEO,
    drums_expression_video: LESSON_INTRO_VIDEO,
    theory_video_1: LESSON_INTRO_VIDEO,
    theory_video_2: LESSON_INTRO_VIDEO,
    theory_video_3: LESSON_INTRO_VIDEO,
    theory_video_4: LESSON_INTRO_VIDEO,
    theory_video_5: LESSON_INTRO_VIDEO,
    practical_guitar_video_1: LESSON_INTRO_VIDEO,
    practical_guitar_video_2: LESSON_INTRO_VIDEO,
    practical_guitar_video_3: LESSON_INTRO_VIDEO,
    practical_guitar_video_4: LESSON_INTRO_VIDEO,
    practical_guitar_video_5: LESSON_INTRO_VIDEO,
    practical_piano_video_1: LESSON_INTRO_VIDEO,
    practical_piano_video_2: LESSON_INTRO_VIDEO,
    practical_piano_video_3: LESSON_INTRO_VIDEO,
    practical_piano_video_4: LESSON_INTRO_VIDEO,
    practical_piano_video_5: LESSON_INTRO_VIDEO,
    practical_drums_video_1: LESSON_INTRO_VIDEO,
    practical_drums_video_2: LESSON_INTRO_VIDEO,
    practical_drums_video_3: LESSON_INTRO_VIDEO,
    practical_drums_video_4: LESSON_INTRO_VIDEO,
    practical_drums_video_5: LESSON_INTRO_VIDEO,
    quiz_motion_1: LESSON_INTRO_VIDEO,
    quiz_motion_2: LESSON_INTRO_VIDEO,
    quiz_motion_3: LESSON_INTRO_VIDEO,
    quiz_motion_4: LESSON_INTRO_VIDEO,
    quiz_motion_5: LESSON_INTRO_VIDEO,
    quiz_motion_6: LESSON_INTRO_VIDEO,
    quiz_motion_7: LESSON_INTRO_VIDEO,
    quiz_motion_8: LESSON_INTRO_VIDEO,
    quiz_motion_9: LESSON_INTRO_VIDEO,
    quiz_motion_10: LESSON_INTRO_VIDEO,
    game_video_1: LESSON_INTRO_VIDEO,
    game_video_2: LESSON_INTRO_VIDEO,
    game_video_3: LESSON_INTRO_VIDEO,
    game_video_4: LESSON_INTRO_VIDEO,
    game_video_5: LESSON_INTRO_VIDEO,
} as const;

export const ASSET_MAP = {
    ...IMAGE_ASSET_MAP,
    ...VIDEO_ASSET_MAP,
} as const;

export type AssetImageKey = keyof typeof IMAGE_ASSET_MAP;
export type AssetVideoKey = keyof typeof VIDEO_ASSET_MAP;
export type AssetKey = keyof typeof ASSET_MAP;

function normalizeAssetReference(value?: string | null) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function isRemoteUri(value: string) {
    return /^https?:\/\//i.test(value);
}

export function resolveOptionalImageAsset(value?: string | null): ImageSourcePropType | null {
    const reference = normalizeAssetReference(value);

    if (!reference) {
        return null;
    }

    if (reference in IMAGE_ASSET_MAP) {
        return IMAGE_ASSET_MAP[reference as AssetImageKey];
    }

    if (isRemoteUri(reference)) {
        return { uri: reference };
    }

    return null;
}

export function resolveImageAsset(
    value?: string | null,
    fallback: ImageSourcePropType = FALLBACK_IMAGE,
): ImageSourcePropType {
    return resolveOptionalImageAsset(value) ?? fallback;
}

export function resolveVideoAsset(value?: string | null): AVPlaybackSource | null {
    const reference = normalizeAssetReference(value);

    if (!reference) {
        return null;
    }

    if (reference in VIDEO_ASSET_MAP) {
        return VIDEO_ASSET_MAP[reference as AssetVideoKey];
    }

    if (isRemoteUri(reference)) {
        return { uri: reference };
    }

    return null;
}
