import {
    buildSongImportReviewWarnings,
    filterSongLibraryCards,
    formatLibraryCount,
    formatBpm,
    formatSongDuration,
    getSongContentBadges,
    getSongLibraryBadges,
    sortSongLibraryCards,
    toSongLibraryCard,
} from './songLibraryView';
import type { SongLesson } from '../data/songLessons';

const baseSong: SongLesson = {
    id: 'demo',
    title: 'Demo Track',
    artist: 'Synthetic Artist',
    difficulty: 'Medium',
    backingTrack: { uri: 'file:///demo.wav' },
    bpm: 120,
    durationSec: 96,
    chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
    tabNotes: [{ timeSec: 0, stringIndex: 1, fret: 1, durationSec: 0.4 }],
};

describe('songLibraryView', () => {
    it('maps songs to searchable library cards', () => {
        const imported = toSongLibraryCard({ ...baseSong, isImported: true });
        const builtIn = toSongLibraryCard({ ...baseSong, id: 'starter', title: 'Starter Song' });

        expect(imported.status).toBe('imported');
        expect(imported.bpm).toBe(120);
        expect(builtIn.status).toBe('ready');
        expect(filterSongLibraryCards([imported, builtIn], 'synthetic', 'all')).toHaveLength(2);
        expect(filterSongLibraryCards([imported, builtIn], '', 'imported')).toEqual([imported]);
    });

    it('formats duration and content badges for song cards', () => {
        expect(formatSongDuration(96)).toBe('1:36');
        expect(formatBpm(123.6)).toBe('124 BPM');
        expect(formatBpm(null)).toBe('BPM unknown');
        expect(formatBpm(-4)).toBe('BPM unknown');
        expect(getSongContentBadges(baseSong)).toEqual(['Chords', 'Tabs']);
        expect(getSongContentBadges({ chordEvents: [], tabNotes: [] })).toEqual(['Chart']);
        expect(getSongLibraryBadges({
            ...baseSong,
            isDemo: true,
            isVerified: true,
            source: 'demo',
        })).toEqual(['Demo', 'Verified', '120 BPM', 'Chords', 'Tabs']);
        expect(getSongLibraryBadges({
            ...baseSong,
            aiDraft: true,
            tuning: { id: 'guitar_drop_c_sharp', name: 'Drop C#', stringNotes: [] },
            confidence: { overall: 0.4, chords: 0.6, tabs: 0.2, sections: 0.5 },
            isFavorite: true,
            isImported: true,
        })).toEqual(['Favorite', 'AI Draft', 'Imported', 'Drop C#', '120 BPM']);
        expect(formatLibraryCount(2, 5, true)).toBe('2 of 5 songs');
        expect(formatLibraryCount(1, 1, false)).toBe('1 song');
    });

    it('sorts by title, BPM, AI draft, verified, and filters favorites', () => {
        const alpha = toSongLibraryCard({
            ...baseSong,
            id: 'alpha',
            title: 'Alpha',
            bpm: 90,
            createdAt: '2026-01-02T00:00:00Z',
            isFavorite: true,
            isImported: true,
        });
        const bravo = toSongLibraryCard({
            ...baseSong,
            id: 'bravo',
            title: 'Bravo',
            aiDraft: true,
            createdAt: '2026-01-03T00:00:00Z',
            isImported: true,
        });
        const charlie = toSongLibraryCard({
            ...baseSong,
            id: 'charlie',
            title: 'Charlie',
            bpm: undefined,
            createdAt: '2026-01-01T00:00:00Z',
            isVerified: true,
        });
        const cards = [charlie, bravo, alpha];

        expect(sortSongLibraryCards(cards, 'title').map((card) => card.id)).toEqual(['alpha', 'bravo', 'charlie']);
        expect(sortSongLibraryCards(cards, 'bpm').map((card) => card.id)).toEqual(['alpha', 'bravo', 'charlie']);
        expect(sortSongLibraryCards(cards, 'ai_draft')[0].id).toBe('bravo');
        expect(sortSongLibraryCards(cards, 'verified')[0].id).toBe('charlie');
        expect(sortSongLibraryCards(cards, 'recent').map((card) => card.id)).toEqual(['bravo', 'alpha', 'charlie']);
        expect(filterSongLibraryCards(cards, '', 'favorites')).toEqual([alpha]);
    });

    it('builds review warnings for low-confidence or partial generated results', () => {
        const warnings = buildSongImportReviewWarnings({
            songId: null,
            audioUrl: null,
            bpm: 120,
            beatGrid: [],
            confidence: 0.3,
            confidenceBreakdown: { overall: 0.3, chords: 0.5, tabs: 0.2, sections: 0.5 },
            fallbackUsed: true,
            message: 'Generated with fallback.',
            warnings: [],
            songManifest: {
                title: 'Generated',
                artist: 'AI',
                instrument: 'guitar',
                tuning: { id: 'guitar_custom_unknown', name: 'Custom / Unknown', stringNotes: [] },
                difficulty: 'Medium',
                durationSec: 32,
                aiDraft: true,
                confidence: { overall: 0.3, chords: 0.5, tabs: 0.2, sections: 0.5 },
                warnings: [],
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [],
            },
        });

        expect(warnings).toContain('AI-generated tabs are drafts and may require correction.');
        expect(warnings).toContain('TuneUp generated a safe starter chart because confidence was limited.');
        expect(warnings).toContain('Analysis confidence is low. Review the chart before practice.');
        expect(warnings).toContain('Unknown tuning selected. Generated fret positions may need manual correction.');
        expect(warnings).toContain('Tabs are unavailable for this import.');
    });
});
