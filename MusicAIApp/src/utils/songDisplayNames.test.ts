import { cleanUploadedSongDisplayName } from './songDisplayNames';

describe('cleanUploadedSongDisplayName', () => {
    it('decodes URL-encoded uploaded song names and strips audio extensions', () => {
        expect(
            cleanUploadedSongDisplayName('Halestorm%20-%20Bad%20Romance%20%28Lady%20Gaga%29%20%5BCover%5D.mp3'),
        ).toBe('Halestorm - Bad Romance (Lady Gaga) [Cover]');
    });

    it('strips common audio extensions from normal filenames', () => {
        expect(cleanUploadedSongDisplayName('song.mp3')).toBe('song');
        expect(cleanUploadedSongDisplayName('Another Take.WAV')).toBe('Another Take');
    });

    it('does not throw on malformed URI encoding', () => {
        expect(() => cleanUploadedSongDisplayName('bad%ZZsong.mp3')).not.toThrow();
        expect(cleanUploadedSongDisplayName('bad%ZZsong.mp3')).toBe('bad%ZZsong');
    });

    it('returns a safe fallback for empty values', () => {
        expect(cleanUploadedSongDisplayName(null)).toBe('Untitled Song');
        expect(cleanUploadedSongDisplayName(undefined)).toBe('Untitled Song');
        expect(cleanUploadedSongDisplayName('   ')).toBe('Untitled Song');
    });

    it('cleans storage-like paths only when they are used as display fallbacks', () => {
        expect(
            cleanUploadedSongDisplayName('analysis/2026/04/30/908f950928274e8fa0fa06dacbf5df60.mp3'),
        ).toBe('908f950928274e8fa0fa06dacbf5df60');
    });
});
