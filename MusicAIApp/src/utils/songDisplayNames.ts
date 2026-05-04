const AUDIO_EXTENSION_PATTERN = /\.(mp3|m4a|wav|aac|flac|ogg|webm)$/i;
const FALLBACK_SONG_TITLE = 'Untitled Song';

function decodeDisplayText(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value
            .replace(/%20/gi, ' ')
            .replace(/%28/gi, '(')
            .replace(/%29/gi, ')')
            .replace(/%5B/gi, '[')
            .replace(/%5D/gi, ']');
    }
}

export function cleanUploadedSongDisplayName(value: string | null | undefined) {
    if (!value || !value.trim()) {
        return FALLBACK_SONG_TITLE;
    }

    const withoutQuery = value.trim().split(/[?#]/, 1)[0] ?? '';
    const pathParts = withoutQuery.split(/[\\/]+/).filter(Boolean);
    const rawName = pathParts[pathParts.length - 1] ?? withoutQuery;
    const decoded = decodeDisplayText(rawName);
    const withoutExtension = decoded.replace(AUDIO_EXTENSION_PATTERN, '');
    const cleaned = withoutExtension.replace(/\s+/g, ' ').trim();

    return cleaned || FALLBACK_SONG_TITLE;
}
