import type { SongLesson } from '../data/songLessons';
import type { SongImportResultPayload } from '../services/api';

export type SongStatus =
    | 'ready'
    | 'uploading'
    | 'queued'
    | 'analyzing'
    | 'review_ready'
    | 'failed'
    | 'imported';

export type SongLibraryFilter = 'all' | 'ready' | 'analyzing' | 'failed' | 'imported' | 'favorites';
export type SongLibrarySortMode = 'recent' | 'title' | 'bpm' | 'ai_draft' | 'verified';

export interface SongLibraryCard {
    id: string;
    title: string;
    artist: string;
    difficulty: SongLesson['difficulty'];
    bpm?: number;
    durationSec: number;
    chordCount: number;
    tabNoteCount: number;
    isImported: boolean;
    aiDraft: boolean;
    isVerified: boolean;
    isDemo: boolean;
    isFavorite: boolean;
    createdAt?: string;
    updatedAt?: string;
    status: SongStatus;
}

export function formatSongDuration(durationSec: number) {
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return '--';
    }

    const minutes = Math.floor(durationSec / 60);
    const seconds = Math.round(durationSec % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

export function formatBpm(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? `${Math.round(value)} BPM`
        : 'BPM unknown';
}

export function getSongContentBadges(song: Pick<SongLesson, 'chordEvents' | 'tabNotes'>) {
    const badges: string[] = [];

    if (song.chordEvents.length > 0) {
        badges.push('Chords');
    }

    if (song.tabNotes.length > 0) {
        badges.push('Tabs');
    }

    return badges.length > 0 ? badges : ['Chart'];
}

export function getSongLibraryBadges(song: Pick<SongLesson, 'chordEvents' | 'tabNotes' | 'aiDraft' | 'tuning' | 'confidence' | 'isDemo' | 'isVerified' | 'source' | 'isImported' | 'isFavorite' | 'bpm'>) {
    const badges: string[] = [];

    if (song.isFavorite) {
        badges.push('Favorite');
    }

    if (song.isDemo || song.source === 'demo') {
        badges.push('Demo');
    }

    if (song.isVerified) {
        badges.push('Verified');
    }

    if (song.aiDraft) {
        badges.push('AI Draft');
    }

    if (song.isImported) {
        badges.push('Imported');
    }

    if (song.tuning?.name) {
        badges.push(song.tuning.name);
    }

    if (typeof song.bpm === 'number' && Number.isFinite(song.bpm) && song.bpm > 0) {
        badges.push(formatBpm(song.bpm));
    }

    if (song.confidence && song.confidence.tabs < 0.4 && badges.length < 5) {
        badges.push('Low tab confidence');
    }

    for (const badge of getSongContentBadges(song)) {
        if (badges.length >= 5) {
            break;
        }
        badges.push(badge);
    }

    return [...new Set(badges)].slice(0, 5);
}

export function toSongLibraryCard(song: SongLesson): SongLibraryCard {
    return {
        id: song.id,
        title: song.title,
        artist: song.artist,
        difficulty: song.difficulty,
        ...(typeof song.bpm === 'number' && Number.isFinite(song.bpm) && song.bpm > 0 ? { bpm: song.bpm } : {}),
        durationSec: song.durationSec,
        chordCount: song.chordEvents.length,
        tabNoteCount: song.tabNotes.length,
        isImported: song.isImported === true,
        aiDraft: song.aiDraft === true,
        isVerified: song.isVerified === true,
        isDemo: song.isDemo === true || song.source === 'demo',
        isFavorite: song.isFavorite === true,
        ...(song.createdAt ? { createdAt: song.createdAt } : {}),
        ...(song.updatedAt ? { updatedAt: song.updatedAt } : {}),
        status: song.isImported ? 'imported' : 'ready',
    };
}

export function filterSongLibraryCards(
    cards: SongLibraryCard[],
    query: string,
    filter: SongLibraryFilter,
) {
    const normalizedQuery = query.trim().toLowerCase();

    return cards.filter((card) => {
        const matchesFilter = filter === 'all'
            || (filter === 'ready' && card.status === 'ready')
            || (filter === 'analyzing' && (card.status === 'uploading' || card.status === 'queued' || card.status === 'analyzing' || card.status === 'review_ready'))
            || (filter === 'failed' && card.status === 'failed')
            || (filter === 'imported' && card.status === 'imported')
            || (filter === 'favorites' && card.isFavorite);

        if (!matchesFilter) {
            return false;
        }

        if (!normalizedQuery) {
            return true;
        }

        return `${card.title} ${card.artist}`.toLowerCase().includes(normalizedQuery);
    });
}

function getTimestampValue(value?: string) {
    if (!value) {
        return 0;
    }

    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
}

export function sortSongLibraryCards(cards: SongLibraryCard[], sortMode: SongLibrarySortMode) {
    return [...cards].sort((a, b) => {
        switch (sortMode) {
            case 'title':
                return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
                    || a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });
            case 'bpm': {
                const aBpm = typeof a.bpm === 'number' && Number.isFinite(a.bpm) && a.bpm > 0 ? a.bpm : Number.POSITIVE_INFINITY;
                const bBpm = typeof b.bpm === 'number' && Number.isFinite(b.bpm) && b.bpm > 0 ? b.bpm : Number.POSITIVE_INFINITY;
                return aBpm - bBpm || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            }
            case 'ai_draft':
                return Number(b.aiDraft) - Number(a.aiDraft)
                    || getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt)
                    || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            case 'verified':
                return Number(b.isVerified || b.isDemo) - Number(a.isVerified || a.isDemo)
                    || getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt)
                    || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            case 'recent':
            default:
                return getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt)
                    || getTimestampValue(b.updatedAt) - getTimestampValue(a.updatedAt)
                    || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        }
    });
}

export function formatLibraryCount(filteredCount: number, totalCount: number, hasActiveFilter: boolean) {
    const label = totalCount === 1 ? 'song' : 'songs';
    return hasActiveFilter ? `${filteredCount} of ${totalCount} ${label}` : `${totalCount} ${label}`;
}

export function getSongStatusLabel(status: SongStatus) {
    switch (status) {
        case 'uploading':
            return 'Uploading';
        case 'queued':
            return 'Queued';
        case 'analyzing':
            return 'Analyzing';
        case 'review_ready':
            return 'Review';
        case 'failed':
            return 'Failed';
        case 'imported':
            return 'Imported';
        case 'ready':
        default:
            return 'Ready';
    }
}

export function buildSongImportReviewWarnings(result: SongImportResultPayload) {
    const warnings: string[] = [
        'AI-generated tabs are drafts and may require correction.',
        ...result.warnings,
        ...(result.songManifest.warnings ?? []),
    ];
    const manifest = result.songManifest;

    if (result.fallbackUsed) {
        warnings.push('TuneUp generated a safe starter chart because confidence was limited.');
    }

    if (Number.isFinite(result.confidence) && result.confidence > 0 && result.confidence < 0.45) {
        warnings.push('Analysis confidence is low. Review the chart before practice.');
    }

    if (result.confidenceBreakdown.tabs < 0.4) {
        warnings.push('Tab confidence is low. Chords and sections may be more reliable than exact fret positions.');
    }

    if (manifest.tuning?.id.includes('custom_unknown')) {
        warnings.push('Unknown tuning selected. Generated fret positions may need manual correction.');
    }

    if (manifest.chordEvents.length === 0) {
        warnings.push('No chord events were detected.');
    }

    if (manifest.tabNotes.length === 0) {
        warnings.push('Tabs are unavailable for this import.');
    }

    return [...new Set(warnings)];
}
