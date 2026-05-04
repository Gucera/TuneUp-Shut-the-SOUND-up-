import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    Easing,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { Canvas, Circle, Line, Path, Rect, Skia } from '@shopify/react-native-skia';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { SONG_LESSONS, SongLesson } from '../data/songLessons';
import { AppSettings, getAppSettings } from '../services/appSettings';
import PageTransitionView from '../components/PageTransitionView';
import PremiumBackdrop from '../components/PremiumBackdrop';
import PremiumCelebrationOverlay from '../components/PremiumCelebrationOverlay';
import PremiumHeroStrip from '../components/PremiumHeroStrip';
import PracticeFlowShell from '../components/PracticeFlowShell';
import ScreenSettingsButton from '../components/ScreenSettingsButton';
import SkeletonBlock from '../components/SkeletonBlock';
import { useAppToast } from '../components/AppToastProvider';
import { useCelebration } from '../hooks/useCelebration';
import {
    buildMidiTarget,
    isPitchMatchForTarget,
    TUNER_A4_HZ,
    TUNER_NATIVE_MODULE_MESSAGE,
    useTuner,
} from '../hooks/useTuner';
import { GamificationSnapshot, getGamificationSnapshot, rewardPracticeActivity } from '../services/gamification';
import { analyzeAudioForSongImport, fetchSongImportTaskStatus, type SongImportResultPayload } from '../services/api';
import {
    deleteImportedSong,
    importSongFromFiles,
    importSongFromGeneratedManifest,
    loadImportedSongs,
    updateSavedSongMetadata,
    updateSavedSongFavorite,
} from '../services/songLibrary';
import { formatManifestValidationError, validateSongManifest } from '../utils/manifestValidation';
import {
    buildSongImportReviewWarnings,
    filterSongLibraryCards,
    formatBpm,
    formatLibraryCount,
    formatSongDuration,
    getSongLibraryBadges,
    getSongStatusLabel,
    sortSongLibraryCards,
    type SongLibraryFilter,
    type SongLibrarySortMode,
    type SongStatus,
    toSongLibraryCard,
} from '../utils/songLibraryView';
import {
    DEFAULT_SONG_ANALYSIS_TUNING,
    getDefaultSongAnalysisTuning,
    getSongAnalysisTuningsForInstrument,
    type SongAnalysisInstrument,
    type SongAnalysisTuningPreset,
} from '../utils/songAnalysisTunings';
import {
    FALLBACK_STANDARD_TUNING_WARNING,
    getDisplayStringLabels,
    getDisplayStringIndex,
    getStringLabelForTabNote,
    getTabNoteTargetMidi,
    hasExplicitTuning,
} from '../utils/songFlowStrings';
import { cleanUploadedSongDisplayName } from '../utils/songDisplayNames';
import { COLORS, SHADOWS } from '../theme';

const { width } = Dimensions.get('window');
const SCREEN_PADDING = 14;
const SHELL_PADDING = 14;
const LANE_WIDTH = width - (SCREEN_PADDING * 2) - (SHELL_PADDING * 2);
const LANE_HEIGHT = 308;
const LIBRARY_CARD_GAP = 10;
const LIBRARY_CARD_COLUMNS = width >= 760 ? 3 : 2;
const LIBRARY_CARD_WIDTH = (LANE_WIDTH - 28 - (LIBRARY_CARD_GAP * (LIBRARY_CARD_COLUMNS - 1))) / LIBRARY_CARD_COLUMNS;
const PLAYHEAD_X = 84;
const PIXELS_PER_SECOND = 112;
const PERFECT_WINDOW_SEC = 0.2;
const GOOD_WINDOW_SEC = 0.45;
const GOOD_WEIGHT = 0.65;
const TAB_HIT_WINDOW_SEC = 0.18;
const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace', android: 'monospace' });

type SongPanel = 'chords' | 'tabs' | 'guide';
type SongsSection = 'upload' | 'library';

type SongImportStatus = SongStatus | 'idle' | 'selecting' | 'saved';

type ImportAudioAsset = {
    uri: string;
    name: string;
    size?: number | null;
    mimeType?: string | null;
};

type PendingSongReview = {
    audioAsset: ImportAudioAsset;
    result: SongImportResultPayload;
    warnings: string[];
    createdAt: number;
};

const SONG_COLORS = {
    backgroundA: COLORS.deepBackground,
    backgroundB: COLORS.deepSurface,
    panel: COLORS.deepSurface,
    panelRaised: COLORS.deepSurfaceAlt,
    rail: '#3c2a6c',
    railSoft: '#2d2251',
    primary: '#64dfdf',
    secondary: '#56cfe1',
    highlight: '#80ffdb',
    miss: COLORS.danger,
    text: '#F7FAFF',
    textDim: '#B8CCE3',
    textMute: '#8FAAC7',
    border: '#56cfe1',
};

interface SongScore {
    accuracy: number;
    perfect: number;
    good: number;
    missed: number;
    bestCombo: number;
}

interface HitResult {
    label: 'PERFECT' | 'GOOD' | 'MISS' | 'HIT';
    color: string;
}

type LiveTabTarget = SongLesson['tabNotes'][number] & {
    index: number;
    target: ReturnType<typeof buildMidiTarget>;
};

const CHORD_TONES: Record<string, string[]> = {
    C: ['C', 'E', 'G'],
    Dm: ['D', 'F', 'A'],
    Em: ['E', 'G', 'B'],
    F: ['F', 'A', 'C'],
    G: ['G', 'B', 'D'],
    Am: ['A', 'C', 'E'],
    Bm: ['B', 'D', 'F#'],
};

const NOTE_SEQUENCE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_EQUIVALENTS: Record<string, string> = {
    Bb: 'A#',
    Db: 'C#',
    Eb: 'D#',
    Gb: 'F#',
    Ab: 'G#',
    Cb: 'B',
    Fb: 'E',
};

function withOpacity(hex: string, opacity: number) {
    const safeOpacity = Math.max(0, Math.min(1, opacity));
    const sanitized = hex.replace('#', '');
    const fullHex = sanitized.length === 3
        ? sanitized.split('').map((char) => `${char}${char}`).join('')
        : sanitized;

    const value = parseInt(fullHex, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
}

function buildWaveBandPath(w: number, h: number, phase: number, baseline: number, amplitude: number, wavelength: number) {
    const path = Skia.Path.Make();
    path.moveTo(0, h);
    path.lineTo(0, baseline);

    for (let x = 0; x <= w; x += 10) {
        const y = baseline
            + (Math.sin((x + phase) / wavelength) * amplitude)
            + (Math.cos((x + phase) / (wavelength * 0.64)) * amplitude * 0.35);
        path.lineTo(x, y);
    }

    path.lineTo(w, h);
    path.close();
    return path;
}

function getChordColor(chord: string) {
    const palette: Record<string, string> = {
        C: '#7400b8',
        Dm: '#6930c3',
        Em: '#5e60ce',
        F: '#5390d9',
        G: '#4ea8de',
        Am: '#64dfdf',
        Bm: '#72efdd',
    };

    return palette[chord] ?? SONG_COLORS.primary;
}

function getAcceptedNotes(chord: string): string[] {
    if (CHORD_TONES[chord]) {
        return CHORD_TONES[chord];
    }

    const rootMatch = chord.match(/^([A-G](?:#|b)?)/);
    if (!rootMatch) {
        return [chord];
    }

    const rawRoot = rootMatch[1];
    const root = FLAT_EQUIVALENTS[rawRoot] ?? rawRoot;
    const suffix = chord.slice(rawRoot.length);
    const rootIndex = NOTE_SEQUENCE.indexOf(root);
    if (rootIndex === -1) {
        return [root];
    }

    const shift = (semitones: number) => NOTE_SEQUENCE[(rootIndex + semitones + 12) % 12];

    // Real songs bring richer chord names, so this gives us a useful note set even when the chord is new.
    const isMinor = /^m(?!aj)/.test(suffix);
    const isDiminished = suffix.includes('dim');
    const isSuspended2 = suffix.includes('sus2');
    const isSuspended4 = suffix.includes('sus4');

    const notes = [root];

    if (isSuspended2) {
        notes.push(shift(2));
    } else if (isSuspended4) {
        notes.push(shift(5));
    } else {
        notes.push(shift(isMinor ? 3 : 4));
    }

    notes.push(shift(isDiminished ? 6 : 7));

    if (suffix.includes('maj7')) {
        notes.push(shift(11));
    } else if (suffix.includes('7')) {
        notes.push(shift(10));
    }

    if (suffix.includes('6')) {
        notes.push(shift(9));
    }

    if (suffix.includes('add9') || suffix.includes('9')) {
        notes.push(shift(2));
    }

    return [...new Set(notes)];
}

function getIdleSongStatus(panel: SongPanel) {
    if (panel === 'guide') {
        return 'Preview ready';
    }

    if (panel === 'tabs') {
        return 'Zero-lag tabs ready';
    }

    return 'Zero-lag tuner ready';
}

function toLiveTabTarget(
    song: SongLesson,
    note: SongLesson['tabNotes'][number],
    index: number,
): LiveTabTarget | null {
    const targetMidi = getTabNoteTargetMidi(song, note.stringIndex, note.fret);
    if (targetMidi === null) {
        return null;
    }

    return {
        ...note,
        index,
        target: buildMidiTarget(targetMidi, TUNER_A4_HZ),
    };
}

function estimateSongImportProgress(progressText: string) {
    const normalized = progressText.toLowerCase();

    if (normalized.includes('complete')) {
        return 1;
    }

    if (normalized.includes('saving')) {
        return 0.92;
    }

    if (normalized.includes('tab pattern')) {
        return 0.82;
    }

    if (normalized.includes('chord')) {
        return 0.68;
    }

    if (normalized.includes('bpm') || normalized.includes('beat')) {
        return 0.52;
    }

    if (normalized.includes('transcribing')) {
        return 0.36;
    }

    if (normalized.includes('preparing')) {
        return 0.24;
    }

    if (normalized.includes('upload')) {
        return 0.16;
    }

    return 0.28;
}

function formatFileSize(bytes?: number | null) {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
        return 'Size unknown';
    }

    const megabytes = bytes / (1024 * 1024);
    if (megabytes >= 1) {
        return `${megabytes.toFixed(1)} MB`;
    }

    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getImportStatusText(status: SongImportStatus) {
    switch (status) {
        case 'selecting':
            return 'Selecting audio';
        case 'uploading':
            return 'Uploading audio';
        case 'queued':
            return 'Queued';
        case 'analyzing':
            return 'Analyzing';
        case 'review_ready':
            return 'Review ready';
        case 'failed':
            return 'Import failed';
        case 'saved':
            return 'Saved';
        default:
            return 'Ready';
    }
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SONG_IMPORT_POLL_INTERVAL_MS = 2400;
const SONG_IMPORT_MAX_DURATION_MS = 10 * 60 * 1000;
const SONG_IMPORT_MAX_NETWORK_ERRORS = 3;
const SONG_IMPORT_TIMEOUT_MESSAGE = 'Analysis is taking longer than expected. Please try again or use another audio file.';

function getChordLaneY(row: number) {
    return 82 + (row * 52);
}

function getStringY(index: number) {
    return 62 + (index * 36);
}

export default function SongScreen({
    route,
}: {
    route?: { params?: { focusSongId?: string } };
}) {
    const { showToast } = useAppToast();
    const tabBarHeight = useBottomTabBarHeight();
    const [librarySongs, setLibrarySongs] = useState<SongLesson[]>([]);
    const [selectedSong, setSelectedSong] = useState<SongLesson>(SONG_LESSONS[0]);
    const [activePanel, setActivePanel] = useState<SongPanel>('chords');
    const [isPlaying, setIsPlaying] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState<SongImportStatus>('idle');
    const [importError, setImportError] = useState<string | null>(null);
    const [pendingReview, setPendingReview] = useState<PendingSongReview | null>(null);
    const [selectedUploadAsset, setSelectedUploadAsset] = useState<ImportAudioAsset | null>(null);
    const [analysisInstrument, setAnalysisInstrument] = useState<SongAnalysisInstrument>('guitar');
    const [analysisTuning, setAnalysisTuning] = useState<SongAnalysisTuningPreset>(DEFAULT_SONG_ANALYSIS_TUNING);
    const [librarySearchQuery, setLibrarySearchQuery] = useState('');
    const [libraryFilter, setLibraryFilter] = useState<SongLibraryFilter>('all');
    const [librarySortMode, setLibrarySortMode] = useState<SongLibrarySortMode>('recent');
    const [songsSection, setSongsSection] = useState<SongsSection>('library');
    const [actionSong, setActionSong] = useState<SongLesson | null>(null);
    const [editingSong, setEditingSong] = useState<SongLesson | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editArtist, setEditArtist] = useState('');
    const [editBpm, setEditBpm] = useState('');
    const [editError, setEditError] = useState<string | null>(null);
    const [importProgressText, setImportProgressText] = useState('Pick one audio file and AI will build your chords and tabs.');
    const [importProgressValue, setImportProgressValue] = useState(0);
    const [playbackSec, setPlaybackSec] = useState(0);
    const [perfectCount, setPerfectCount] = useState(0);
    const [goodCount, setGoodCount] = useState(0);
    const [, setMissedCount] = useState(0);
    const [combo, setCombo] = useState(0);
    const [bestCombo, setBestCombo] = useState(0);
    const [score, setScore] = useState<SongScore | null>(null);
    const [flashResult, setFlashResult] = useState<HitResult | null>(null);
    const [micStatus, setMicStatus] = useState(getIdleSongStatus('chords'));
    const [animationNow, setAnimationNow] = useState(Date.now());
    const [gameSnapshot, setGameSnapshot] = useState<GamificationSnapshot | null>(null);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [isBootLoading, setIsBootLoading] = useState(true);
    const [tabHitNonce, setTabHitNonce] = useState(0);
    const { celebration, showCelebration } = useCelebration();

    const soundRef = useRef<Audio.Sound | null>(null);
    const loadedSongIdRef = useRef<string | null>(null);
    const selectedSongRef = useRef<SongLesson>(selectedSong);
    const judgedEventIndexesRef = useRef<Set<number>>(new Set());
    const missedEventIndexesRef = useRef<Set<number>>(new Set());
    const hitTabIndexesRef = useRef<Set<number>>(new Set());
    const tabHitMomentsRef = useRef<Map<number, number>>(new Map());
    const hasScoredRef = useRef(false);
    const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pulseStartedAtRef = useRef<number | null>(null);
    const playbackAnchorSecRef = useRef(0);
    const playbackAnchorStampRef = useRef(Date.now());
    const isPlayingRef = useRef(false);
    const screenMountedRef = useRef(true);
    const importRunIdRef = useRef(0);
    const importShimmerAnim = useRef(new Animated.Value(0)).current;
    const nextTabTarget = useMemo(() => {
        const nextNote = selectedSong.tabNotes
            .map((note, index) => toLiveTabTarget(selectedSong, note, index))
            .find((note) => (
                note !== null
                && !hitTabIndexesRef.current.has(note.index)
                && note.timeSec >= playbackSec - 0.05
            ));

        return nextNote ?? null;
    }, [playbackSec, selectedSong, tabHitNonce]);
    const activeTabTarget = useMemo(() => {
        let bestTarget: LiveTabTarget | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        selectedSong.tabNotes.forEach((note, index) => {
            if (hitTabIndexesRef.current.has(index)) {
                return;
            }

            const distance = Math.abs(note.timeSec - playbackSec);
            if (distance > TAB_HIT_WINDOW_SEC || distance >= bestDistance) {
                return;
            }

            const liveTarget = toLiveTabTarget(selectedSong, note, index);
            if (!liveTarget) {
                return;
            }

            bestDistance = distance;
            bestTarget = liveTarget;
        });

        return bestTarget;
    }, [playbackSec, selectedSong, tabHitNonce]);
    const tabTargetAtLine = activeTabTarget ?? nextTabTarget;
    const tuner = useTuner({
        instrument: 'Guitar',
        targetMidi: activePanel === 'tabs' ? tabTargetAtLine?.target.midi ?? null : null,
    });
    const startTuner = tuner.start;
    const stopTuner = tuner.stop;

    const allSongs = useMemo(() => [...librarySongs, ...SONG_LESSONS], [librarySongs]);
    const libraryCards = useMemo(() => allSongs.map(toSongLibraryCard), [allSongs]);
    const filteredLibraryCards = useMemo(() => {
        const filtered = filterSongLibraryCards(libraryCards, librarySearchQuery, libraryFilter);
        return sortSongLibraryCards(filtered, librarySortMode);
    }, [libraryCards, libraryFilter, librarySearchQuery, librarySortMode]);
    const hasActiveLibraryFilter = librarySearchQuery.trim().length > 0 || libraryFilter !== 'all';
    const libraryCountText = useMemo(
        () => formatLibraryCount(filteredLibraryCards.length, libraryCards.length, hasActiveLibraryFilter),
        [filteredLibraryCards.length, hasActiveLibraryFilter, libraryCards.length],
    );
    const analysisTuningOptions = useMemo(
        () => getSongAnalysisTuningsForInstrument(analysisInstrument),
        [analysisInstrument],
    );
    const focusSongId = route?.params?.focusSongId ?? null;

    const loadSessionPrefs = useCallback(async () => {
        const [snapshot, settings] = await Promise.all([
            getGamificationSnapshot(),
            getAppSettings(),
        ]);
        setGameSnapshot(snapshot);
        setAppSettings(settings);
        setActivePanel(settings.songsPreferTabsDefault ? 'tabs' : 'chords');
    }, []);

    useEffect(() => {
        selectedSongRef.current = selectedSong;
    }, [selectedSong]);

    useEffect(() => {
        if (!focusSongId) {
            return;
        }

        const targetSong = allSongs.find((song) => song.id === focusSongId);
        if (!targetSong || targetSong.id === selectedSong.id) {
            return;
        }

        void selectSong(targetSong);
    }, [allSongs, focusSongId, selectedSong.id]);

    useEffect(() => {
        void (async () => {
            try {
                const [importedSongs] = await Promise.all([
                    loadImportedSongs(),
                    loadSessionPrefs(),
                ]);
                setLibrarySongs(importedSongs);
            } finally {
                setIsBootLoading(false);
            }
        })();

        return () => {
            screenMountedRef.current = false;
            importRunIdRef.current += 1;
            void stopTuner();
            if (soundRef.current) {
                void soundRef.current.unloadAsync();
            }
            if (flashTimeoutRef.current) {
                clearTimeout(flashTimeoutRef.current);
            }
        };
    }, [loadSessionPrefs, stopTuner]);

    useFocusEffect(
        useCallback(() => {
            void loadSessionPrefs();
            return () => {
                void stopTuner();
                isPlayingRef.current = false;
                setIsPlaying(false);
            };
        }, [loadSessionPrefs, stopTuner]),
    );

    useEffect(() => {
        if (!isPlaying) {
            setMicStatus(getIdleSongStatus(activePanel));
        }
    }, [activePanel]);

    useEffect(() => {
        if (!isImporting) {
            importShimmerAnim.stopAnimation();
            importShimmerAnim.setValue(0);
            return;
        }

        const loop = Animated.loop(
            Animated.timing(importShimmerAnim, {
                toValue: 1,
                duration: 1450,
                easing: Easing.linear,
                useNativeDriver: true,
            }),
        );
        loop.start();

        return () => {
            loop.stop();
            importShimmerAnim.setValue(0);
        };
    }, [importShimmerAnim, isImporting]);

    useEffect(() => {
        // This keeps the lane moving even between audio status updates.
        const intervalId = setInterval(() => {
            const now = Date.now();
            setAnimationNow(now);

            if (isPlayingRef.current) {
                const projected = playbackAnchorSecRef.current + ((now - playbackAnchorStampRef.current) / 1000);
                setPlaybackSec(Math.min(selectedSongRef.current.durationSec, projected));
            }
        }, 40);

        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (!isPlaying || activePanel !== 'chords') {
            return;
        }
        markExpiredEvents(playbackSec);
    }, [playbackSec, isPlaying, activePanel]);

    useEffect(() => {
        if (!isPlaying || activePanel !== 'chords' || !tuner.frequency || !tuner.hasSignal) {
            return;
        }

        judgeDetectedNote(tuner.noteClass);
    }, [activePanel, isPlaying, playbackSec, tuner.frequency, tuner.hasSignal, tuner.noteClass]);

    useEffect(() => {
        if (!isPlaying || activePanel !== 'tabs' || !tuner.frequency || !tuner.hasSignal) {
            return;
        }

        const liveFrequency = tuner.frequency;
        let bestTarget: LiveTabTarget | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const [index, note] of selectedSongRef.current.tabNotes.entries()) {
            if (hitTabIndexesRef.current.has(index)) {
                continue;
            }

            const distance = Math.abs(note.timeSec - playbackSec);
            if (distance > TAB_HIT_WINDOW_SEC || distance >= bestDistance) {
                continue;
            }

            const targetMidi = getTabNoteTargetMidi(selectedSongRef.current, note.stringIndex, note.fret);
            if (targetMidi === null) {
                continue;
            }
            const target = buildMidiTarget(targetMidi, TUNER_A4_HZ);
            if (!isPitchMatchForTarget(liveFrequency, target.midi, TUNER_A4_HZ)) {
                continue;
            }

            bestDistance = distance;
            bestTarget = {
                ...note,
                index,
                target,
            };
        }

        if (!bestTarget) {
            return;
        }

        hitTabIndexesRef.current.add(bestTarget.index);
        tabHitMomentsRef.current.set(bestTarget.index, Date.now());
        setTabHitNonce((prev) => prev + 1);
        setCombo((prevCombo) => {
            const nextCombo = prevCombo + 1;
            setBestCombo((prevBest) => Math.max(prevBest, nextCombo));
            return nextCombo;
        });
        showHitFlash({ label: 'HIT', color: '#45FF92' });
    }, [activePanel, isPlaying, playbackSec, tuner.frequency, tuner.hasSignal]);

    useEffect(() => {
        if (!isPlaying) {
            return;
        }

        void (async () => {
            const micReady = await syncLiveTuner(activePanel);
            if (!micReady && activePanel !== 'guide') {
                if (soundRef.current) {
                    await soundRef.current.pauseAsync();
                }
                isPlayingRef.current = false;
                setIsPlaying(false);
            }
        })();
    }, [activePanel, isPlaying]);

    const displayMode: Exclude<SongPanel, 'guide'> = activePanel === 'guide' ? 'tabs' : activePanel;
    const progress = Math.min(1, playbackSec / selectedSong.durationSec);
    const seekStepSeconds = appSettings?.songsSeekStepSeconds ?? 10;
    const stringLabels = useMemo(() => getDisplayStringLabels(selectedSong), [selectedSong]);
    const showFallbackTuningWarning = displayMode === 'tabs'
        && selectedSong.tabNotes.length > 0
        && !hasExplicitTuning(selectedSong)
        && (selectedSong.isImported || selectedSong.aiDraft);
    const nextChord = useMemo(() => {
        const next = selectedSong.chordEvents.find((event, index) => (
            !judgedEventIndexesRef.current.has(index) &&
            !missedEventIndexesRef.current.has(index) &&
            event.timeSec >= playbackSec - 0.1
        ));
        return next?.chord ?? '--';
    }, [selectedSong, playbackSec]);
    const nextTabLabel = nextTabTarget
        ? `${nextTabTarget.fret}@${getStringLabelForTabNote(selectedSong, nextTabTarget.stringIndex)}`
        : '--';

    const visibleChordEvents = selectedSong.chordEvents
        .map((event, index) => ({ ...event, index }))
        .filter((event) => {
            const x = PLAYHEAD_X + ((event.timeSec - playbackSec) * PIXELS_PER_SECOND);
            return x >= -90 && x <= LANE_WIDTH + 90;
        });

    const visibleTabNotes = selectedSong.tabNotes
        .map((note, index) => ({ ...note, index }))
        .filter((note) => {
            const x = PLAYHEAD_X + ((note.timeSec - playbackSec) * PIXELS_PER_SECOND);
            return x >= -90 && x <= LANE_WIDTH + 120;
        });

    const waveFrontPath = useMemo(
        () => buildWaveBandPath(LANE_WIDTH, LANE_HEIGHT, animationNow / 5.6, LANE_HEIGHT - 70, 14, 30),
        [animationNow],
    );
    const waveBackPath = useMemo(
        () => buildWaveBandPath(LANE_WIDTH, LANE_HEIGHT, animationNow / 8.3, LANE_HEIGHT - 112, 20, 52),
        [animationNow],
    );

    const rippleProgress = flashResult && pulseStartedAtRef.current
        ? Math.min(1, (animationNow - pulseStartedAtRef.current) / 520)
        : 1;
    const detectedNote = tuner.frequency ? tuner.noteName : '--';
    const detectedHz = tuner.frequency;
    const liveTabMatch = !!(
        tabTargetAtLine
        && tuner.frequency
        && tuner.hasSignal
        && isPitchMatchForTarget(tuner.frequency, tabTargetAtLine.target.midi, TUNER_A4_HZ)
    );

    const engineLabel = activePanel === 'guide'
        ? 'Preview'
        : tuner.isListening
            ? activePanel === 'tabs' ? 'Zero-Lag Tabs' : 'Zero-Lag Pitch'
            : 'Mic Idle';

    const engineText = activePanel === 'guide'
        ? 'Guide mode shows the hit-line and the live tab layout before you play.'
        : activePanel === 'tabs'
            ? isPlaying
                ? tabTargetAtLine
                    ? liveTabMatch
                        ? `Hit ${tabTargetAtLine.target.noteName} right on the line.`
                        : `Aim for ${tabTargetAtLine.target.noteName} as it crosses the mint line.`
                    : 'Listening for the next tab target...'
                : micStatus
            : isPlaying
                ? tuner.displayStatus
                : micStatus;
    const showMicFallbackAction = activePanel !== 'guide' && (
        tuner.microphonePermissionStatus === 'denied'
        || tuner.microphonePermissionStatus === 'blocked'
        || tuner.microphonePermissionStatus === 'error'
    );
    const micFallbackActionLabel = tuner.microphonePermissionStatus === 'blocked' || !tuner.canAskPermissionAgain
        ? 'Open Settings'
        : 'Try Again';

    const importShimmerTranslateX = importShimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-180, 280],
    });

    const showHitFlash = (result: HitResult) => {
        if (flashTimeoutRef.current) {
            clearTimeout(flashTimeoutRef.current);
        }

        pulseStartedAtRef.current = Date.now();
        setFlashResult(result);

        if (appSettings?.hapticsEnabled ?? true) {
            if (result.label === 'PERFECT') {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } else if (result.label === 'GOOD') {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } else {
                void Haptics.selectionAsync();
            }
        }

        // Keep the flash short so it feels snappy.
        flashTimeoutRef.current = setTimeout(() => {
            setFlashResult(null);
        }, 360);
    };

    const resetScoreState = () => {
        judgedEventIndexesRef.current = new Set();
        missedEventIndexesRef.current = new Set();
        hitTabIndexesRef.current = new Set();
        tabHitMomentsRef.current = new Map();
        hasScoredRef.current = false;
        setPerfectCount(0);
        setGoodCount(0);
        setMissedCount(0);
        setCombo(0);
        setBestCombo(0);
        setTabHitNonce(0);
        setScore(null);
        setFlashResult(null);
    };

    const resetRunStats = () => {
        resetScoreState();
        playbackAnchorSecRef.current = 0;
        playbackAnchorStampRef.current = Date.now();
        isPlayingRef.current = false;
        setPlaybackSec(0);
        setMicStatus(getIdleSongStatus(activePanel));
    };

    const syncSongDuration = (songId: string, nextDuration: number) => {
        if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
            return;
        }

        setSelectedSong((prev) => (prev.id === songId ? { ...prev, durationSec: nextDuration } : prev));
        setLibrarySongs((prev) => prev.map((song) => (song.id === songId ? { ...song, durationSec: nextDuration } : song)));
    };

    const buildScore = (song: SongLesson): SongScore => {
        const matched = perfectCount + goodCount;
        const missed = Math.max(song.chordEvents.length - matched, 0);
        const weightedHits = perfectCount + (goodCount * GOOD_WEIGHT);
        const accuracy = song.chordEvents.length > 0
            ? Math.round((weightedHits / song.chordEvents.length) * 100)
            : 0;

        return {
            accuracy,
            perfect: perfectCount,
            good: goodCount,
            missed,
            bestCombo,
        };
    };

    const getSongXpReward = (nextScore: SongScore | null) => {
        if (activePanel === 'tabs') {
            return 30;
        }

        if (!nextScore) {
            return 24;
        }

        return Math.max(24, Math.round(28 + (nextScore.accuracy * 0.55) + (nextScore.bestCombo * 1.1)));
    };

    const prepareTrack = async (song: SongLesson) => {
        if (loadedSongIdRef.current === song.id && soundRef.current) {
            return;
        }

        if (soundRef.current) {
            await soundRef.current.unloadAsync();
            soundRef.current = null;
        }

        const { sound, status } = await Audio.Sound.createAsync(
            song.backingTrack,
            { shouldPlay: false, progressUpdateIntervalMillis: 40 },
            onPlaybackStatusUpdate,
        );
        await sound.setProgressUpdateIntervalAsync(40);
        soundRef.current = sound;
        loadedSongIdRef.current = song.id;

        if (status.isLoaded && status.durationMillis) {
            syncSongDuration(song.id, status.durationMillis / 1000);
        }
    };

    const markExpiredEvents = (currentTimeSec: number) => {
        let newlyMissed = 0;

        selectedSongRef.current.chordEvents.forEach((event, index) => {
            if (judgedEventIndexesRef.current.has(index) || missedEventIndexesRef.current.has(index)) {
                return;
            }

            if (currentTimeSec > event.timeSec + GOOD_WINDOW_SEC) {
                missedEventIndexesRef.current.add(index);
                newlyMissed += 1;
            }
        });

        if (newlyMissed > 0) {
            setMissedCount((prev) => prev + newlyMissed);
            setCombo(0);
            showHitFlash({ label: 'MISS', color: SONG_COLORS.miss });
        }
    };

    const judgeDetectedNote = (noteClass: string) => {
        if (!isPlaying || hasScoredRef.current || activePanel !== 'chords') {
            return;
        }

        let bestMatchIndex = -1;
        let bestDistance = Number.POSITIVE_INFINITY;

        selectedSongRef.current.chordEvents.forEach((event, index) => {
            if (judgedEventIndexesRef.current.has(index) || missedEventIndexesRef.current.has(index)) {
                return;
            }

            const acceptedNotes = getAcceptedNotes(event.chord);
            if (!acceptedNotes.includes(noteClass)) {
                return;
            }

            const distance = Math.abs(event.timeSec - playbackSec);
            if (distance <= GOOD_WINDOW_SEC && distance < bestDistance) {
                bestDistance = distance;
                bestMatchIndex = index;
            }
        });

        if (bestMatchIndex === -1) {
            return;
        }

        judgedEventIndexesRef.current.add(bestMatchIndex);

        if (bestDistance <= PERFECT_WINDOW_SEC) {
            setPerfectCount((prev) => prev + 1);
            showHitFlash({ label: 'PERFECT', color: SONG_COLORS.primary });
        } else {
            setGoodCount((prev) => prev + 1);
            showHitFlash({ label: 'GOOD', color: SONG_COLORS.highlight });
        }

        setCombo((prevCombo) => {
            const nextCombo = prevCombo + 1;
            setBestCombo((prevBest) => Math.max(prevBest, nextCombo));
            return nextCombo;
        });
    };

    async function syncLiveTuner(panel: SongPanel = activePanel) {
        if (panel === 'guide') {
            await stopTuner();
            return true;
        }

        if (!tuner.isNativeModuleAvailable) {
            setMicStatus(TUNER_NATIVE_MODULE_MESSAGE);
            return false;
        }

        if (tuner.microphonePermissionStatus === 'blocked') {
            setMicStatus(tuner.microphonePermissionMessage ?? 'Enable microphone access in your device settings, then return to TuneUp.');
            return false;
        }

        if (tuner.microphonePermissionStatus === 'unavailable' || tuner.microphonePermissionStatus === 'error') {
            setMicStatus(tuner.microphonePermissionMessage ?? 'Could not start microphone input. Please check your microphone permission and try again.');
            return false;
        }

        const didStart = await startTuner();
        if (!didStart) {
            setMicStatus(tuner.microphonePermissionMessage ?? tuner.error ?? 'Could not start microphone input. Please check your microphone permission and try again.');
            return false;
        }

        return true;
    }

    const handleMicFallbackAction = async () => {
        if (tuner.microphonePermissionStatus === 'blocked' || !tuner.canAskPermissionAgain) {
            await Linking.openSettings();
            return;
        }

        await tuner.checkMicrophonePermission();
        await syncLiveTuner(activePanel);
    };

    const seekToTime = async (targetSec: number) => {
        try {
            await prepareTrack(selectedSongRef.current);
            if (!soundRef.current) {
                return;
            }

            const clamped = Math.max(0, Math.min(selectedSongRef.current.durationSec, targetSec));

            // Seeking changes the practice point, so we clear the old score run.
            resetScoreState();
            playbackAnchorSecRef.current = clamped;
            playbackAnchorStampRef.current = Date.now();
            setPlaybackSec(clamped);
            await soundRef.current.setPositionAsync(clamped * 1000);

            if (activePanel !== 'guide' && isPlayingRef.current) {
                const micReady = await syncLiveTuner(activePanel);
                if (!micReady) {
                    return;
                }
            } else if (activePanel === 'guide') {
                await stopTuner();
                setMicStatus(isPlayingRef.current ? 'Timeline moved' : 'Preview ready');
            } else {
                setMicStatus(getIdleSongStatus(activePanel));
            }
        } catch {
            setMicStatus('Seek missed');
        }
    };

    const seekBy = async (deltaSec: number) => {
        await seekToTime(playbackSec + deltaSec);
    };

    const runSongAnalysisForReview = async (
        audioAsset: ImportAudioAsset,
        tuningPreset: SongAnalysisTuningPreset,
        runId: number,
    ) => {
        setImportStatus('uploading');
        setImportProgressText('Uploading audio for AI transcription...');
        setImportProgressValue(0.14);

        const accepted = await analyzeAudioForSongImport(
            audioAsset.uri,
            audioAsset.name,
            gameSnapshot?.userId,
            {
                instrument: tuningPreset.instrument,
                tuningId: tuningPreset.id,
                tuningName: tuningPreset.name,
                stringNotes: tuningPreset.stringNotes,
            },
        );
        if (accepted.status !== 'accepted') {
            throw new Error(accepted.message);
        }

        if (!screenMountedRef.current || importRunIdRef.current !== runId) {
            return null;
        }

        setImportStatus('queued');
        setImportProgressText(accepted.progressText);
        setImportProgressValue(estimateSongImportProgress(accepted.progressText));

        let completedResult: SongImportResultPayload | null = null;
        let networkErrorCount = 0;
        const startedAt = Date.now();

        while ((Date.now() - startedAt) <= SONG_IMPORT_MAX_DURATION_MS) {
            if (!screenMountedRef.current || importRunIdRef.current !== runId) {
                return null;
            }

            const status = await fetchSongImportTaskStatus(accepted.taskId);

            if (status.status === 'completed') {
                completedResult = status.result;
                break;
            }

            if (status.status === 'failed' || status.status === 'timed_out' || status.status === 'cancelled' || status.status === 'expired') {
                throw new Error(status.message);
            }

            if (status.status === 'error') {
                networkErrorCount += 1;
                if (networkErrorCount >= SONG_IMPORT_MAX_NETWORK_ERRORS) {
                    throw new Error(status.message);
                }

                setImportStatus('analyzing');
                setImportProgressText('Could not connect to the analysis server. Retrying...');
                await delay(SONG_IMPORT_POLL_INTERVAL_MS);
                continue;
            }

            networkErrorCount = 0;
            if (status.status !== 'processing') {
                throw new Error('AI transcription returned an unexpected job status. Please try again.');
            }
            setImportStatus('analyzing');
            setImportProgressText(status.progressText);
            setImportProgressValue((prev) => Math.max(prev, estimateSongImportProgress(status.progressText)));
            await delay(SONG_IMPORT_POLL_INTERVAL_MS);
        }

        if (!completedResult) {
            throw new Error(SONG_IMPORT_TIMEOUT_MESSAGE);
        }

        const validation = validateSongManifest(completedResult.songManifest);
        if (!validation.ok) {
            throw new Error(formatManifestValidationError(validation.errors));
        }

        if (!Number.isFinite(completedResult.songManifest.durationSec) || completedResult.songManifest.durationSec <= 0) {
            throw new Error('AI transcription completed, but the song result was unavailable. Please try again.');
        }

        return completedResult;
    };

    const importSong = async () => {
        setImportStatus('selecting');
        setImportError(null);
        setPendingReview(null);
        setImportProgressText('Choose an audio file, then confirm instrument and tuning.');
        setImportProgressValue(0.08);

        try {
            const audioResult = await DocumentPicker.getDocumentAsync({
                type: 'audio/*',
                copyToCacheDirectory: true,
            });

            if (audioResult.canceled) {
                setImportStatus(selectedUploadAsset ? 'selecting' : 'idle');
                return;
            }

            if (!screenMountedRef.current) {
                return;
            }

            const audioAsset = audioResult.assets[0];
            setSelectedUploadAsset(audioAsset);
            setImportStatus('selecting');
            setImportProgressText('Confirm the tuning, then start AI analysis.');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not choose that audio file.';
            setImportStatus('failed');
            setImportError(message);
            showToast({
                title: 'File selection failed',
                message,
                variant: 'error',
            });
        }
    };

    const startSelectedSongAnalysis = async () => {
        if (!selectedUploadAsset || isImporting) {
            return;
        }

        const runId = importRunIdRef.current + 1;
        importRunIdRef.current = runId;
        setIsImporting(true);
        setImportStatus('uploading');
        setImportError(null);
        setPendingReview(null);
        let terminalStatus: SongImportStatus = 'idle';

        try {
            const completedResult = await runSongAnalysisForReview(selectedUploadAsset, analysisTuning, runId);

            if (!completedResult || !screenMountedRef.current || importRunIdRef.current !== runId) {
                return;
            }

            terminalStatus = 'review_ready';
            setImportStatus('review_ready');
            setImportProgressText('Review the generated song before saving.');
            setImportProgressValue(1);
            setPendingReview({
                audioAsset: selectedUploadAsset,
                result: completedResult,
                warnings: buildSongImportReviewWarnings(completedResult),
                createdAt: Date.now(),
            });
            setSelectedUploadAsset(null);
            showCelebration({
                title: 'AI Draft ready',
                subtitle: completedResult.fallbackUsed
                    ? 'TuneUp built a safe starter chart. Review it before saving.'
                    : `${cleanUploadedSongDisplayName(completedResult.songManifest.title)} is ready for review at ${formatBpm(completedResult.bpm)}.`,
                variant: 'success',
            }, 1800);
        } catch (error) {
            if (!screenMountedRef.current || importRunIdRef.current !== runId) {
                return;
            }

            const message = error instanceof Error ? error.message : 'Could not import that song package.';
            terminalStatus = 'failed';
            setImportStatus('failed');
            setImportError(message);
            showToast({
                title: 'Import failed',
                message,
                variant: 'error',
            });
        } finally {
            if (screenMountedRef.current && importRunIdRef.current === runId) {
                setIsImporting(false);
                if (terminalStatus !== 'review_ready') {
                    setImportProgressValue(0);
                    setImportProgressText('Pick one audio file and AI will build your chords and tabs.');
                }
            }
        }
    };

    const importManualManifest = async () => {
        setImportStatus('selecting');
        setImportError(null);

        try {
            const audioResult = await DocumentPicker.getDocumentAsync({
                type: 'audio/*',
                copyToCacheDirectory: true,
            });

            if (audioResult.canceled) {
                setImportStatus('idle');
                return;
            }

            const manifestResult = await DocumentPicker.getDocumentAsync({
                type: ['application/json', 'text/json', 'text/plain'],
                copyToCacheDirectory: true,
            });

            if (manifestResult.canceled) {
                setImportStatus('idle');
                return;
            }

            const importedSong = await importSongFromFiles(audioResult.assets[0], manifestResult.assets[0]);
            setLibrarySongs((prev) => [importedSong, ...prev.filter((song) => song.id !== importedSong.id)]);
            await selectSong(importedSong);
            setImportStatus('saved');
            setSongsSection('library');
            showToast({
                title: 'Manifest imported',
                message: `${importedSong.title} is ready in your Songs library.`,
                variant: 'success',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not import that song manifest.';
            setImportStatus('failed');
            setImportError(message);
            showToast({
                title: 'Manifest import failed',
                message,
                variant: 'error',
            });
        }
    };

    const savePendingReview = async (practiceNow: boolean) => {
        if (!pendingReview) {
            return;
        }

        try {
            const reviewTitle = cleanUploadedSongDisplayName(pendingReview.result.songManifest.title);
            const reviewArtist = pendingReview.result.songManifest.artist.trim().toLowerCase();
            const reviewSource = cleanUploadedSongDisplayName(pendingReview.audioAsset.name).toLowerCase();
            const existingSong = librarySongs.find((song) => (
                cleanUploadedSongDisplayName(song.title).toLowerCase() === reviewTitle.toLowerCase()
                && song.artist.trim().toLowerCase() === reviewArtist
                && !!song.sourceFileName
                && cleanUploadedSongDisplayName(song.sourceFileName).toLowerCase() === reviewSource
            ));
            if (existingSong) {
                if (practiceNow) {
                    await selectSong(existingSong);
                }
                setPendingReview(null);
                setImportStatus('saved');
                setSongsSection('library');
                showToast({
                    title: 'Already in library',
                    message: 'This song is already in your library.',
                    variant: 'success',
                });
                return;
            }

            const importedSong = await importSongFromGeneratedManifest(pendingReview.audioAsset, pendingReview.result.songManifest);
            const didAlreadyExist = librarySongs.some((song) => song.id === importedSong.id);
            setLibrarySongs((prev) => [importedSong, ...prev.filter((song) => song.id !== importedSong.id)]);
            setPendingReview(null);
            setImportStatus('saved');
            setImportError(null);
            setSongsSection('library');

            if (practiceNow) {
                await selectSong(importedSong);
            }

            showCelebration({
                title: didAlreadyExist ? 'Already in library' : practiceNow ? 'Song saved' : 'Added to library',
                subtitle: didAlreadyExist
                    ? 'TuneUp kept your existing saved copy.'
                    : practiceNow
                    ? `${importedSong.title} is open in Song Flow.`
                    : `${importedSong.title} is ready whenever you are.`,
                variant: 'confetti',
            }, 2000);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not save that song.';
            setImportStatus('failed');
            setImportError(message);
            showToast({
                title: 'Save failed',
                message,
                variant: 'error',
            });
        }
    };

    const discardPendingReview = () => {
        setPendingReview(null);
        setImportStatus('idle');
        setImportProgressText('Pick one audio file and AI will build your chords and tabs.');
        setImportProgressValue(0);
    };

    const chooseAnalysisInstrument = (instrument: SongAnalysisInstrument) => {
        setAnalysisInstrument(instrument);
        setAnalysisTuning(getDefaultSongAnalysisTuning(instrument));
    };

    const reanalyzePendingReview = async () => {
        if (!pendingReview || isImporting) {
            return;
        }

        const runId = importRunIdRef.current + 1;
        importRunIdRef.current = runId;
        setIsImporting(true);
        setImportError(null);
        setPendingReview(null);
        let terminalStatus: SongImportStatus = 'idle';

        try {
            const completedResult = await runSongAnalysisForReview(pendingReview.audioAsset, analysisTuning, runId);
            if (!completedResult || !screenMountedRef.current || importRunIdRef.current !== runId) {
                return;
            }

            terminalStatus = 'review_ready';
            setImportStatus('review_ready');
            setPendingReview({
                audioAsset: pendingReview.audioAsset,
                result: completedResult,
                warnings: buildSongImportReviewWarnings(completedResult),
                createdAt: Date.now(),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not re-analyze that song.';
            terminalStatus = 'failed';
            setImportStatus('failed');
            setImportError(message);
            showToast({
                title: 'Re-analysis failed',
                message,
                variant: 'error',
            });
        } finally {
            if (screenMountedRef.current && importRunIdRef.current === runId) {
                setIsImporting(false);
                if (terminalStatus !== 'review_ready') {
                    setImportProgressValue(0);
                }
            }
        }
    };

    const openDemoSong = async () => {
        setActionSong(null);
        setSongsSection('library');
        await selectSong(SONG_LESSONS[0]);
        showToast({
            title: 'Demo song loaded',
            message: 'TuneUp Demo Riff is verified, offline, and ready for Song Flow.',
            variant: 'success',
        });
    };

    const openSongActions = (song: SongLesson) => {
        setActionSong(song);
    };

    const closeSongActions = () => {
        setActionSong(null);
    };

    const openEditSong = (song: SongLesson) => {
        if (!song.isImported) {
            return;
        }

        setActionSong(null);
        setEditingSong(song);
        setEditTitle(song.title);
        setEditArtist(song.artist === 'Imported Track' ? '' : song.artist);
        setEditBpm(typeof song.bpm === 'number' && Number.isFinite(song.bpm) && song.bpm > 0 ? `${Math.round(song.bpm)}` : '');
        setEditError(null);
    };

    const cancelEditSong = () => {
        setEditingSong(null);
        setEditTitle('');
        setEditArtist('');
        setEditBpm('');
        setEditError(null);
    };

    const saveEditedSong = async () => {
        if (!editingSong) {
            return;
        }

        const title = editTitle.trim();
        if (!title) {
            setEditError('Title is required.');
            return;
        }

        const normalizedBpmText = editBpm.trim();
        let bpm: number | null = null;
        if (normalizedBpmText) {
            const parsedBpm = Number(normalizedBpmText);
            if (!Number.isFinite(parsedBpm) || parsedBpm <= 0) {
                setEditError('BPM must be a positive number.');
                return;
            }
            bpm = parsedBpm;
        }

        try {
            const updatedSong = await updateSavedSongMetadata(editingSong.id, {
                title,
                artist: editArtist,
                bpm,
            });
            if (!updatedSong) {
                throw new Error('That song is no longer in your library.');
            }

            setLibrarySongs((prev) => prev.map((song) => (song.id === updatedSong.id ? updatedSong : song)));
            if (selectedSongRef.current.id === updatedSong.id) {
                setSelectedSong(updatedSong);
            }
            cancelEditSong();
            showToast({
                title: 'Song updated',
                message: `${updatedSong.title} was updated in your library.`,
                variant: 'success',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not save those song details.';
            setEditError(message);
            showToast({
                title: 'Edit failed',
                message,
                variant: 'error',
            });
        }
    };

    const toggleFavoriteSong = async (song: SongLesson) => {
        if (!song.isImported) {
            return;
        }

        try {
            setActionSong(null);
            const updatedSong = await updateSavedSongFavorite(song.id, !song.isFavorite);
            if (!updatedSong) {
                throw new Error('That song is no longer in your library.');
            }

            setLibrarySongs((prev) => prev.map((candidate) => (candidate.id === updatedSong.id ? updatedSong : candidate)));
            if (selectedSongRef.current.id === updatedSong.id) {
                setSelectedSong(updatedSong);
            }
        } catch (error) {
            showToast({
                title: 'Favorite failed',
                message: error instanceof Error ? error.message : 'Could not update that favorite.',
                variant: 'error',
            });
        }
    };

    const deleteSavedSong = async (song: SongLesson) => {
        if (!song.isImported) {
            return;
        }

        try {
            setActionSong(null);
            await deleteImportedSong(song.id);
            setLibrarySongs((prev) => prev.filter((candidate) => candidate.id !== song.id));
            if (editingSong?.id === song.id) {
                cancelEditSong();
            }

            if (selectedSongRef.current.id === song.id) {
                await selectSong(SONG_LESSONS[0]);
            }

            showToast({
                title: 'Song deleted',
                message: `${song.title} was removed from your TuneUp library.`,
                variant: 'success',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not delete that song.';
            showToast({
                title: 'Delete failed',
                message,
                variant: 'error',
            });
        }
    };

    const confirmDeleteSong = (song: SongLesson) => {
        if (!song.isImported) {
            return;
        }

        Alert.alert(
            'Delete this song?',
            'This removes it from your TuneUp library. You can import or analyze it again later.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => void deleteSavedSong(song),
                },
            ],
        );
    };

    const finishSession = async (song: SongLesson) => {
        if (hasScoredRef.current) {
            return;
        }

        hasScoredRef.current = true;
        isPlayingRef.current = false;

        if (soundRef.current) {
            await soundRef.current.pauseAsync();
        }

        await stopTuner();
        setIsPlaying(false);
        const nextScore = activePanel === 'chords' ? buildScore(song) : null;
        setScore(nextScore);

        const completionRatio = song.durationSec > 0 ? (playbackSec / song.durationSec) : 0;
        const earnedEnoughRunTime = completionRatio >= 0.55 || playbackSec >= Math.min(song.durationSec, 45);
        const earnedStrongScore = !!nextScore && nextScore.accuracy >= 45;
        const shouldAwardReward = activePanel === 'tabs'
            ? earnedEnoughRunTime
            : earnedEnoughRunTime || earnedStrongScore;

        if (!shouldAwardReward) {
            setMicStatus('Play a bit longer to earn XP from this run');
            return;
        }

        try {
            const xpReward = getSongXpReward(nextScore);
            const result = await rewardPracticeActivity(xpReward, { kind: 'song', id: song.id });
            setGameSnapshot(result.snapshot);
            setMicStatus(`Session complete • +${xpReward} XP`);

            if (result.newBadges.length > 0) {
                showCelebration({
                    title: 'Badge unlocked',
                    subtitle: result.newBadges.map((badge) => badge.title).join(' • '),
                    variant: 'confetti',
                }, 2200);
            } else {
                showCelebration({
                    title: 'Session complete',
                    subtitle: nextScore
                        ? `${nextScore.accuracy}% accuracy • +${xpReward} XP`
                        : `Playback run logged for +${xpReward} XP`,
                    variant: nextScore && nextScore.accuracy >= 80 ? 'confetti' : 'success',
                }, 2000);
            }
        } catch {
            setMicStatus('Session complete');
        }
    };

    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
            return;
        }

        const currentTimeSec = status.positionMillis / 1000;
        playbackAnchorSecRef.current = currentTimeSec;
        playbackAnchorStampRef.current = Date.now();
        isPlayingRef.current = status.isPlaying;

        if (!status.isPlaying) {
            setPlaybackSec(currentTimeSec);
        }

        setIsPlaying(status.isPlaying);

        if (status.didJustFinish) {
            void finishSession(selectedSongRef.current);
        }
    };

    const startFromTop = async () => {
        resetRunStats();
        await prepareTrack(selectedSong);

        if (!soundRef.current) {
            return;
        }

        await soundRef.current.setPositionAsync(0);
        playbackAnchorSecRef.current = 0;
        playbackAnchorStampRef.current = Date.now();
        setPlaybackSec(0);

        const micReady = await syncLiveTuner(activePanel);
        if (!micReady) {
            return;
        }

        await soundRef.current.playAsync();
        isPlayingRef.current = true;
        setIsPlaying(true);
    };

    const resumeSong = async () => {
        await prepareTrack(selectedSong);
        if (!soundRef.current) {
            return;
        }

        const micReady = await syncLiveTuner(activePanel);
        if (!micReady) {
            return;
        }

        playbackAnchorStampRef.current = Date.now();
        await soundRef.current.playAsync();
        isPlayingRef.current = true;
        setIsPlaying(true);
    };

    const togglePlayback = async () => {
        try {
            if (isPlaying) {
                if (soundRef.current) {
                    await soundRef.current.pauseAsync();
                }
                isPlayingRef.current = false;
                await stopTuner();
                setIsPlaying(false);
                setMicStatus(activePanel === 'guide' ? 'Preview paused' : 'Playback paused');
                return;
            }

            const isFreshStart = !soundRef.current || hasScoredRef.current || score || playbackSec <= 0.02 || playbackSec >= selectedSong.durationSec - 0.08;
            if (isFreshStart) {
                await startFromTop();
            } else {
                await resumeSong();
            }
        } catch {
            setMicStatus('Session could not start');
        }
    };

    const restartSong = async () => {
        try {
            await startFromTop();
        } catch {
            setMicStatus('Restart missed');
        }
    };

    const selectSong = async (song: SongLesson) => {
        if (song.id === selectedSong.id) {
            return;
        }

        isPlayingRef.current = false;

        if (soundRef.current) {
            await soundRef.current.unloadAsync();
            soundRef.current = null;
        }

        await stopTuner();
        loadedSongIdRef.current = null;
        setSelectedSong(song);
        setIsPlaying(false);
        setPlaybackSec(0);
        setScore(null);
        hasScoredRef.current = false;
        judgedEventIndexesRef.current = new Set();
        missedEventIndexesRef.current = new Set();
        hitTabIndexesRef.current = new Set();
        tabHitMomentsRef.current = new Map();
        setTabHitNonce(0);
        setCombo(0);
        setBestCombo(0);
        setPerfectCount(0);
        setGoodCount(0);
        setMissedCount(0);
        setMicStatus(getIdleSongStatus(activePanel));
    };

    return (
        <LinearGradient
            colors={[SONG_COLORS.panelRaised, SONG_COLORS.backgroundA, SONG_COLORS.backgroundB]}
            start={{ x: 0.02, y: 0 }}
            end={{ x: 0.98, y: 1 }}
            style={styles.screen}
        >
            <PremiumBackdrop variant="song" />
            <PageTransitionView style={styles.screen}>
            <ScrollView
                contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + 28 }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.backGlowMint} />
                <View style={styles.backGlowAmber} />

                <View style={styles.headerRow}>
                    <View style={styles.headerTextWrap}>
                        <Text style={styles.header}>Songs</Text>
                        <Text style={styles.subHeader}>Upload, analyze, and practice your music.</Text>
                    </View>
                    <ScreenSettingsButton />
                </View>

                <PremiumHeroStrip
                    icon="disc-outline"
                    eyebrow="Practice Library"
                    title="Build a playable library from songs, manifests, and safe demo charts."
                    body="Upload audio for AI analysis, review the generated chart, save it locally, then launch straight into Song Flow practice."
                    metrics={[
                        { label: 'Songs', value: `${allSongs.length}` },
                        { label: 'Imports', value: `${librarySongs.length}` },
                        { label: 'Import', value: getImportStatusText(importStatus) },
                    ]}
                    dark
                    colors={['#6930c3', '#5390d9', '#4ea8de']}
                />

                {isBootLoading ? (
                    <>
                        <View style={styles.streakBanner}>
                            <SkeletonBlock style={{ width: 112, height: 12, marginBottom: 8 }} />
                            <SkeletonBlock style={{ width: '84%', height: 14 }} />
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.songPickerRow}>
                            {[0, 1, 2].map((index) => (
                                <View key={`song-skeleton-${index}`} style={styles.songChip}>
                                    <SkeletonBlock style={{ width: '58%', height: 15, marginBottom: 8 }} />
                                    <SkeletonBlock style={{ width: '82%', height: 12, marginBottom: 10 }} />
                                    <SkeletonBlock style={{ width: 54, height: 12 }} />
                                </View>
                            ))}
                        </ScrollView>

                        <View style={styles.playerShell}>
                            <View style={styles.songMetaRow}>
                                <View style={styles.songMetaMain}>
                                    <SkeletonBlock style={{ width: 150, height: 20, marginBottom: 8 }} />
                                    <SkeletonBlock style={{ width: 110, height: 12 }} />
                                </View>
                                <SkeletonBlock style={{ width: 76, height: 34 }} />
                            </View>

                            <View style={styles.hudRibbon}>
                                {[0, 1, 2].map((index) => (
                                    <View key={`hud-skeleton-${index}`} style={styles.hudPill}>
                                        <SkeletonBlock style={{ width: 48, height: 10, marginBottom: 8 }} />
                                        <SkeletonBlock style={{ width: 82, height: 14 }} />
                                    </View>
                                ))}
                            </View>

                            <SkeletonBlock style={{ width: '100%', height: 14, marginBottom: 10 }} />
                            <SkeletonBlock style={{ width: '100%', height: LANE_HEIGHT, marginBottom: 14 }} />

                            <View style={styles.transportRow}>
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <SkeletonBlock key={`transport-skeleton-${index}`} style={{ flex: 1, height: 46 }} />
                                ))}
                            </View>

                            <View style={styles.statusPanel}>
                                <SkeletonBlock style={{ width: 84, height: 26, marginBottom: 12 }} />
                                <SkeletonBlock style={{ width: '72%', height: 18, marginBottom: 14 }} />
                                <View style={styles.statusMetricsRow}>
                                    {[0, 1, 2].map((index) => (
                                        <SkeletonBlock key={`status-skeleton-${index}`} style={{ flex: 1, height: 72 }} />
                                    ))}
                                </View>
                            </View>
                        </View>
                    </>
                ) : (
                <>
                {gameSnapshot && appSettings?.songsShowStreakBanner !== false && (
                    <View style={styles.streakBanner}>
                        <Text style={styles.streakBannerTitle}>{gameSnapshot.streakDays}-day streak</Text>
                        <Text style={styles.streakBannerText}>{gameSnapshot.streakMessage}</Text>
                    </View>
                )}

                <View style={styles.libraryPanel}>
                    <View style={styles.libraryHeaderRow}>
                        <View style={styles.libraryHeaderText}>
                            <Text style={styles.libraryTitle}>Practice Library</Text>
                            <Text style={styles.librarySubtitle}>Review AI charts before saving, or jump into a built-in demo.</Text>
                        </View>
                        <View style={styles.libraryCountPill}>
                            <Text style={styles.libraryCountText}>{allSongs.length} tracks</Text>
                        </View>
                    </View>

                    <View style={styles.songsSectionSwitchRow}>
                        {(['upload', 'library'] as SongsSection[]).map((section) => {
                            const isActive = songsSection === section;
                            return (
                                <Pressable
                                    key={section}
                                    style={({ pressed }) => [
                                        styles.songsSectionSwitchButton,
                                        isActive && styles.songsSectionSwitchButtonActive,
                                        pressed && styles.songChipPressed,
                                    ]}
                                    onPress={() => setSongsSection(section)}
                                >
                                    <Text style={[styles.songsSectionSwitchText, isActive && styles.songsSectionSwitchTextActive]}>
                                        {section === 'upload' ? 'Upload' : 'Library'}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    {songsSection === 'upload' && (
                        <>
                    <View style={styles.uploadIntroBlock}>
                        <Text style={styles.uploadIntroTitle}>Create a practice chart</Text>
                        <Text style={styles.uploadIntroText}>Upload audio, import a manifest, or open the verified demo song.</Text>
                    </View>

                    <View style={styles.libraryActionRow}>
                        <Pressable
                            style={({ pressed }) => [
                                styles.libraryActionButton,
                                styles.libraryActionPrimary,
                                pressed && styles.songChipPressed,
                                isImporting && styles.libraryActionDisabled,
                            ]}
                            onPress={() => void importSong()}
                            disabled={isImporting}
                        >
                            <Text style={styles.libraryActionPrimaryText}>Upload Song</Text>
                            <Text style={styles.libraryActionMeta}>Analyze audio</Text>
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [
                                styles.libraryActionButton,
                                pressed && styles.songChipPressed,
                                isImporting && styles.libraryActionDisabled,
                            ]}
                            onPress={() => void importManualManifest()}
                            disabled={isImporting}
                        >
                            <Text style={styles.libraryActionText}>Import Manifest</Text>
                            <Text style={styles.libraryActionMeta}>Audio + JSON</Text>
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [styles.libraryActionButton, pressed && styles.songChipPressed]}
                            onPress={() => void openDemoSong()}
                        >
                            <Text style={styles.libraryActionText}>Demo Song</Text>
                            <Text style={styles.libraryActionMeta}>No backend</Text>
                        </Pressable>
                    </View>

                    <View style={styles.tuningPanel}>
                        <View style={styles.tuningHeaderRow}>
                            <View style={styles.tuningHeaderText}>
                                <Text style={styles.tuningTitle}>Instrument & tuning</Text>
                                <Text style={styles.tuningSubtitle}>
                                    Choose the tuning that matches your song. This helps TuneUp map detected notes to better fret positions.
                                </Text>
                            </View>
                            <View style={styles.aiDraftPill}>
                                <Text style={styles.aiDraftPillText}>AI Draft</Text>
                            </View>
                        </View>

                        <View style={styles.instrumentSwitchRow}>
                            {(['guitar', 'bass'] as SongAnalysisInstrument[]).map((instrument) => {
                                const isActive = analysisInstrument === instrument;
                                return (
                                    <Pressable
                                        key={instrument}
                                        style={({ pressed }) => [
                                            styles.instrumentSwitchButton,
                                            isActive && styles.instrumentSwitchButtonActive,
                                            pressed && styles.songChipPressed,
                                        ]}
                                        onPress={() => chooseAnalysisInstrument(instrument)}
                                    >
                                        <Text style={[styles.instrumentSwitchText, isActive && styles.instrumentSwitchTextActive]}>
                                            {instrument === 'guitar' ? 'Guitar' : 'Bass'}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tuningChipRow}>
                            {analysisTuningOptions.map((preset) => {
                                const isActive = analysisTuning.id === preset.id;
                                return (
                                    <Pressable
                                        key={preset.id}
                                        style={({ pressed }) => [
                                            styles.tuningChip,
                                            isActive && styles.tuningChipActive,
                                            pressed && styles.songChipPressed,
                                        ]}
                                        onPress={() => setAnalysisTuning(preset)}
                                    >
                                        <Text style={[styles.tuningChipTitle, isActive && styles.tuningChipTitleActive]}>
                                            {preset.name}
                                        </Text>
                                        <Text style={styles.tuningChipMeta}>
                                            {preset.stringNotes.length > 0 ? preset.stringNotes.join(' ') : 'Adds a stronger draft warning'}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        {selectedUploadAsset && (
                            <View style={styles.selectedUploadCard}>
                                <View style={styles.selectedUploadText}>
                                    <Text style={styles.selectedUploadTitle}>{cleanUploadedSongDisplayName(selectedUploadAsset.name)}</Text>
                                    <Text style={styles.selectedUploadMeta}>
                                        {formatFileSize(selectedUploadAsset.size)} • {analysisTuning.name}
                                    </Text>
                                </View>
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.startAnalysisButton,
                                        pressed && styles.songChipPressed,
                                        isImporting && styles.libraryActionDisabled,
                                    ]}
                                    onPress={() => void startSelectedSongAnalysis()}
                                    disabled={isImporting}
                                >
                                    <Text style={styles.startAnalysisButtonText}>
                                        {isImporting ? 'Analyzing...' : 'Start AI Analysis'}
                                    </Text>
                                </Pressable>
                            </View>
                        )}
                    </View>

                    {!pendingReview && !selectedUploadAsset && !isImporting && importStatus !== 'failed' && (
                        <View style={styles.uploadEmptyState}>
                            <Text style={styles.libraryEmptyTitle}>Ready when you are.</Text>
                            <Text style={styles.libraryEmptyText}>
                                Start with audio analysis, bring your own manifest, or use the offline demo as a reliable practice chart.
                            </Text>
                        </View>
                    )}
                        </>
                    )}

                    {songsSection === 'library' && (
                        <>
                    <View style={styles.librarySearchRow}>
                        <TextInput
                            value={librarySearchQuery}
                            onChangeText={setLibrarySearchQuery}
                            placeholder="Search songs or artists"
                            placeholderTextColor={SONG_COLORS.textMute}
                            style={styles.librarySearchInput}
                        />
                        {librarySearchQuery.trim().length > 0 && (
                            <Pressable
                                style={({ pressed }) => [styles.librarySearchClearButton, pressed && styles.songChipPressed]}
                                onPress={() => setLibrarySearchQuery('')}
                            >
                                <Text style={styles.librarySearchClearText}>Clear</Text>
                            </Pressable>
                        )}
                    </View>

                    <View style={styles.libraryToolsRow}>
                        <Text style={styles.libraryCountSubtle}>{libraryCountText}</Text>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                        {(['all', 'ready', 'analyzing', 'failed', 'imported', 'favorites'] as SongLibraryFilter[]).map((filter) => {
                            const isActive = libraryFilter === filter;
                            return (
                                <Pressable
                                    key={filter}
                                    style={({ pressed }) => [
                                        styles.filterChip,
                                        isActive && styles.filterChipActive,
                                        pressed && styles.songChipPressed,
                                    ]}
                                    onPress={() => setLibraryFilter(filter)}
                                >
                                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                                        {filter.charAt(0).toUpperCase() + filter.slice(1).replace('_', ' ')}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                        {([
                            ['recent', 'Recently Added'],
                            ['title', 'Title A-Z'],
                            ['bpm', 'BPM'],
                            ['ai_draft', 'AI Draft First'],
                            ['verified', 'Verified First'],
                        ] as Array<[SongLibrarySortMode, string]>).map(([sortMode, label]) => {
                            const isActive = librarySortMode === sortMode;
                            return (
                                <Pressable
                                    key={sortMode}
                                    style={({ pressed }) => [
                                        styles.sortChip,
                                        isActive && styles.sortChipActive,
                                        pressed && styles.songChipPressed,
                                    ]}
                                    onPress={() => setLibrarySortMode(sortMode)}
                                >
                                    <Text style={[styles.sortChipText, isActive && styles.sortChipTextActive]}>{label}</Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                        </>
                    )}

                    {songsSection === 'upload' && pendingReview && (
                        <View style={styles.reviewCard}>
                            <View style={styles.reviewHeaderRow}>
                                <View style={styles.reviewHeaderText}>
                                    <Text style={styles.reviewEyebrow}>Review AI Draft</Text>
                                    <Text style={styles.reviewTitle}>{cleanUploadedSongDisplayName(pendingReview.result.songManifest.title)}</Text>
                                    <Text style={styles.reviewMeta}>
                                        {pendingReview.result.songManifest.artist} • {formatBpm(pendingReview.result.bpm)} • {formatSongDuration(pendingReview.result.songManifest.durationSec)}
                                    </Text>
                                    <Text style={styles.reviewMeta}>
                                        {(pendingReview.result.songManifest.instrument ?? 'guitar').toUpperCase()} • {pendingReview.result.songManifest.tuning?.name ?? analysisTuning.name}
                                    </Text>
                                </View>
                                <View style={styles.reviewBadge}>
                                    <Text style={styles.reviewBadgeText}>AI Draft</Text>
                                </View>
                            </View>
                            <Text style={styles.reviewPreviewText}>
                                TuneUp generated a playable draft from your audio. Check the tuning and warnings before saving.
                            </Text>

                            <View style={styles.reviewMetricsRow}>
                                <View style={styles.reviewMetricBox}>
                                    <Text style={styles.reviewMetricValue}>{pendingReview.result.songManifest.chordEvents.length}</Text>
                                    <Text style={styles.reviewMetricLabel}>Chords</Text>
                                </View>
                                <View style={styles.reviewMetricBox}>
                                    <Text style={styles.reviewMetricValue}>{pendingReview.result.songManifest.tabNotes.length}</Text>
                                    <Text style={styles.reviewMetricLabel}>Tab notes</Text>
                                </View>
                                <View style={styles.reviewMetricBox}>
                                    <Text style={styles.reviewMetricValue}>{Math.round(pendingReview.result.confidenceBreakdown.tabs * 100)}%</Text>
                                    <Text style={styles.reviewMetricLabel}>Tab conf.</Text>
                                </View>
                            </View>

                            {pendingReview.result.songManifest.chordEvents.length > 0 && (
                                <Text style={styles.reviewPreviewText}>
                                    Preview: {pendingReview.result.songManifest.chordEvents.slice(0, 8).map((event) => event.chord).join('  •  ')}
                                </Text>
                            )}

                            {pendingReview.warnings.length > 0 && (
                                <View style={styles.reviewWarningBox}>
                                    {pendingReview.warnings.slice(0, 4).map((warning) => (
                                        <Text key={warning} style={styles.reviewWarningText}>• {warning}</Text>
                                    ))}
                                </View>
                            )}

                            <Text style={styles.reviewFileText}>
                                Source: {cleanUploadedSongDisplayName(pendingReview.audioAsset.name)} • {formatFileSize(pendingReview.audioAsset.size)}
                            </Text>

                            <View style={styles.reviewActionRow}>
                                <Pressable
                                    style={({ pressed }) => [styles.reviewButton, styles.reviewButtonPrimary, pressed && styles.songChipPressed]}
                                    onPress={() => void savePendingReview(true)}
                                >
                                    <Text style={styles.reviewButtonPrimaryText}>Practice Now</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.reviewButton, pressed && styles.songChipPressed]}
                                    onPress={() => void savePendingReview(false)}
                                >
                                    <Text style={styles.reviewButtonText}>Save to Library</Text>
                                </Pressable>
                            </View>
                            <View style={styles.reviewActionRow}>
                                <Pressable
                                    style={({ pressed }) => [styles.reviewButton, pressed && styles.songChipPressed]}
                                    onPress={() => void reanalyzePendingReview()}
                                    disabled={isImporting}
                                >
                                    <Text style={styles.reviewButtonText}>Re-analyze</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.reviewButton, styles.reviewButtonDanger, pressed && styles.songChipPressed]}
                                    onPress={discardPendingReview}
                                >
                                    <Text style={styles.reviewButtonDangerText}>Discard</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}

                    {songsSection === 'library' && editingSong && (
                        <View style={styles.editSongCard}>
                            <View style={styles.reviewHeaderRow}>
                                <View style={styles.reviewHeaderText}>
                                    <Text style={styles.reviewEyebrow}>Library</Text>
                                    <Text style={styles.reviewTitle}>Edit song details</Text>
                                    <Text style={styles.reviewMeta}>
                                        {editingSong.tuning?.name ? `Tuning: ${editingSong.tuning.name}` : 'Local saved song'}
                                    </Text>
                                </View>
                                <View style={styles.reviewBadge}>
                                    <Text style={styles.reviewBadgeText}>Edit</Text>
                                </View>
                            </View>

                            <View style={styles.editFieldGroup}>
                                <Text style={styles.editFieldLabel}>Title</Text>
                                <TextInput
                                    value={editTitle}
                                    onChangeText={(value) => {
                                        setEditTitle(value);
                                        setEditError(null);
                                    }}
                                    placeholder="Song title"
                                    placeholderTextColor={SONG_COLORS.textMute}
                                    style={styles.editTextInput}
                                />
                            </View>
                            <View style={styles.editFieldGroup}>
                                <Text style={styles.editFieldLabel}>Artist</Text>
                                <TextInput
                                    value={editArtist}
                                    onChangeText={(value) => {
                                        setEditArtist(value);
                                        setEditError(null);
                                    }}
                                    placeholder="Artist optional"
                                    placeholderTextColor={SONG_COLORS.textMute}
                                    style={styles.editTextInput}
                                />
                            </View>
                            <View style={styles.editFieldGroup}>
                                <Text style={styles.editFieldLabel}>BPM</Text>
                                <TextInput
                                    value={editBpm}
                                    onChangeText={(value) => {
                                        setEditBpm(value.replace(/[^0-9.]/g, ''));
                                        setEditError(null);
                                    }}
                                    placeholder="BPM optional"
                                    placeholderTextColor={SONG_COLORS.textMute}
                                    keyboardType="decimal-pad"
                                    style={styles.editTextInput}
                                />
                            </View>

                            {editError && (
                                <Text style={styles.editErrorText}>{editError}</Text>
                            )}

                            <View style={styles.reviewActionRow}>
                                <Pressable
                                    style={({ pressed }) => [styles.reviewButton, pressed && styles.songChipPressed]}
                                    onPress={cancelEditSong}
                                >
                                    <Text style={styles.reviewButtonText}>Cancel</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.reviewButton, styles.reviewButtonPrimary, pressed && styles.songChipPressed]}
                                    onPress={() => void saveEditedSong()}
                                >
                                    <Text style={styles.reviewButtonPrimaryText}>Save Changes</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}

                    {songsSection === 'upload' && importStatus === 'failed' && importError && !isImporting && (
                        <View style={styles.libraryErrorCard}>
                            <Text style={styles.libraryErrorTitle}>Import needs attention</Text>
                            <Text style={styles.libraryErrorText}>{importError}</Text>
                            <Pressable
                                style={({ pressed }) => [styles.libraryRetryButton, pressed && styles.songChipPressed]}
                                onPress={() => void importSong()}
                            >
                                <Text style={styles.libraryRetryText}>Try Upload Again</Text>
                            </Pressable>
                        </View>
                    )}

                    {songsSection === 'library' && actionSong && (
                        <View style={styles.songActionSheet}>
                            <View style={styles.songActionHeader}>
                                <View style={styles.songActionHeaderText}>
                                    <Text style={styles.songActionTitle}>{actionSong.title}</Text>
                                    <Text style={styles.songActionSubtitle}>{actionSong.artist}</Text>
                                </View>
                                <View style={styles.songStatusPill}>
                                    <Text style={styles.songStatusText}>{actionSong.isImported ? 'Saved' : 'Demo'}</Text>
                                </View>
                            </View>
                            <View style={styles.songActionGrid}>
                                <Pressable
                                    style={({ pressed }) => [styles.songActionButton, styles.songActionButtonPrimary, pressed && styles.songChipPressed]}
                                    onPress={() => {
                                        closeSongActions();
                                        void selectSong(actionSong);
                                    }}
                                >
                                    <Text style={styles.songActionButtonPrimaryText}>Practice</Text>
                                </Pressable>
                                {actionSong.isImported && (
                                    <>
                                        <Pressable
                                            style={({ pressed }) => [styles.songActionButton, pressed && styles.songChipPressed]}
                                            onPress={() => void toggleFavoriteSong(actionSong)}
                                        >
                                            <Text style={styles.songActionButtonText}>{actionSong.isFavorite ? 'Unfavorite' : 'Favorite'}</Text>
                                        </Pressable>
                                        <Pressable
                                            style={({ pressed }) => [styles.songActionButton, pressed && styles.songChipPressed]}
                                            onPress={() => openEditSong(actionSong)}
                                        >
                                            <Text style={styles.songActionButtonText}>Edit</Text>
                                        </Pressable>
                                        <Pressable
                                            style={({ pressed }) => [styles.songActionButton, styles.songActionButtonDanger, pressed && styles.songChipPressed]}
                                            onPress={() => {
                                                closeSongActions();
                                                confirmDeleteSong(actionSong);
                                            }}
                                        >
                                            <Text style={styles.songActionButtonDangerText}>Delete</Text>
                                        </Pressable>
                                    </>
                                )}
                                <Pressable
                                    style={({ pressed }) => [styles.songActionButton, pressed && styles.songChipPressed]}
                                    onPress={closeSongActions}
                                >
                                    <Text style={styles.songActionButtonText}>Cancel</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}

                    {songsSection === 'library' && (
                    <View style={styles.songGrid}>
                        {filteredLibraryCards.length === 0 ? (
                            <View style={styles.libraryEmptyState}>
                                <Text style={styles.libraryEmptyTitle}>{hasActiveLibraryFilter ? 'No matching songs.' : 'Your library is empty.'}</Text>
                                <Text style={styles.libraryEmptyText}>
                                    {hasActiveLibraryFilter
                                        ? 'Clear search or adjust filters to show more songs.'
                                        : 'Upload or import a song to build your practice library.'}
                                </Text>
                                <Pressable
                                    style={({ pressed }) => [styles.libraryEmptyButton, pressed && styles.songChipPressed]}
                                    onPress={() => {
                                        setLibrarySearchQuery('');
                                        setLibraryFilter('all');
                                        setSongsSection('upload');
                                    }}
                                >
                                    <Text style={styles.libraryEmptyButtonText}>Go to Upload</Text>
                                </Pressable>
                            </View>
                        ) : filteredLibraryCards.map((card) => {
                            const song = allSongs.find((candidate) => candidate.id === card.id);
                            if (!song) {
                                return null;
                            }

                            return (
                                <Pressable
                                    key={song.id}
                                    style={({ pressed }) => [
                                        styles.librarySongCard,
                                        selectedSong.id === song.id && styles.librarySongCardActive,
                                        pressed && styles.songChipPressed,
                                    ]}
                                    onPress={() => {
                                        closeSongActions();
                                        void selectSong(song);
                                    }}
                                    onLongPress={() => openSongActions(song)}
                                >
                                    <View style={styles.librarySongTopRow}>
                                        <View style={styles.librarySongText}>
                                            <Text style={styles.librarySongTitle}>{song.title}</Text>
                                            <Text style={styles.librarySongArtist}>{song.artist}</Text>
                                        </View>
                                        {song.isFavorite && <Text style={styles.librarySongFavoriteMark}>Fav</Text>}
                                    </View>
                                    <View style={styles.librarySongMetaRow}>
                                        <Text style={styles.librarySongMeta}>{formatBpm(song.bpm)}</Text>
                                        {song.tuning?.name && <Text style={styles.librarySongMeta}>{song.tuning.name}</Text>}
                                    </View>
                                    <View style={styles.contentBadgeRow}>
                                        {getSongLibraryBadges(song).slice(0, 3).map((badge) => (
                                            <View key={`${song.id}-${badge}`} style={styles.contentBadge}>
                                                <Text style={styles.contentBadgeText}>{badge}</Text>
                                            </View>
                                        ))}
                                    </View>
                                    <View style={styles.librarySongFooter}>
                                        <Text style={styles.librarySongFooterText}>{selectedSong.id === song.id ? 'Selected' : 'Tap to practice'}</Text>
                                        <View style={styles.librarySongFooterActions}>
                                            <View style={styles.songStatusPill}>
                                                <Text style={styles.songStatusText}>{getSongStatusLabel(card.status)}</Text>
                                            </View>
                                            <Pressable
                                                style={({ pressed }) => [styles.librarySongMoreButton, pressed && styles.songChipPressed]}
                                                onPress={(event) => {
                                                    event.stopPropagation();
                                                    openSongActions(song);
                                                }}
                                            >
                                                <Text style={styles.librarySongMoreText}>More</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                    )}
                </View>

                {songsSection === 'upload' && isImporting ? (
                    <LinearGradient
                        colors={['rgba(116, 0, 184, 0.44)', 'rgba(94, 96, 206, 0.28)', 'rgba(128, 255, 219, 0.16)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.importProgressCard}
                    >
                        <View style={styles.importProgressHeader}>
                            <Text style={styles.importProgressEyebrow}>AI Import</Text>
                            <Text style={styles.importProgressPercent}>{Math.round(importProgressValue * 100)}%</Text>
                        </View>
                        <Text style={styles.importProgressTitle}>AI is transcribing your song...</Text>
                        <Text style={styles.importProgressBody}>{importProgressText}</Text>
                        <View style={styles.importProgressTrack}>
                            <LinearGradient
                                colors={['#7400b8', '#5e60ce', '#64dfdf', '#80ffdb']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[
                                    styles.importProgressFill,
                                    { width: `${Math.max(importProgressValue * 100, 8)}%` },
                                ]}
                            />
                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    styles.importProgressShimmer,
                                    { transform: [{ translateX: importShimmerTranslateX }, { skewX: '-16deg' }] },
                                ]}
                            />
                        </View>
                    </LinearGradient>
                ) : null}

                {songsSection === 'library' && (
                <PracticeFlowShell
                    headerContent={(
                        <>
                            <View style={styles.songMetaRow}>
                                <View style={styles.songMetaMain}>
                                    <Text style={styles.songTitle}>{selectedSong.title}</Text>
                                    <Text style={styles.songArtist}>{selectedSong.artist}</Text>
                                </View>
                                <View style={styles.difficultyPill}>
                                    <Text style={styles.difficultyText}>{selectedSong.difficulty}</Text>
                                </View>
                            </View>

                            <View style={styles.hudRibbon}>
                                <View style={styles.hudPill}>
                                    <Text style={styles.hudLabel}>TIME</Text>
                                    <Text style={styles.hudValue}>{playbackSec.toFixed(1)}s / {selectedSong.durationSec.toFixed(1)}s</Text>
                                </View>
                                <View style={styles.hudPill}>
                                    <Text style={styles.hudLabel}>NEXT</Text>
                                    <Text style={styles.hudValue}>{displayMode === 'tabs' ? nextTabLabel : nextChord}</Text>
                                </View>
                                <View style={styles.hudPill}>
                                    <Text style={styles.hudLabel}>{activePanel === 'tabs' ? 'HITS' : displayMode === 'chords' ? 'COMBO' : 'NOTES'}</Text>
                                    <Text style={styles.hudValue}>{activePanel === 'tabs' ? tabHitNonce : displayMode === 'chords' ? combo : selectedSong.tabNotes.length}</Text>
                                </View>
                            </View>

                            <View style={styles.seekHeaderRow}>
                                <Text style={styles.seekHeaderText}>Tap the bar or jump with the seek buttons.</Text>
                                <Text style={styles.seekHeaderText}>{Math.round(progress * 100)}%</Text>
                            </View>
                            <Pressable
                                style={({ pressed }) => [styles.seekTrack, pressed && styles.seekTrackPressed]}
                                onPress={(event) => void seekToTime((event.nativeEvent.locationX / LANE_WIDTH) * selectedSong.durationSec)}
                            >
                                <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
                                <View style={[styles.seekThumb, { left: Math.max(0, Math.min(LANE_WIDTH - 16, (progress * LANE_WIDTH) - 8)) }]} />
                            </Pressable>

                            <View style={styles.segmentedRow}>
                                {(['chords', 'tabs', 'guide'] as SongPanel[]).map((panel) => {
                                    const isActive = activePanel === panel;
                                    return (
                                        <Pressable
                                            key={panel}
                                            style={({ pressed }) => [
                                                styles.segmentButton,
                                                isActive && styles.segmentButtonActive,
                                                pressed && styles.segmentButtonPressed,
                                            ]}
                                            onPress={() => setActivePanel(panel)}
                                        >
                                            <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                                                {panel.charAt(0).toUpperCase() + panel.slice(1)}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    )}
                    laneContent={(
                        <View style={styles.laneWrap}>
                            <Canvas style={{ width: LANE_WIDTH, height: LANE_HEIGHT }}>
                            <Rect x={0} y={0} width={LANE_WIDTH} height={LANE_HEIGHT} color={SONG_COLORS.panelRaised} />
                            <Rect x={0} y={0} width={LANE_WIDTH} height={LANE_HEIGHT} color={withOpacity(SONG_COLORS.railSoft, 0.32)} />
                            <Rect x={0} y={0} width={LANE_WIDTH} height={LANE_HEIGHT} color={withOpacity(SONG_COLORS.backgroundA, 0.16)} />
                            <Path path={waveBackPath} color={withOpacity(SONG_COLORS.secondary, 0.12)} />
                            <Path path={waveFrontPath} color={withOpacity(SONG_COLORS.primary, 0.18)} />

                            {[0, 1, 2].map((shimmerIndex) => {
                                const shimmerX = (((animationNow / 18) + (shimmerIndex * 180)) % (LANE_WIDTH + 160)) - 80;
                                return (
                                    <Rect
                                        key={`shimmer-${shimmerIndex}`}
                                        x={shimmerX}
                                        y={0}
                                        width={20}
                                        height={LANE_HEIGHT}
                                        color={withOpacity(SONG_COLORS.highlight, 0.04)}
                                    />
                                );
                            })}

                            {displayMode === 'tabs'
                                ? stringLabels.map((_label, stringIndex) => {
                                    const y = getStringY(stringIndex);
                                    const isEdgeString = stringIndex === 0 || stringIndex === stringLabels.length - 1;
                                    return (
                                        <Line
                                            key={`string-${stringIndex}`}
                                            p1={{ x: 14, y }}
                                            p2={{ x: LANE_WIDTH - 16, y }}
                                            color={withOpacity(SONG_COLORS.textDim, isEdgeString ? 0.42 : 0.28)}
                                            strokeWidth={isEdgeString ? 2 : 1.4}
                                        />
                                    );
                                })
                                : [0, 1, 2, 3].map((laneRow) => {
                                    const y = getChordLaneY(laneRow);
                                    return (
                                        <Line
                                            key={`chord-lane-${laneRow}`}
                                            p1={{ x: 18, y }}
                                            p2={{ x: LANE_WIDTH - 16, y }}
                                            color={withOpacity(SONG_COLORS.textDim, 0.18)}
                                            strokeWidth={1.5}
                                        />
                                    );
                                })}

                            {displayMode === 'chords' && visibleChordEvents.map((event) => {
                                const x = PLAYHEAD_X + ((event.timeSec - playbackSec) * PIXELS_PER_SECOND);
                                const y = getChordLaneY(event.laneRow) + (Math.sin((animationNow / 210) + (event.index * 0.7)) * 4);
                                const baseColor = getChordColor(event.chord);
                                const wasHit = judgedEventIndexesRef.current.has(event.index);
                                const wasMissed = missedEventIndexesRef.current.has(event.index);
                                const bodyColor = wasHit
                                    ? withOpacity(SONG_COLORS.primary, 0.2)
                                    : wasMissed
                                        ? withOpacity(SONG_COLORS.miss, 0.28)
                                        : baseColor;

                                return (
                                    <React.Fragment key={`chord-shape-${selectedSong.id}-${event.index}`}>
                                        <Rect
                                            x={x - 34}
                                            y={y - 18}
                                            width={68}
                                            height={36}
                                            color={withOpacity(baseColor, wasHit ? 0.12 : 0.22)}
                                        />
                                        <Rect
                                            x={x - 29}
                                            y={y - 14}
                                            width={58}
                                            height={28}
                                            color={bodyColor}
                                        />
                                    </React.Fragment>
                                );
                            })}

                            {displayMode === 'tabs' && visibleTabNotes.map((note) => {
                                const x = PLAYHEAD_X + ((note.timeSec - playbackSec) * PIXELS_PER_SECOND);
                                const displayStringIndex = getDisplayStringIndex(selectedSong, note.stringIndex);
                                const y = getStringY(displayStringIndex) + (Math.sin((animationNow / 250) + (note.index * 0.8)) * 2.5);
                                const tailWidth = Math.max(18, (note.durationSec ?? 0.18) * PIXELS_PER_SECOND);
                                const wasHit = hitTabIndexesRef.current.has(note.index);
                                const hitStamp = tabHitMomentsRef.current.get(note.index) ?? null;
                                const hitProgress = hitStamp ? Math.min(1, (animationNow - hitStamp) / 560) : 1;
                                const showHitSpark = hitProgress < 1;
                                const noteColor = wasHit
                                    ? SONG_COLORS.highlight
                                    : note.fret >= 5 ? SONG_COLORS.highlight : SONG_COLORS.primary;

                                return (
                                    <React.Fragment key={`tab-shape-${selectedSong.id}-${note.index}`}>
                                        {showHitSpark && (
                                            <>
                                                <Circle
                                                    cx={x}
                                                    cy={y}
                                                    r={16 + (hitProgress * 18)}
                                                    color={withOpacity(SONG_COLORS.highlight, Math.max(0, 0.22 - (hitProgress * 0.18)))}
                                                />
                                                <Circle
                                                    cx={x}
                                                    cy={y}
                                                    r={8 + (hitProgress * 10)}
                                                    color={withOpacity('#D8FFF7', Math.max(0, 0.34 - (hitProgress * 0.28)))}
                                                />
                                            </>
                                        )}
                                        <Rect
                                            x={x}
                                            y={y - 2}
                                            width={tailWidth}
                                            height={4}
                                            color={withOpacity(noteColor, wasHit ? 0.6 : 0.42)}
                                        />
                                        <Rect
                                            x={x - 13}
                                            y={y - 13}
                                            width={26}
                                            height={26}
                                            color={withOpacity(wasHit ? '#CFFFF0' : SONG_COLORS.panel, 0.95)}
                                        />
                                        <Rect
                                            x={x - 11}
                                            y={y - 11}
                                            width={22}
                                            height={22}
                                            color={noteColor}
                                        />
                                    </React.Fragment>
                                );
                            })}

                            <Rect x={PLAYHEAD_X - 10} y={0} width={20} height={LANE_HEIGHT} color={withOpacity(SONG_COLORS.highlight, 0.08)} />
                            <Rect x={PLAYHEAD_X - 2} y={14} width={4} height={LANE_HEIGHT - 28} color={SONG_COLORS.highlight} />
                            <Circle cx={PLAYHEAD_X} cy={30} r={9} color={SONG_COLORS.highlight} />
                            <Circle cx={PLAYHEAD_X} cy={30} r={18} color={withOpacity(SONG_COLORS.highlight, 0.14)} />

                            {rippleProgress < 1 && flashResult && (
                                <>
                                    <Circle
                                        cx={PLAYHEAD_X}
                                        cy={LANE_HEIGHT / 2}
                                        r={18 + (rippleProgress * 58)}
                                        color={withOpacity(flashResult.color, Math.max(0, 0.22 - (rippleProgress * 0.2)))}
                                    />
                                    <Circle
                                        cx={PLAYHEAD_X}
                                        cy={LANE_HEIGHT / 2}
                                        r={8 + (rippleProgress * 34)}
                                        color={withOpacity(flashResult.color, Math.max(0, 0.32 - (rippleProgress * 0.28)))}
                                    />
                                </>
                            )}
                            </Canvas>

                            <View pointerEvents="none" style={styles.labelOverlay}>
                            {displayMode === 'chords' && visibleChordEvents.map((event) => {
                                const x = PLAYHEAD_X + ((event.timeSec - playbackSec) * PIXELS_PER_SECOND);
                                const y = getChordLaneY(event.laneRow) + (Math.sin((animationNow / 210) + (event.index * 0.7)) * 4);
                                const wasHit = judgedEventIndexesRef.current.has(event.index);
                                const wasMissed = missedEventIndexesRef.current.has(event.index);

                                return (
                                    <Text
                                        key={`chord-label-${selectedSong.id}-${event.index}`}
                                        style={[
                                            styles.chordLabel,
                                            {
                                                left: x - 16,
                                                top: y - 11,
                                                color: wasMissed ? SONG_COLORS.text : SONG_COLORS.backgroundA,
                                            },
                                            wasHit && styles.chordLabelHit,
                                        ]}
                                    >
                                        {event.chord}
                                    </Text>
                                );
                            })}

                            {displayMode === 'tabs' && visibleTabNotes.map((note) => {
                                const x = PLAYHEAD_X + ((note.timeSec - playbackSec) * PIXELS_PER_SECOND);
                                const displayStringIndex = getDisplayStringIndex(selectedSong, note.stringIndex);
                                const y = getStringY(displayStringIndex) + (Math.sin((animationNow / 250) + (note.index * 0.8)) * 2.5);
                                const wasHit = hitTabIndexesRef.current.has(note.index);

                                return (
                                    <Text
                                        key={`tab-label-${selectedSong.id}-${note.index}`}
                                        style={[
                                            styles.tabLabel,
                                            {
                                                left: x - 7,
                                                top: y - 9,
                                                color: wasHit ? SONG_COLORS.backgroundA : SONG_COLORS.backgroundA,
                                            },
                                            wasHit && styles.chordLabelHit,
                                        ]}
                                    >
                                        {note.fret}
                                    </Text>
                                );
                            })}

                            {displayMode === 'tabs' && (
                                <View style={styles.stringLegendWrap}>
                                    {stringLabels.map((label, index) => (
                                        <Text
                                            key={`legend-${label}-${index}`}
                                            style={[styles.stringLegend, { top: getStringY(index) - 8 }]}
                                        >
                                            {label}
                                        </Text>
                                    ))}
                                </View>
                            )}

                            {activePanel === 'guide' && (
                                <View style={styles.guideOverlayCard}>
                                    <Text style={styles.guideOverlayTitle}>Read the line, then play into it</Text>
                                    <Text style={styles.guideOverlayText}>Chords mode scores accepted chord tones live.</Text>
                                    <Text style={styles.guideOverlayText}>Tabs mode now lights up note hits when live pitch matches the target.</Text>
                                </View>
                            )}

                            {flashResult && activePanel !== 'guide' && (
                                <View style={styles.flashBadge}>
                                    <Text style={[styles.flashText, { color: flashResult.color }]}>{flashResult.label}</Text>
                                </View>
                            )}
                            </View>
                        </View>
                    )}
                    bottomContent={(
                        <>
                            <View style={styles.transportRow}>
                                <Pressable
                                    style={({ pressed }) => [
                                        styles.transportButton,
                                        styles.transportPrimary,
                                        pressed && styles.transportButtonPressed,
                                    ]}
                                    onPress={() => void togglePlayback()}
                                >
                                    <Text style={styles.transportPrimaryText}>{isPlaying ? 'Pause' : 'Play'}</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.transportButton, pressed && styles.transportButtonPressed]}
                                    onPress={() => void restartSong()}
                                >
                                    <Text style={styles.transportText}>Restart</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.transportButton, pressed && styles.transportButtonPressed]}
                                    onPress={() => void seekBy(-seekStepSeconds)}
                                >
                                    <Text style={styles.transportText}>-{seekStepSeconds}s</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.transportButton, pressed && styles.transportButtonPressed]}
                                    onPress={() => void seekBy(seekStepSeconds)}
                                >
                                    <Text style={styles.transportText}>+{seekStepSeconds}s</Text>
                                </Pressable>
                                <Pressable
                                    style={({ pressed }) => [styles.transportButton, pressed && styles.transportButtonPressed]}
                                    onPress={() => void finishSession(selectedSong)}
                                >
                                    <Text style={styles.transportText}>Finish</Text>
                                </Pressable>
                            </View>

                            <View style={styles.statusPanel}>
                                <View style={styles.statusHeadRow}>
                                    <View style={styles.enginePill}>
                                        <Text style={styles.enginePillText}>{engineLabel}</Text>
                                    </View>
                                    {activePanel === 'chords' && (
                                        <Text style={styles.statusMiniText}>{detectedHz ? `${detectedHz.toFixed(1)} Hz` : 'Waiting for a clean read'}</Text>
                                    )}
                                    {activePanel === 'tabs' && (
                                        <Text style={styles.statusMiniText}>
                                            {tabTargetAtLine ? `Target ${tabTargetAtLine.target.noteName}` : 'Waiting for the next live tab target'}
                                        </Text>
                                    )}
                                </View>

                                <Text style={styles.statusTitle}>{engineText}</Text>
                                {showFallbackTuningWarning && (
                                    <Text style={styles.statusWarningText}>{FALLBACK_STANDARD_TUNING_WARNING}</Text>
                                )}

                                {showMicFallbackAction && (
                                    <Pressable
                                        onPress={() => void handleMicFallbackAction()}
                                        style={({ pressed }) => [
                                            styles.micFallbackButton,
                                            pressed && styles.micFallbackButtonPressed,
                                        ]}
                                    >
                                        <Text style={styles.micFallbackButtonText}>{micFallbackActionLabel}</Text>
                                    </Pressable>
                                )}

                                <View style={styles.statusMetricsRow}>
                                    <View style={styles.statusMetricBox}>
                                        <Text style={styles.statusMetricLabel}>{activePanel === 'tabs' ? 'NEXT TAB' : 'NEXT CHORD'}</Text>
                                        <Text style={styles.statusMetricValue}>{displayMode === 'tabs' ? nextTabLabel : nextChord}</Text>
                                    </View>
                                    <View style={styles.statusMetricBox}>
                                        <Text style={styles.statusMetricLabel}>{activePanel === 'tabs' ? 'LIVE' : activePanel === 'chords' ? 'HEARD' : 'MODE'}</Text>
                                        <Text style={styles.statusMetricValue}>{activePanel === 'guide' ? 'Preview' : detectedNote}</Text>
                                    </View>
                                    <View style={styles.statusMetricBox}>
                                        <Text style={styles.statusMetricLabel}>{activePanel === 'tabs' ? 'HITS' : activePanel === 'chords' ? 'BEST' : 'TRACK'}</Text>
                                        <Text style={styles.statusMetricValue}>{activePanel === 'tabs' ? `${tabHitNonce}` : activePanel === 'chords' ? `${bestCombo}` : `${selectedSong.durationSec}s`}</Text>
                                    </View>
                                </View>

                                {activePanel === 'chords' && score && (
                                    <View style={styles.scoreStrip}>
                                        <Text style={styles.scoreStripText}>{score.accuracy}%</Text>
                                        <Text style={styles.scoreStripMeta}>Perfect {score.perfect} • Good {score.good} • Missed {score.missed}</Text>
                                    </View>
                                )}

                                {activePanel === 'tabs' && (
                                    <View style={styles.scoreStrip}>
                                        <Text style={styles.scoreStripText}>{tabHitNonce}/{selectedSong.tabNotes.length}</Text>
                                        <Text style={styles.scoreStripMeta}>Live tab hits • Best combo {bestCombo}</Text>
                                    </View>
                                )}

                                {activePanel === 'guide' && (
                                    <View style={styles.guideList}>
                                        <Text style={styles.guideLine}>1. Chords = live mic scoring and combo tracking.</Text>
                                        <Text style={styles.guideLine}>2. Tabs = six-string timing view with live pitch matching at the hit-line.</Text>
                                        <Text style={styles.guideLine}>3. Hit when the live note matches the target as it crosses the mint line on the left.</Text>
                                        <Text style={styles.guideLine}>4. Import uses one audio file. AI builds BPM, chordEvents, and a playable tab pattern automatically.</Text>
                                    </View>
                                )}
                            </View>
                        </>
                    )}
                />
                )}
                </>
                )}
            </ScrollView>
            </PageTransitionView>
            <PremiumCelebrationOverlay {...celebration} />
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    container: {
        paddingTop: 54,
        paddingHorizontal: SCREEN_PADDING,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    headerTextWrap: {
        flex: 1,
    },
    backGlowMint: {
        position: 'absolute',
        top: 120,
        left: -50,
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.12),
    },
    backGlowAmber: {
        position: 'absolute',
        top: 28,
        right: -44,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.08),
    },
    header: {
        color: SONG_COLORS.text,
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: 0.4,
    },
    subHeader: {
        color: SONG_COLORS.textDim,
        marginTop: 3,
        marginBottom: 12,
        fontSize: 12,
        fontWeight: '600',
        lineHeight: 18,
    },
    streakBanner: {
        marginBottom: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.08),
        paddingHorizontal: 14,
        paddingVertical: 12,
        ...SHADOWS.soft,
    },
    streakBannerTitle: {
        color: SONG_COLORS.primary,
        fontSize: 12,
        fontWeight: '900',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    streakBannerText: {
        color: SONG_COLORS.text,
        fontSize: 13,
        lineHeight: 19,
    },
    libraryPanel: {
        borderRadius: 26,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.94),
        padding: 14,
        marginBottom: 14,
        ...SHADOWS.card,
    },
    libraryHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },
    libraryHeaderText: {
        flex: 1,
    },
    libraryTitle: {
        color: SONG_COLORS.text,
        fontSize: 21,
        fontWeight: '900',
    },
    librarySubtitle: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 4,
        fontWeight: '600',
    },
    libraryCountPill: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.28),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.1),
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    libraryCountText: {
        color: SONG_COLORS.highlight,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    songsSectionSwitchRow: {
        flexDirection: 'row',
        gap: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.68),
        padding: 4,
        marginBottom: 12,
    },
    songsSectionSwitchButton: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
    },
    songsSectionSwitchButtonActive: {
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.14),
    },
    songsSectionSwitchText: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    songsSectionSwitchTextActive: {
        color: SONG_COLORS.text,
    },
    uploadIntroBlock: {
        marginBottom: 12,
    },
    uploadIntroTitle: {
        color: SONG_COLORS.text,
        fontSize: 18,
        fontWeight: '900',
    },
    uploadIntroText: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 4,
        fontWeight: '700',
    },
    libraryActionRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    libraryActionButton: {
        flex: 1,
        minHeight: 64,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.9),
        paddingHorizontal: 10,
        paddingVertical: 10,
        justifyContent: 'center',
        ...SHADOWS.soft,
    },
    libraryActionPrimary: {
        borderColor: withOpacity(SONG_COLORS.highlight, 0.36),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.13),
    },
    libraryActionDisabled: {
        opacity: 0.58,
    },
    libraryActionText: {
        color: SONG_COLORS.text,
        fontSize: 12,
        fontWeight: '900',
    },
    libraryActionPrimaryText: {
        color: SONG_COLORS.secondary,
        fontSize: 12,
        fontWeight: '900',
    },
    libraryActionMeta: {
        color: SONG_COLORS.textDim,
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
    },
    tuningPanel: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.72),
        padding: 12,
        marginBottom: 12,
    },
    tuningHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 10,
    },
    tuningHeaderText: {
        flex: 1,
    },
    tuningTitle: {
        color: SONG_COLORS.text,
        fontSize: 15,
        fontWeight: '900',
    },
    tuningSubtitle: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        lineHeight: 16,
        marginTop: 4,
        fontWeight: '600',
    },
    aiDraftPill: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.3),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.1),
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    aiDraftPillText: {
        color: SONG_COLORS.highlight,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    instrumentSwitchRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10,
    },
    instrumentSwitchButton: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.7),
        paddingVertical: 10,
        alignItems: 'center',
    },
    instrumentSwitchButtonActive: {
        borderColor: SONG_COLORS.highlight,
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.13),
    },
    instrumentSwitchText: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        fontWeight: '900',
    },
    instrumentSwitchTextActive: {
        color: SONG_COLORS.text,
    },
    tuningChipRow: {
        gap: 8,
        paddingBottom: 2,
    },
    tuningChip: {
        minWidth: 132,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.74),
        paddingHorizontal: 11,
        paddingVertical: 10,
    },
    tuningChipActive: {
        borderColor: SONG_COLORS.highlight,
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.12),
    },
    tuningChipTitle: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        fontWeight: '900',
    },
    tuningChipTitleActive: {
        color: SONG_COLORS.text,
    },
    tuningChipMeta: {
        color: SONG_COLORS.textMute,
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
    },
    selectedUploadCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.secondary, 0.26),
        backgroundColor: withOpacity(SONG_COLORS.secondary, 0.08),
        padding: 10,
        marginTop: 10,
    },
    selectedUploadText: {
        flex: 1,
    },
    selectedUploadTitle: {
        color: SONG_COLORS.text,
        fontSize: 12,
        fontWeight: '900',
    },
    selectedUploadMeta: {
        color: SONG_COLORS.textDim,
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4,
    },
    startAnalysisButton: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.13),
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    startAnalysisButtonText: {
        color: SONG_COLORS.secondary,
        fontSize: 11,
        fontWeight: '900',
    },
    librarySearchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    librarySearchInput: {
        flex: 1,
        minHeight: 46,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.82),
        color: SONG_COLORS.text,
        paddingHorizontal: 12,
        fontSize: 13,
        fontWeight: '700',
    },
    librarySearchClearButton: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.secondary, 0.32),
        backgroundColor: withOpacity(SONG_COLORS.secondary, 0.1),
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    librarySearchClearText: {
        color: SONG_COLORS.secondary,
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    libraryToolsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    libraryCountSubtle: {
        color: SONG_COLORS.textMute,
        fontSize: 11,
        fontWeight: '800',
    },
    filterChipRow: {
        gap: 8,
        paddingBottom: 12,
    },
    filterChip: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.72),
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    filterChipActive: {
        borderColor: SONG_COLORS.highlight,
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.14),
    },
    filterChipText: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        fontWeight: '900',
    },
    filterChipTextActive: {
        color: SONG_COLORS.text,
    },
    sortChip: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.primary, 0.22),
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.62),
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    sortChipActive: {
        borderColor: SONG_COLORS.primary,
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.12),
    },
    sortChipText: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        fontWeight: '900',
    },
    sortChipTextActive: {
        color: SONG_COLORS.text,
    },
    reviewCard: {
        borderRadius: 22,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.96),
        padding: 14,
        marginBottom: 12,
        ...SHADOWS.card,
    },
    editSongCard: {
        borderRadius: 22,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.primary, 0.28),
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.96),
        padding: 14,
        marginBottom: 12,
        ...SHADOWS.card,
    },
    reviewHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
    },
    reviewHeaderText: {
        flex: 1,
    },
    reviewEyebrow: {
        color: SONG_COLORS.highlight,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 5,
    },
    reviewTitle: {
        color: SONG_COLORS.text,
        fontSize: 19,
        fontWeight: '900',
    },
    reviewMeta: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        fontWeight: '700',
        marginTop: 4,
    },
    reviewBadge: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.primary, 0.3),
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.12),
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    reviewBadgeText: {
        color: SONG_COLORS.primary,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    reviewMetricsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    reviewMetricBox: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.74),
        padding: 10,
    },
    reviewMetricValue: {
        color: SONG_COLORS.text,
        fontSize: 18,
        fontWeight: '900',
    },
    reviewMetricLabel: {
        color: SONG_COLORS.textMute,
        fontSize: 10,
        fontWeight: '800',
        marginTop: 3,
        textTransform: 'uppercase',
    },
    reviewPreviewText: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 11,
        fontWeight: '700',
    },
    reviewWarningBox: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.24),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.08),
        padding: 10,
        marginTop: 10,
        gap: 4,
    },
    reviewWarningText: {
        color: SONG_COLORS.text,
        fontSize: 11,
        lineHeight: 16,
        fontWeight: '700',
    },
    reviewFileText: {
        color: SONG_COLORS.textMute,
        fontSize: 10,
        fontWeight: '700',
        marginTop: 10,
    },
    editFieldGroup: {
        gap: 7,
        marginTop: 12,
    },
    editFieldLabel: {
        color: SONG_COLORS.textDim,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    editTextInput: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.86),
        color: SONG_COLORS.text,
        paddingHorizontal: 12,
        paddingVertical: 11,
        fontSize: 13,
        fontWeight: '800',
    },
    editErrorText: {
        color: '#FFB4C2',
        fontSize: 11,
        fontWeight: '800',
        marginTop: 10,
    },
    reviewActionRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    reviewButton: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.88),
        paddingVertical: 11,
        alignItems: 'center',
    },
    reviewButtonPrimary: {
        borderColor: withOpacity(SONG_COLORS.highlight, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.13),
    },
    reviewButtonDanger: {
        borderColor: withOpacity(SONG_COLORS.miss, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.miss, 0.1),
    },
    reviewButtonText: {
        color: SONG_COLORS.text,
        fontSize: 12,
        fontWeight: '900',
    },
    reviewButtonPrimaryText: {
        color: SONG_COLORS.secondary,
        fontSize: 12,
        fontWeight: '900',
    },
    reviewButtonDangerText: {
        color: '#FFB4C2',
        fontSize: 12,
        fontWeight: '900',
    },
    libraryErrorCard: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.miss, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.miss, 0.1),
        padding: 12,
        marginBottom: 12,
    },
    libraryErrorTitle: {
        color: '#FFB4C2',
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 5,
    },
    libraryErrorText: {
        color: SONG_COLORS.text,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '700',
    },
    songActionSheet: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.28),
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.96),
        padding: 12,
        marginBottom: 12,
        ...SHADOWS.soft,
    },
    songActionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 10,
    },
    songActionHeaderText: {
        flex: 1,
    },
    songActionTitle: {
        color: SONG_COLORS.text,
        fontSize: 16,
        fontWeight: '900',
    },
    songActionSubtitle: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        fontWeight: '700',
        marginTop: 3,
    },
    songActionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    songActionButton: {
        minWidth: 96,
        flexGrow: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.82),
        paddingVertical: 10,
        alignItems: 'center',
    },
    songActionButtonPrimary: {
        borderColor: withOpacity(SONG_COLORS.highlight, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.13),
    },
    songActionButtonDanger: {
        borderColor: withOpacity(SONG_COLORS.miss, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.miss, 0.1),
    },
    songActionButtonText: {
        color: SONG_COLORS.text,
        fontSize: 11,
        fontWeight: '900',
    },
    songActionButtonPrimaryText: {
        color: SONG_COLORS.secondary,
        fontSize: 11,
        fontWeight: '900',
    },
    songActionButtonDangerText: {
        color: '#FFB4C2',
        fontSize: 11,
        fontWeight: '900',
    },
    libraryRetryButton: {
        alignSelf: 'flex-start',
        marginTop: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.1),
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    libraryRetryText: {
        color: SONG_COLORS.highlight,
        fontSize: 11,
        fontWeight: '900',
    },
    songGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: LIBRARY_CARD_GAP,
    },
    libraryEmptyState: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.74),
        padding: 14,
        width: '100%',
    },
    uploadEmptyState: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.primary, 0.24),
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.08),
        padding: 14,
        marginTop: 2,
    },
    libraryEmptyTitle: {
        color: SONG_COLORS.text,
        fontSize: 17,
        fontWeight: '900',
        marginBottom: 5,
    },
    libraryEmptyText: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '600',
    },
    libraryEmptyButton: {
        alignSelf: 'flex-start',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.1),
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 12,
    },
    libraryEmptyButtonText: {
        color: SONG_COLORS.highlight,
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    librarySongCard: {
        width: LIBRARY_CARD_WIDTH,
        minHeight: 176,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.88),
        padding: 13,
        ...SHADOWS.soft,
    },
    librarySongCardActive: {
        borderColor: SONG_COLORS.highlight,
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.1),
    },
    librarySongTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
    },
    librarySongText: {
        flex: 1,
    },
    librarySongTitle: {
        color: SONG_COLORS.text,
        fontSize: 14,
        fontWeight: '900',
    },
    librarySongArtist: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        fontWeight: '700',
        marginTop: 3,
    },
    librarySongFavoriteMark: {
        color: SONG_COLORS.highlight,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    songStatusPill: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.primary, 0.25),
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.1),
        paddingHorizontal: 9,
        paddingVertical: 5,
    },
    songStatusText: {
        color: SONG_COLORS.primary,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    librarySongMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 7,
        marginTop: 10,
    },
    librarySongMeta: {
        color: SONG_COLORS.textMute,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    contentBadgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 10,
    },
    contentBadge: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.secondary, 0.25),
        backgroundColor: withOpacity(SONG_COLORS.secondary, 0.08),
        paddingHorizontal: 9,
        paddingVertical: 5,
    },
    contentBadgeText: {
        color: SONG_COLORS.secondary,
        fontSize: 10,
        fontWeight: '900',
    },
    librarySongFooter: {
        gap: 8,
        marginTop: 12,
    },
    librarySongFooterText: {
        color: SONG_COLORS.textMute,
        fontSize: 10,
        fontWeight: '800',
    },
    librarySongFooterActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    librarySongMoreButton: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.primary, 0.28),
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.08),
        paddingHorizontal: 9,
        paddingVertical: 6,
    },
    librarySongMoreText: {
        color: SONG_COLORS.primary,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    librarySongFavoriteButton: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.28),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.08),
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    librarySongFavoriteButtonActive: {
        borderColor: SONG_COLORS.highlight,
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.16),
    },
    librarySongFavoriteText: {
        color: SONG_COLORS.textDim,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    librarySongFavoriteTextActive: {
        color: SONG_COLORS.highlight,
    },
    librarySongEditButton: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.primary, 0.3),
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.1),
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    librarySongEditText: {
        color: SONG_COLORS.primary,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    librarySongDeleteButton: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity('#ff6b7a', 0.34),
        backgroundColor: withOpacity('#ff6b7a', 0.1),
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    librarySongDeleteText: {
        color: '#ff9aa5',
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    librarySongActionText: {
        color: SONG_COLORS.highlight,
        fontSize: 11,
        fontWeight: '900',
    },
    songPickerRow: {
        gap: 10,
        paddingBottom: 12,
    },
    songChip: {
        minWidth: 156,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.95),
        paddingHorizontal: 13,
        paddingVertical: 13,
        ...SHADOWS.soft,
    },
    songChipPressed: {
        transform: [{ scale: 0.985 }],
    },
    songChipActive: {
        borderColor: SONG_COLORS.highlight,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.98),
        shadowColor: SONG_COLORS.highlight,
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
    },
    importChip: {
        borderColor: withOpacity(SONG_COLORS.secondary, 0.3),
        backgroundColor: withOpacity(SONG_COLORS.secondary, 0.08),
    },
    importProgressCard: {
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 15,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.34),
        marginBottom: 14,
        overflow: 'hidden',
        ...SHADOWS.card,
    },
    importProgressHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    importProgressEyebrow: {
        color: SONG_COLORS.highlight,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
    },
    importProgressPercent: {
        color: SONG_COLORS.text,
        fontSize: 12,
        fontWeight: '800',
    },
    importProgressTitle: {
        color: SONG_COLORS.text,
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 6,
    },
    importProgressBody: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 12,
    },
    importProgressTrack: {
        height: 12,
        borderRadius: 999,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.22),
        backgroundColor: withOpacity(SONG_COLORS.railSoft, 0.92),
    },
    importProgressFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        borderRadius: 999,
    },
    importProgressShimmer: {
        position: 'absolute',
        top: -6,
        bottom: -6,
        width: 84,
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    songChipTitle: {
        color: SONG_COLORS.text,
        fontWeight: '800',
        fontSize: 14,
    },
    songChipMeta: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        marginTop: 3,
    },
    songChipDifficulty: {
        color: SONG_COLORS.highlight,
        fontSize: 10,
        marginTop: 7,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    importChipTitle: {
        color: SONG_COLORS.secondary,
        fontWeight: '900',
        fontSize: 14,
    },
    importChipMeta: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        marginTop: 4,
        lineHeight: 16,
    },
    importChipTag: {
        color: SONG_COLORS.text,
        fontSize: 10,
        marginTop: 7,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    playerShell: {
        borderRadius: 28,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.96),
        padding: 16,
        marginBottom: 16,
        overflow: 'hidden',
        ...SHADOWS.card,
    },
    songMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    songMetaMain: {
        flex: 1,
        paddingRight: 10,
    },
    songTitle: {
        color: SONG_COLORS.text,
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: 0.4,
    },
    songArtist: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        marginTop: 2,
        fontWeight: '600',
    },
    difficultyPill: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.primary, 0.25),
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.1),
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    difficultyText: {
        color: SONG_COLORS.primary,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    hudRibbon: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
        marginBottom: 12,
    },
    hudPill: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.94),
        paddingHorizontal: 10,
        paddingVertical: 9,
        ...SHADOWS.soft,
    },
    hudLabel: {
        color: SONG_COLORS.textMute,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    hudValue: {
        color: SONG_COLORS.text,
        fontSize: 13,
        fontWeight: '800',
        marginTop: 3,
    },
    segmentedRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    seekHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    seekHeaderText: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        fontWeight: '600',
    },
    seekTrack: {
        width: LANE_WIDTH,
        height: 14,
        borderRadius: 999,
        backgroundColor: withOpacity(SONG_COLORS.rail, 0.95),
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
    },
    seekTrackPressed: {
        transform: [{ scaleY: 0.95 }],
    },
    seekFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: withOpacity(SONG_COLORS.secondary, 0.4),
    },
    seekThumb: {
        position: 'absolute',
        top: -1,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: SONG_COLORS.primary,
        borderWidth: 2,
        borderColor: SONG_COLORS.panel,
    },
    segmentButton: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.72),
        paddingVertical: 11,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    segmentButtonActive: {
        borderColor: SONG_COLORS.highlight,
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.14),
    },
    segmentButtonPressed: {
        transform: [{ scale: 0.985 }],
    },
    segmentText: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        fontWeight: '800',
    },
    segmentTextActive: {
        color: SONG_COLORS.text,
    },
    laneWrap: {
        width: LANE_WIDTH,
        height: LANE_HEIGHT,
        overflow: 'hidden',
        backgroundColor: SONG_COLORS.panelRaised,
    },
    labelOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    chordLabel: {
        position: 'absolute',
        width: 32,
        textAlign: 'center',
        fontWeight: '900',
        fontSize: 12,
    },
    chordLabelHit: {
        color: SONG_COLORS.backgroundA,
    },
    tabLabel: {
        position: 'absolute',
        width: 16,
        textAlign: 'center',
        color: SONG_COLORS.backgroundA,
        fontWeight: '900',
        fontSize: 12,
        fontFamily: MONO_FONT,
    },
    stringLegendWrap: {
        ...StyleSheet.absoluteFillObject,
    },
    stringLegend: {
        position: 'absolute',
        left: 12,
        color: SONG_COLORS.textMute,
        fontSize: 11,
        fontWeight: '800',
        fontFamily: MONO_FONT,
    },
    guideOverlayCard: {
        position: 'absolute',
        left: 88,
        right: 22,
        top: 98,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.primary, 0.3),
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.9),
        padding: 16,
        ...SHADOWS.soft,
    },
    guideOverlayTitle: {
        color: SONG_COLORS.text,
        fontSize: 18,
        fontWeight: '900',
    },
    guideOverlayText: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        marginTop: 5,
        lineHeight: 18,
        fontWeight: '600',
    },
    flashBadge: {
        position: 'absolute',
        top: 14,
        right: 14,
        borderRadius: 999,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.88),
        paddingHorizontal: 10,
        paddingVertical: 6,
        ...SHADOWS.soft,
    },
    flashText: {
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1,
    },
    transportRow: {
        flexDirection: 'row',
        gap: 8,
    },
    transportButton: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.9),
        paddingVertical: 12,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    transportButtonPressed: {
        transform: [{ scale: 0.985 }],
    },
    transportPrimary: {
        borderColor: withOpacity(SONG_COLORS.highlight, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.12),
    },
    transportText: {
        color: SONG_COLORS.text,
        fontSize: 12,
        fontWeight: '800',
    },
    transportPrimaryText: {
        color: SONG_COLORS.secondary,
        fontSize: 12,
        fontWeight: '900',
    },
    statusPanel: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.94),
        padding: 12,
        ...SHADOWS.soft,
    },
    statusHeadRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    enginePill: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: withOpacity(SONG_COLORS.secondary, 0.12),
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.secondary, 0.3),
    },
    enginePillText: {
        color: SONG_COLORS.secondary,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    statusMiniText: {
        color: SONG_COLORS.textDim,
        fontSize: 11,
        fontWeight: '600',
        marginLeft: 10,
        flex: 1,
        textAlign: 'right',
    },
    statusTitle: {
        color: SONG_COLORS.text,
        fontSize: 15,
        fontWeight: '800',
        marginTop: 10,
        lineHeight: 22,
    },
    statusWarningText: {
        color: '#FFD166',
        fontSize: 11,
        fontWeight: '700',
        lineHeight: 16,
        marginTop: 6,
    },
    micFallbackButton: {
        alignSelf: 'flex-start',
        marginTop: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.12),
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    micFallbackButtonPressed: {
        transform: [{ scale: 0.98 }],
    },
    micFallbackButtonText: {
        color: SONG_COLORS.highlight,
        fontSize: 12,
        fontWeight: '900',
    },
    statusMetricsRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    statusMetricBox: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: withOpacity(SONG_COLORS.panel, 0.86),
        paddingHorizontal: 10,
        paddingVertical: 9,
        ...SHADOWS.soft,
    },
    statusMetricLabel: {
        color: SONG_COLORS.textMute,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    statusMetricValue: {
        color: SONG_COLORS.text,
        fontSize: 13,
        fontWeight: '800',
        marginTop: 4,
    },
    scoreStrip: {
        marginTop: 12,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 11,
        backgroundColor: withOpacity(SONG_COLORS.highlight, 0.11),
        borderWidth: 1,
        borderColor: withOpacity(SONG_COLORS.highlight, 0.24),
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    scoreStripText: {
        color: SONG_COLORS.highlight,
        fontSize: 28,
        fontWeight: '900',
    },
    scoreStripMeta: {
        color: SONG_COLORS.text,
        fontSize: 12,
        fontWeight: '700',
        marginTop: 2,
        textAlign: 'center',
    },
    guideList: {
        marginTop: 12,
        gap: 8,
    },
    guideLine: {
        color: SONG_COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '600',
    },
});
