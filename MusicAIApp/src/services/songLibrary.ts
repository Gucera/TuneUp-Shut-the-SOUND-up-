import * as FileSystem from 'expo-file-system/legacy';
import {
    SongAnalysisConfidence,
    SongChordEvent,
    SongLesson,
    SongTabNote,
    SongTuningMetadata,
} from '../data/songLessons';
import {
    formatManifestValidationError,
    parseSongManifestJson,
    ValidatedSongManifest,
    validateSongManifest,
} from '../utils/manifestValidation';
import { cleanUploadedSongDisplayName } from '../utils/songDisplayNames';

const SONG_LIBRARY_DIR = `${FileSystem.documentDirectory}song-library`;
const SONG_LIBRARY_FILE = `${SONG_LIBRARY_DIR}/library.json`;

type SongDifficulty = SongLesson['difficulty'];

interface StoredSongLesson {
    id: string;
    title: string;
    artist: string;
    difficulty: SongDifficulty;
    backingTrackUri: string;
    bpm?: number;
    durationSec: number;
    chordEvents: SongChordEvent[];
    tabNotes: SongTabNote[];
    isImported: true;
    instrument?: string;
    tuning?: SongTuningMetadata;
    aiDraft?: boolean;
    confidence?: SongAnalysisConfidence;
    warnings?: string[];
    createdAt?: string;
    updatedAt?: string;
    isFavorite?: boolean;
    sourceFileName?: string;
}

export type SongImportManifest = ValidatedSongManifest;

interface ImportAssetLike {
    uri: string;
    name: string;
}

export interface SavedSongMetadataUpdates {
    title: string;
    artist?: string;
    bpm?: number | null;
}

function normalizeComparableText(value: string | undefined) {
    return cleanUploadedSongDisplayName(value ?? '').trim().toLowerCase();
}

function isPositiveBpm(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
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
    } catch {
        return [];
    }
}

async function writeStoredLibrary(songs: StoredSongLesson[]) {
    await ensureLibraryDir();
    await FileSystem.writeAsStringAsync(SONG_LIBRARY_FILE, JSON.stringify(songs, null, 2));
}

async function persistImportedSong(
    audioFile: ImportAssetLike,
    manifest: SongImportManifest,
): Promise<SongLesson> {
    const baseTitle = cleanUploadedSongDisplayName(
        (typeof manifest.title === 'string' && manifest.title.trim())
            ? manifest.title
            : audioFile.name,
    );
    const baseArtist = (typeof manifest.artist === 'string' && manifest.artist.trim()) ? manifest.artist.trim() : 'Imported Track';
    const id = manifest.id?.trim() || `${slugify(baseTitle)}-${Date.now()}`;
    const extension = getExtension(audioFile.name);
    const sourceFileName = cleanUploadedSongDisplayName(audioFile.name);
    const currentLibrary = await readStoredLibrary();
    const duplicateSong = currentLibrary.find((song) => {
        if (manifest.id?.trim() && song.id === manifest.id.trim()) {
            return true;
        }

        return normalizeComparableText(song.title) === normalizeComparableText(baseTitle)
            && normalizeComparableText(song.artist) === normalizeComparableText(baseArtist)
            && !!song.sourceFileName
            && normalizeComparableText(song.sourceFileName) === normalizeComparableText(sourceFileName);
    });
    if (duplicateSong) {
        return toRuntimeSong(duplicateSong);
    }

    const targetAudioUri = `${SONG_LIBRARY_DIR}/${id}.${extension}`;
    const nowIso = new Date().toISOString();

    await FileSystem.copyAsync({
        from: audioFile.uri,
        to: targetAudioUri,
    });

    const storedSong: StoredSongLesson = {
        id,
        title: baseTitle,
        artist: baseArtist,
        difficulty: manifest.difficulty === 'Easy' || manifest.difficulty === 'Hard' || manifest.difficulty === 'Medium'
            ? manifest.difficulty
            : 'Medium',
        backingTrackUri: targetAudioUri,
        ...(isPositiveBpm(manifest.bpm) ? { bpm: manifest.bpm } : {}),
        durationSec: buildDuration(manifest.durationSec, manifest.chordEvents, manifest.tabNotes),
        chordEvents: manifest.chordEvents,
        tabNotes: manifest.tabNotes,
        isImported: true,
        ...(manifest.instrument ? { instrument: manifest.instrument } : {}),
        ...(manifest.tuning ? { tuning: manifest.tuning } : {}),
        ...(manifest.aiDraft !== undefined ? { aiDraft: manifest.aiDraft } : {}),
        ...(manifest.confidence ? { confidence: manifest.confidence } : {}),
        ...(manifest.warnings ? { warnings: manifest.warnings } : {}),
        createdAt: nowIso,
        updatedAt: nowIso,
        isFavorite: false,
        sourceFileName,
    };

    const nextLibrary = [storedSong, ...currentLibrary.filter((song) => song.id !== storedSong.id)];
    await writeStoredLibrary(nextLibrary);

    return toRuntimeSong(storedSong);
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
        ...(isPositiveBpm(song.bpm) ? { bpm: song.bpm } : {}),
        durationSec: song.durationSec,
        chordEvents: song.chordEvents,
        tabNotes: song.tabNotes,
        isImported: true,
        ...(song.instrument ? { instrument: song.instrument } : {}),
        ...(song.tuning ? { tuning: song.tuning } : {}),
        ...(song.aiDraft !== undefined ? { aiDraft: song.aiDraft } : {}),
        ...(song.confidence ? { confidence: song.confidence } : {}),
        ...(song.warnings ? { warnings: song.warnings } : {}),
        ...(song.createdAt ? { createdAt: song.createdAt } : {}),
        ...(song.updatedAt ? { updatedAt: song.updatedAt } : {}),
        ...(song.isFavorite ? { isFavorite: true } : {}),
        ...(song.sourceFileName ? { sourceFileName: song.sourceFileName } : {}),
    };
}

export async function loadImportedSongs(): Promise<SongLesson[]> {
    const songs = await readStoredLibrary();
    return songs
        .filter((song) => !!song.backingTrackUri)
        .map(toRuntimeSong);
}

export async function deleteImportedSong(songId: string): Promise<boolean> {
    const normalizedId = songId.trim();
    if (!normalizedId) {
        return false;
    }

    const currentLibrary = await readStoredLibrary();
    const songToDelete = currentLibrary.find((song) => song.id === normalizedId);
    const nextLibrary = currentLibrary.filter((song) => song.id !== normalizedId);
    if (nextLibrary.length === currentLibrary.length) {
        return false;
    }

    await writeStoredLibrary(nextLibrary);
    if (songToDelete?.backingTrackUri) {
        try {
            await FileSystem.deleteAsync(songToDelete.backingTrackUri, { idempotent: true });
        } catch {
            // The library entry is the source of truth; missing cached audio should not block deletion.
        }
    }
    return true;
}

export async function updateSavedSongMetadata(
    songId: string,
    updates: SavedSongMetadataUpdates,
): Promise<SongLesson | null> {
    const normalizedId = songId.trim();
    if (!normalizedId) {
        return null;
    }

    const title = updates.title.trim();
    if (!title) {
        throw new Error('Title is required.');
    }

    let nextBpm: number | undefined;
    if (updates.bpm !== undefined && updates.bpm !== null) {
        if (!Number.isFinite(updates.bpm) || updates.bpm <= 0) {
            throw new Error('BPM must be a positive number.');
        }
        nextBpm = updates.bpm;
    }

    const currentLibrary = await readStoredLibrary();
    const songIndex = currentLibrary.findIndex((song) => song.id === normalizedId);
    if (songIndex === -1) {
        return null;
    }

    const updatedSong: StoredSongLesson = {
        ...currentLibrary[songIndex],
        title,
        artist: updates.artist?.trim() || 'Imported Track',
        updatedAt: new Date().toISOString(),
    };

    if (updates.bpm === null) {
        delete updatedSong.bpm;
    } else if (nextBpm !== undefined) {
        updatedSong.bpm = nextBpm;
    }

    const nextLibrary = [...currentLibrary];
    nextLibrary[songIndex] = updatedSong;
    await writeStoredLibrary(nextLibrary);
    return toRuntimeSong(updatedSong);
}

export async function updateSavedSongFavorite(songId: string, isFavorite: boolean): Promise<SongLesson | null> {
    const normalizedId = songId.trim();
    if (!normalizedId) {
        return null;
    }

    const currentLibrary = await readStoredLibrary();
    const songIndex = currentLibrary.findIndex((song) => song.id === normalizedId);
    if (songIndex === -1) {
        return null;
    }

    const updatedSong: StoredSongLesson = {
        ...currentLibrary[songIndex],
        isFavorite,
    };

    const nextLibrary = [...currentLibrary];
    nextLibrary[songIndex] = updatedSong;
    await writeStoredLibrary(nextLibrary);
    return toRuntimeSong(updatedSong);
}

export async function importSongFromFiles(audioFile: ImportAssetLike, manifestFile: ImportAssetLike): Promise<SongLesson> {
    await ensureLibraryDir();

    const rawManifest = await FileSystem.readAsStringAsync(manifestFile.uri);
    const result = parseSongManifestJson(rawManifest);
    if (!result.ok) {
        throw new Error(formatManifestValidationError(result.errors));
    }

    return persistImportedSong(audioFile, result.value);
}

export async function importSongFromGeneratedManifest(
    audioFile: ImportAssetLike,
    manifest: unknown,
): Promise<SongLesson> {
    await ensureLibraryDir();
    const result = validateSongManifest(manifest);
    if (!result.ok) {
        throw new Error(formatManifestValidationError(result.errors));
    }

    return persistImportedSong(audioFile, result.value);
}
