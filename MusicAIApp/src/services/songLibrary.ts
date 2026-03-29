import * as FileSystem from 'expo-file-system/legacy';
import { SongChordEvent, SongLesson, SongTabNote } from '../data/songLessons';

const SONG_LIBRARY_DIR = `${FileSystem.documentDirectory}song-library`;
const SONG_LIBRARY_FILE = `${SONG_LIBRARY_DIR}/library.json`;

type SongDifficulty = SongLesson['difficulty'];

interface StoredSongLesson {
    id: string;
    title: string;
    artist: string;
    difficulty: SongDifficulty;
    backingTrackUri: string;
    durationSec: number;
    chordEvents: SongChordEvent[];
    tabNotes: SongTabNote[];
    isImported: true;
}

export interface SongImportManifest {
    id?: string;
    title?: string;
    artist?: string;
    difficulty?: SongDifficulty;
    durationSec?: number;
    chordEvents?: unknown;
    tabNotes?: unknown;
    tabEvents?: Array<{
        timeSec?: number;
        chord?: string;
        stringLine?: number;
    }>;
}

interface ImportAssetLike {
    uri: string;
    name: string;
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'song';
}

function getExtension(fileName: string) {
    const match = /\.([a-z0-9]+)$/i.exec(fileName);
    return match ? match[1].toLowerCase() : 'mp3';
}

function stripExtension(fileName: string) {
    return fileName.replace(/\.[^/.]+$/, '');
}

async function ensureLibraryDir() {
    const info = await FileSystem.getInfoAsync(SONG_LIBRARY_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(SONG_LIBRARY_DIR, { intermediates: true });
    }
}

async function readStoredLibrary(): Promise<StoredSongLesson[]> {
    await ensureLibraryDir();
    const info = await FileSystem.getInfoAsync(SONG_LIBRARY_FILE);
    if (!info.exists) {
        return [];
    }

    try {
        const raw = await FileSystem.readAsStringAsync(SONG_LIBRARY_FILE);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((item) => item && typeof item === 'object') as StoredSongLesson[];
    } catch (error) {
        return [];
    }
}

async function writeStoredLibrary(songs: StoredSongLesson[]) {
    await ensureLibraryDir();
    await FileSystem.writeAsStringAsync(SONG_LIBRARY_FILE, JSON.stringify(songs, null, 2));
}

async function persistImportedSong(audioFile: ImportAssetLike, manifest: SongImportManifest): Promise<SongLesson> {
    const chordEvents = normalizeChordEvents(manifest);
    const tabNotes = normalizeTabNotes(manifest);

    if (chordEvents.length === 0 && tabNotes.length === 0) {
        throw new Error('The generated song data needs chordEvents or tabNotes.');
    }

    const baseTitle = (typeof manifest.title === 'string' && manifest.title.trim())
        ? manifest.title.trim()
        : stripExtension(audioFile.name);
    const id = manifest.id?.trim() || `${slugify(baseTitle)}-${Date.now()}`;
    const extension = getExtension(audioFile.name);
    const targetAudioUri = `${SONG_LIBRARY_DIR}/${id}.${extension}`;

    await FileSystem.copyAsync({
        from: audioFile.uri,
        to: targetAudioUri,
    });

    const storedSong: StoredSongLesson = {
        id,
        title: baseTitle,
        artist: (typeof manifest.artist === 'string' && manifest.artist.trim()) ? manifest.artist.trim() : 'Imported Track',
        difficulty: manifest.difficulty === 'Easy' || manifest.difficulty === 'Hard' || manifest.difficulty === 'Medium'
            ? manifest.difficulty
            : 'Medium',
        backingTrackUri: targetAudioUri,
        durationSec: buildDuration(manifest.durationSec, chordEvents, tabNotes),
        chordEvents,
        tabNotes,
        isImported: true,
    };

    const currentLibrary = await readStoredLibrary();
    const nextLibrary = [storedSong, ...currentLibrary.filter((song) => song.id !== storedSong.id)];
    await writeStoredLibrary(nextLibrary);

    return toRuntimeSong(storedSong);
}

function normalizeChordEvents(manifest: SongImportManifest): SongChordEvent[] {
    const direct = Array.isArray(manifest.chordEvents) ? manifest.chordEvents : null;
    if (direct) {
        return direct
            .map((event) => {
                if (!event || typeof event !== 'object') {
                    return null;
                }

                const next = event as Partial<SongChordEvent>;
                if (typeof next.timeSec !== 'number' || typeof next.chord !== 'string' || typeof next.laneRow !== 'number') {
                    return null;
                }

                return {
                    timeSec: next.timeSec,
                    chord: next.chord.trim(),
                    laneRow: Math.max(0, Math.min(3, Math.round(next.laneRow))),
                };
            })
            .filter((event): event is SongChordEvent => !!event);
    }

    if (Array.isArray(manifest.tabEvents)) {
        return manifest.tabEvents
            .map((event) => {
                if (typeof event.timeSec !== 'number' || typeof event.chord !== 'string') {
                    return null;
                }

                return {
                    timeSec: event.timeSec,
                    chord: event.chord.trim(),
                    laneRow: Math.max(0, Math.min(3, Math.round(event.stringLine ?? 0))),
                };
            })
            .filter((event): event is SongChordEvent => !!event);
    }

    return [];
}

function normalizeTabNotes(manifest: SongImportManifest): SongTabNote[] {
    if (!Array.isArray(manifest.tabNotes)) {
        return [];
    }

    return manifest.tabNotes
        .map((note): SongTabNote | null => {
            if (!note || typeof note !== 'object') {
                return null;
            }

            const next = note as Partial<SongTabNote>;
            if (typeof next.timeSec !== 'number' || typeof next.stringIndex !== 'number' || typeof next.fret !== 'number') {
                return null;
            }

            return {
                timeSec: next.timeSec,
                stringIndex: Math.max(0, Math.min(5, Math.round(next.stringIndex))),
                fret: Math.max(0, Math.round(next.fret)),
                ...(typeof next.durationSec === 'number' ? { durationSec: Math.max(0.1, next.durationSec) } : {}),
            };
        })
        .filter((note): note is SongTabNote => !!note);
}

function buildDuration(manifestDuration: unknown, chordEvents: SongChordEvent[], tabNotes: SongTabNote[]) {
    if (typeof manifestDuration === 'number' && manifestDuration > 0) {
        return manifestDuration;
    }

    const chordMax = chordEvents.reduce((max, event) => Math.max(max, event.timeSec), 0);
    const tabMax = tabNotes.reduce((max, note) => Math.max(max, note.timeSec + (note.durationSec ?? 0)), 0);
    return Math.max(20, Math.ceil(Math.max(chordMax, tabMax) + 4));
}

function toRuntimeSong(song: StoredSongLesson): SongLesson {
    return {
        id: song.id,
        title: song.title,
        artist: song.artist,
        difficulty: song.difficulty,
        backingTrack: { uri: song.backingTrackUri },
        durationSec: song.durationSec,
        chordEvents: song.chordEvents,
        tabNotes: song.tabNotes,
        isImported: true,
    };
}

export async function loadImportedSongs(): Promise<SongLesson[]> {
    const songs = await readStoredLibrary();
    return songs
        .filter((song) => !!song.backingTrackUri)
        .map(toRuntimeSong);
}

export async function importSongFromFiles(audioFile: ImportAssetLike, manifestFile: ImportAssetLike): Promise<SongLesson> {
    await ensureLibraryDir();

    const rawManifest = await FileSystem.readAsStringAsync(manifestFile.uri);
    const manifest = JSON.parse(rawManifest) as SongImportManifest;
    return persistImportedSong(audioFile, manifest);
}

export async function importSongFromGeneratedManifest(
    audioFile: ImportAssetLike,
    manifest: SongImportManifest,
): Promise<SongLesson> {
    await ensureLibraryDir();
    return persistImportedSong(audioFile, manifest);
}
