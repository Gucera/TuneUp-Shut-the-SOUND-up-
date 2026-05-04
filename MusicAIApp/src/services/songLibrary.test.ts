import * as FileSystem from 'expo-file-system/legacy';
import {
    deleteImportedSong,
    importSongFromFiles,
    importSongFromGeneratedManifest,
    loadImportedSongs,
    updateSavedSongFavorite,
    updateSavedSongMetadata,
} from './songLibrary';

jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///docs/',
    getInfoAsync: jest.fn(),
    makeDirectoryAsync: jest.fn(() => Promise.resolve()),
    readAsStringAsync: jest.fn(),
    writeAsStringAsync: jest.fn(() => Promise.resolve()),
    copyAsync: jest.fn(() => Promise.resolve()),
    deleteAsync: jest.fn(() => Promise.resolve()),
}));

const mockedFileSystem = jest.mocked(FileSystem);

function mockEmptyLibrary() {
    mockedFileSystem.getInfoAsync.mockImplementation((path) =>
        Promise.resolve({ exists: !String(path).endsWith('library.json') } as any),
    );
}

describe('songLibrary manual manifest import', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockEmptyLibrary();
    });

    it('rejects invalid JSON before copying audio or writing the library', async () => {
        mockedFileSystem.readAsStringAsync.mockResolvedValue('{not-json');

        await expect(
            importSongFromFiles(
                { uri: 'file:///audio.mp3', name: 'audio.mp3' },
                { uri: 'file:///manifest.json', name: 'manifest.json' },
            ),
        ).rejects.toThrow('This file is not valid JSON');

        expect(mockedFileSystem.copyAsync).not.toHaveBeenCalled();
        expect(mockedFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    });

    it('rejects invalid manifests before copying audio or writing the library', async () => {
        mockedFileSystem.readAsStringAsync.mockResolvedValue(
            JSON.stringify({
                title: 'Broken Song',
                chordEvents: [],
                tabNotes: [],
            }),
        );

        await expect(
            importSongFromFiles(
                { uri: 'file:///audio.mp3', name: 'audio.mp3' },
                { uri: 'file:///manifest.json', name: 'manifest.json' },
            ),
        ).rejects.toThrow('Manifest must contain at least one chord event or tab note');

        expect(mockedFileSystem.copyAsync).not.toHaveBeenCalled();
        expect(mockedFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    });

    it('saves only validated manifests', async () => {
        mockedFileSystem.readAsStringAsync.mockResolvedValue(
            JSON.stringify({
                title: 'Valid Song',
                artist: 'Synthetic Artist',
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
            }),
        );

        const song = await importSongFromFiles(
            { uri: 'file:///audio.mp3', name: 'audio.mp3' },
            { uri: 'file:///manifest.json', name: 'manifest.json' },
        );

        expect(song.title).toBe('Valid Song');
        expect(song.chordEvents).toEqual([{ timeSec: 0, chord: 'C', laneRow: 1 }]);
        expect(mockedFileSystem.copyAsync).toHaveBeenCalledTimes(1);
        expect(mockedFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
        expect(song.createdAt).toBeTruthy();
        expect(song.updatedAt).toBeTruthy();
        expect(song.sourceFileName).toBe('audio');
    });

    it('can reopen a saved generated manifest from the local library', async () => {
        let storedLibraryJson = '';
        mockedFileSystem.getInfoAsync.mockResolvedValue({ exists: true } as any);
        mockedFileSystem.readAsStringAsync.mockImplementation((path) =>
            Promise.resolve(String(path).endsWith('library.json') ? storedLibraryJson : '{}'),
        );
        mockedFileSystem.writeAsStringAsync.mockImplementation((_path, contents) => {
            storedLibraryJson = contents;
            return Promise.resolve();
        });

        const savedSong = await importSongFromGeneratedManifest(
            { uri: 'file:///generated.mp3', name: 'generated.mp3' },
            {
                id: 'generated-song',
                title: 'Generated Song',
                artist: 'Synthetic Artist',
                instrument: 'guitar',
                tuning: { id: 'guitar_drop_c_sharp', name: 'Drop C#', stringNotes: ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'] },
                bpm: 128.4,
                aiDraft: true,
                confidence: { overall: 0.4, chords: 0.6, tabs: 0.2, sections: 0.5 },
                warnings: ['AI-generated tabs are drafts and may require correction.'],
                durationSec: 32,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [{ timeSec: 0, stringIndex: 1, fret: 1, durationSec: 0.5 }],
            },
        );
        const reopenedSongs = await loadImportedSongs();

        expect(savedSong.id).toBe('generated-song');
        expect(reopenedSongs).toHaveLength(1);
        expect(reopenedSongs[0]).toMatchObject({
            id: 'generated-song',
            title: 'Generated Song',
            bpm: 128.4,
            isImported: true,
            instrument: 'guitar',
            tuning: { id: 'guitar_drop_c_sharp', name: 'Drop C#', stringNotes: ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'] },
            aiDraft: true,
            confidence: { overall: 0.4, chords: 0.6, tabs: 0.2, sections: 0.5 },
            chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
        });
        expect(reopenedSongs[0].backingTrack).toEqual({
            uri: 'file:///docs/song-library/generated-song.mp3',
        });
    });

    it('removes saved songs from local library persistence', async () => {
        let storedLibraryJson = JSON.stringify([
            {
                id: 'saved-one',
                title: 'Saved One',
                artist: 'Synthetic Artist',
                difficulty: 'Medium',
                backingTrackUri: 'file:///docs/song-library/saved-one.mp3',
                bpm: 120,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
                durationSec: 24,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [],
                isImported: true,
            },
            {
                id: 'saved-two',
                title: 'Saved Two',
                artist: 'Synthetic Artist',
                difficulty: 'Medium',
                backingTrackUri: 'file:///docs/song-library/saved-two.mp3',
                durationSec: 24,
                chordEvents: [{ timeSec: 0, chord: 'G', laneRow: 1 }],
                tabNotes: [],
                isImported: true,
            },
        ]);
        mockedFileSystem.getInfoAsync.mockResolvedValue({ exists: true } as any);
        mockedFileSystem.readAsStringAsync.mockImplementation((path) =>
            Promise.resolve(String(path).endsWith('library.json') ? storedLibraryJson : '{}'),
        );
        mockedFileSystem.writeAsStringAsync.mockImplementation((_path, contents) => {
            storedLibraryJson = contents;
            return Promise.resolve();
        });

        await expect(deleteImportedSong('saved-one')).resolves.toBe(true);

        const reopenedSongs = await loadImportedSongs();
        expect(reopenedSongs).toHaveLength(1);
        expect(reopenedSongs[0].id).toBe('saved-two');
        expect(JSON.parse(storedLibraryJson).map((song: { id: string }) => song.id)).toEqual(['saved-two']);
        expect(mockedFileSystem.deleteAsync).toHaveBeenCalledWith(
            'file:///docs/song-library/saved-one.mp3',
            { idempotent: true },
        );
    });

    it('does not crash when deleting a missing saved song', async () => {
        const storedLibraryJson = JSON.stringify([
            {
                id: 'saved-one',
                title: 'Saved One',
                artist: 'Synthetic Artist',
                difficulty: 'Medium',
                backingTrackUri: 'file:///docs/song-library/saved-one.mp3',
                durationSec: 24,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [],
                isImported: true,
            },
        ]);
        mockedFileSystem.getInfoAsync.mockResolvedValue({ exists: true } as any);
        mockedFileSystem.readAsStringAsync.mockResolvedValue(storedLibraryJson);

        await expect(deleteImportedSong('missing-song')).resolves.toBe(false);
        expect(mockedFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    });

    it('updates saved song metadata while preserving playable content', async () => {
        let storedLibraryJson = JSON.stringify([
            {
                id: 'saved-one',
                title: 'Saved One',
                artist: 'Synthetic Artist',
                difficulty: 'Medium',
                backingTrackUri: 'file:///docs/song-library/saved-one.mp3',
                bpm: 120,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
                durationSec: 24,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [{ timeSec: 1, stringIndex: 1, fret: 3, durationSec: 0.5 }],
                isImported: true,
            },
        ]);
        mockedFileSystem.getInfoAsync.mockResolvedValue({ exists: true } as any);
        mockedFileSystem.readAsStringAsync.mockImplementation((path) =>
            Promise.resolve(String(path).endsWith('library.json') ? storedLibraryJson : '{}'),
        );
        mockedFileSystem.writeAsStringAsync.mockImplementation((_path, contents) => {
            storedLibraryJson = contents;
            return Promise.resolve();
        });

        const updatedSong = await updateSavedSongMetadata('saved-one', {
            title: '  Clean Title  ',
            artist: '  Clean Artist  ',
            bpm: 133.5,
        });

        expect(updatedSong).toMatchObject({
            id: 'saved-one',
            title: 'Clean Title',
            artist: 'Clean Artist',
            bpm: 133.5,
            chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
            tabNotes: [{ timeSec: 1, stringIndex: 1, fret: 3, durationSec: 0.5 }],
        });
        expect(JSON.parse(storedLibraryJson)[0]).toMatchObject({
            title: 'Clean Title',
            artist: 'Clean Artist',
            bpm: 133.5,
            createdAt: '2026-01-01T00:00:00.000Z',
            chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
        });
        expect(JSON.parse(storedLibraryJson)[0].updatedAt).not.toBe('2026-01-02T00:00:00.000Z');
    });

    it('toggles favorites without rewriting metadata timestamps', async () => {
        let storedLibraryJson = JSON.stringify([
            {
                id: 'saved-one',
                title: 'Saved One',
                artist: 'Synthetic Artist',
                difficulty: 'Medium',
                backingTrackUri: 'file:///docs/song-library/saved-one.mp3',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-02T00:00:00.000Z',
                durationSec: 24,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [],
                isImported: true,
            },
        ]);
        mockedFileSystem.getInfoAsync.mockResolvedValue({ exists: true } as any);
        mockedFileSystem.readAsStringAsync.mockImplementation((path) =>
            Promise.resolve(String(path).endsWith('library.json') ? storedLibraryJson : '{}'),
        );
        mockedFileSystem.writeAsStringAsync.mockImplementation((_path, contents) => {
            storedLibraryJson = contents;
            return Promise.resolve();
        });

        const updatedSong = await updateSavedSongFavorite('saved-one', true);

        expect(updatedSong?.isFavorite).toBe(true);
        expect(JSON.parse(storedLibraryJson)[0]).toMatchObject({
            isFavorite: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
        });
    });

    it('prevents duplicate saves for the same title, artist, and source file', async () => {
        let storedLibraryJson = JSON.stringify([
            {
                id: 'existing-song',
                title: 'Existing Song',
                artist: 'Synthetic Artist',
                difficulty: 'Medium',
                backingTrackUri: 'file:///docs/song-library/existing-song.mp3',
                sourceFileName: 'existing-song',
                durationSec: 24,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [],
                isImported: true,
            },
        ]);
        mockedFileSystem.getInfoAsync.mockResolvedValue({ exists: true } as any);
        mockedFileSystem.readAsStringAsync.mockImplementation((path) =>
            Promise.resolve(String(path).endsWith('library.json') ? storedLibraryJson : '{}'),
        );
        mockedFileSystem.writeAsStringAsync.mockImplementation((_path, contents) => {
            storedLibraryJson = contents;
            return Promise.resolve();
        });

        const savedSong = await importSongFromGeneratedManifest(
            { uri: 'file:///existing-song.mp3', name: 'existing-song.mp3' },
            {
                title: 'Existing Song',
                artist: 'Synthetic Artist',
                durationSec: 12,
                chordEvents: [{ timeSec: 0, chord: 'G', laneRow: 1 }],
                tabNotes: [],
            },
        );

        expect(savedSong.id).toBe('existing-song');
        expect(mockedFileSystem.copyAsync).not.toHaveBeenCalled();
        expect(mockedFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    });

    it('rejects empty titles and invalid BPM metadata updates', async () => {
        const storedLibraryJson = JSON.stringify([
            {
                id: 'saved-one',
                title: 'Saved One',
                artist: 'Synthetic Artist',
                difficulty: 'Medium',
                backingTrackUri: 'file:///docs/song-library/saved-one.mp3',
                durationSec: 24,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [],
                isImported: true,
            },
        ]);
        mockedFileSystem.getInfoAsync.mockResolvedValue({ exists: true } as any);
        mockedFileSystem.readAsStringAsync.mockResolvedValue(storedLibraryJson);

        await expect(updateSavedSongMetadata('saved-one', { title: '   ', bpm: 120 })).rejects.toThrow('Title is required');
        await expect(updateSavedSongMetadata('saved-one', { title: 'Saved One', bpm: -1 })).rejects.toThrow('BPM must be a positive number');
        expect(mockedFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    });

    it('cleans URL-encoded generated titles before saving to the library', async () => {
        let storedLibraryJson = '';
        mockedFileSystem.getInfoAsync.mockResolvedValue({ exists: true } as any);
        mockedFileSystem.readAsStringAsync.mockImplementation((path) =>
            Promise.resolve(String(path).endsWith('library.json') ? storedLibraryJson : '{}'),
        );
        mockedFileSystem.writeAsStringAsync.mockImplementation((_path, contents) => {
            storedLibraryJson = contents;
            return Promise.resolve();
        });

        const savedSong = await importSongFromGeneratedManifest(
            {
                uri: 'file:///Halestorm%20-%20Bad%20Romance%20%28Lady%20Gaga%29%20%5BCover%5D.mp3',
                name: 'Halestorm%20-%20Bad%20Romance%20%28Lady%20Gaga%29%20%5BCover%5D.mp3',
            },
            {
                title: 'Halestorm%20-%20Bad%20Romance%20%28Lady%20Gaga%29%20%5BCover%5D.mp3',
                artist: 'Synthetic Artist',
                durationSec: 12,
                chordEvents: [{ timeSec: 0, chord: 'C', laneRow: 1 }],
                tabNotes: [],
            },
        );

        expect(savedSong.title).toBe('Halestorm - Bad Romance (Lady Gaga) [Cover]');
        expect(JSON.parse(storedLibraryJson)[0].title).toBe('Halestorm - Bad Romance (Lady Gaga) [Cover]');
    });
});
