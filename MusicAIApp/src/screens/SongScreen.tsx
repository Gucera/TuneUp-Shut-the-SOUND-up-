import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Dimensions,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
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
import ScreenSettingsButton from '../components/ScreenSettingsButton';
import SkeletonBlock from '../components/SkeletonBlock';
import { useCelebration } from '../hooks/useCelebration';
import {
    buildTabTarget,
    isPitchMatchForTarget,
    TUNER_A4_HZ,
    TUNER_NATIVE_MODULE_MESSAGE,
    useTuner,
} from '../hooks/useTuner';
import { GamificationSnapshot, getGamificationSnapshot, rewardPracticeActivity } from '../services/gamification';
import { importSongFromFiles, loadImportedSongs } from '../services/songLibrary';
import { COLORS, SHADOWS } from '../theme';

const { width } = Dimensions.get('window');
const SCREEN_PADDING = 14;
const SHELL_PADDING = 14;
const LANE_WIDTH = width - (SCREEN_PADDING * 2) - (SHELL_PADDING * 2);
const LANE_HEIGHT = 308;
const PLAYHEAD_X = 84;
const PIXELS_PER_SECOND = 112;
const PERFECT_WINDOW_SEC = 0.2;
const GOOD_WINDOW_SEC = 0.45;
const GOOD_WEIGHT = 0.65;
const TAB_HIT_WINDOW_SEC = 0.18;
const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace', android: 'monospace' });
const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

type SongPanel = 'chords' | 'tabs' | 'guide';

const SONG_COLORS = {
    backgroundA: COLORS.background,
    backgroundB: COLORS.backgroundAlt,
    panel: COLORS.panel,
    panelRaised: COLORS.panelAlt,
    rail: COLORS.panelInset,
    railSoft: COLORS.backgroundAlt,
    primary: COLORS.primary,
    secondary: COLORS.secondary,
    highlight: COLORS.accent,
    miss: COLORS.danger,
    text: COLORS.textStrong,
    textDim: COLORS.textDim,
    textMute: COLORS.text,
    border: COLORS.pixelLine,
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
    target: ReturnType<typeof buildTabTarget>;
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
        C: COLORS.primary,
        Dm: COLORS.secondary,
        Em: COLORS.success,
        F: COLORS.warning,
        G: COLORS.accent,
        Am: '#72efdd',
        Bm: '#80ffdb',
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

function toLiveTabTarget(note: SongLesson['tabNotes'][number], index: number): LiveTabTarget {
    return {
        ...note,
        index,
        target: buildTabTarget(note.stringIndex, note.fret, TUNER_A4_HZ),
    };
}

function getChordLaneY(row: number) {
    return 82 + (row * 52);
}

function getStringY(index: number) {
    return 62 + (index * 36);
}

export default function SongScreen() {
    const tabBarHeight = useBottomTabBarHeight();
    const [librarySongs, setLibrarySongs] = useState<SongLesson[]>([]);
    const [selectedSong, setSelectedSong] = useState<SongLesson>(SONG_LESSONS[0]);
    const [activePanel, setActivePanel] = useState<SongPanel>('chords');
    const [isPlaying, setIsPlaying] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [playbackSec, setPlaybackSec] = useState(0);
    const [perfectCount, setPerfectCount] = useState(0);
    const [goodCount, setGoodCount] = useState(0);
    const [missedCount, setMissedCount] = useState(0);
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
    const nextTabTarget = useMemo(() => {
        const nextNote = selectedSong.tabNotes
            .map((note, index) => toLiveTabTarget(note, index))
            .find((note) => (
                !hitTabIndexesRef.current.has(note.index)
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

            bestDistance = distance;
            bestTarget = toLiveTabTarget(note, index);
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
        }, [loadSessionPrefs]),
    );

    useEffect(() => {
        if (!isPlaying) {
            setMicStatus(getIdleSongStatus(activePanel));
        }
    }, [activePanel]);

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

            const target = buildTabTarget(note.stringIndex, note.fret, TUNER_A4_HZ);
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

        void syncLiveTuner(activePanel);
    }, [activePanel, isPlaying]);

    const displayMode: Exclude<SongPanel, 'guide'> = activePanel === 'guide' ? 'tabs' : activePanel;
    const progress = Math.min(1, playbackSec / selectedSong.durationSec);
    const seekStepSeconds = appSettings?.songsSeekStepSeconds ?? 10;
    const nextChord = useMemo(() => {
        const next = selectedSong.chordEvents.find((event, index) => (
            !judgedEventIndexesRef.current.has(index) &&
            !missedEventIndexesRef.current.has(index) &&
            event.timeSec >= playbackSec - 0.1
        ));
        return next?.chord ?? '--';
    }, [selectedSong, playbackSec]);
    const nextTabLabel = nextTabTarget
        ? `${nextTabTarget.fret}@${STRING_LABELS[nextTabTarget.stringIndex]}`
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

        const didStart = await startTuner();
        if (!didStart) {
            setMicStatus('Mic permission needed');
            return false;
        }

        return true;
    }

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
        } catch (error) {
            setMicStatus('Seek missed');
        }
    };

    const seekBy = async (deltaSec: number) => {
        await seekToTime(playbackSec + deltaSec);
    };

    const importSong = async () => {
        setIsImporting(true);

        try {
            const audioResult = await DocumentPicker.getDocumentAsync({
                type: 'audio/*',
                copyToCacheDirectory: true,
            });

            if (audioResult.canceled) {
                return;
            }

            const chartResult = await DocumentPicker.getDocumentAsync({
                type: ['application/json', 'text/json', 'public.json'],
                copyToCacheDirectory: true,
            });

            if (chartResult.canceled) {
                return;
            }

            const importedSong = await importSongFromFiles(audioResult.assets[0], chartResult.assets[0]);
            setLibrarySongs((prev) => [importedSong, ...prev.filter((song) => song.id !== importedSong.id)]);
            await selectSong(importedSong);
            showCelebration({
                title: 'Song imported',
                subtitle: `${importedSong.title} is ready in your library.`,
                variant: 'confetti',
            }, 2200);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not import that song package.';
            Alert.alert('Import failed', message);
        } finally {
            setIsImporting(false);
        }
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
        } catch (error) {
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
        } catch (error) {
            setMicStatus('Session could not start');
        }
    };

    const restartSong = async () => {
        try {
            await startFromTop();
        } catch (error) {
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
                        <Text style={styles.header}>Song Flow</Text>
                        <Text style={styles.subHeader}>Smooth chord and tab playback with a Songsterr-style player shell.</Text>
                    </View>
                    <ScreenSettingsButton />
                </View>

                <PremiumHeroStrip
                    icon="disc-outline"
                    eyebrow="Performance Mode"
                    title="A smoother song player with a more premium stage feel."
                    body="Chords, tabs, imports, and score tracking stay in the same place, but the entry experience now feels more intentional and more expensive."
                    metrics={[
                        { label: 'Songs', value: `${allSongs.length}` },
                        { label: 'View', value: activePanel === 'guide' ? 'Guide' : activePanel === 'tabs' ? 'Tabs' : 'Chords' },
                        { label: 'Playback', value: isPlaying ? 'Live' : 'Ready' },
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

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.songPickerRow}>
                    <TouchableOpacity
                        style={[styles.songChip, styles.importChip]}
                        onPress={() => void importSong()}
                        disabled={isImporting}
                    >
                        <Text style={styles.importChipTitle}>{isImporting ? 'Importing...' : 'Import Song'}</Text>
                        <Text style={styles.importChipMeta}>Pick audio + JSON tabs/chords</Text>
                        <Text style={styles.importChipTag}>YOUR LIBRARY</Text>
                    </TouchableOpacity>

                    {allSongs.map((song) => (
                        <TouchableOpacity
                            key={song.id}
                            style={[styles.songChip, selectedSong.id === song.id && styles.songChipActive]}
                            onPress={() => void selectSong(song)}
                        >
                            <Text style={styles.songChipTitle}>{song.title}</Text>
                            <Text style={styles.songChipMeta}>
                                {song.artist}{song.isImported ? ' • Imported' : ' • Starter'}
                            </Text>
                            <Text style={styles.songChipDifficulty}>{song.difficulty}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <View style={styles.playerShell}>
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
                    <Pressable style={styles.seekTrack} onPress={(event) => void seekToTime((event.nativeEvent.locationX / LANE_WIDTH) * selectedSong.durationSec)}>
                        <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
                        <View style={[styles.seekThumb, { left: Math.max(0, Math.min(LANE_WIDTH - 16, (progress * LANE_WIDTH) - 8)) }]} />
                    </Pressable>

                    <View style={styles.segmentedRow}>
                        {(['chords', 'tabs', 'guide'] as SongPanel[]).map((panel) => {
                            const isActive = activePanel === panel;
                            return (
                                <TouchableOpacity
                                    key={panel}
                                    style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
                                    onPress={() => setActivePanel(panel)}
                                >
                                    <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                                        {panel.charAt(0).toUpperCase() + panel.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

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
                                ? [0, 1, 2, 3, 4, 5].map((stringIndex) => {
                                    const y = getStringY(stringIndex);
                                    return (
                                        <Line
                                            key={`string-${stringIndex}`}
                                            p1={{ x: 14, y }}
                                            p2={{ x: LANE_WIDTH - 16, y }}
                                            color={withOpacity(SONG_COLORS.textDim, stringIndex === 0 || stringIndex === 5 ? 0.42 : 0.28)}
                                            strokeWidth={stringIndex === 0 || stringIndex === 5 ? 2 : 1.4}
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
                                const y = getStringY(note.stringIndex) + (Math.sin((animationNow / 250) + (note.index * 0.8)) * 2.5);
                                const tailWidth = Math.max(18, (note.durationSec ?? 0.18) * PIXELS_PER_SECOND);
                                const wasHit = hitTabIndexesRef.current.has(note.index);
                                const hitStamp = tabHitMomentsRef.current.get(note.index) ?? null;
                                const hitProgress = hitStamp ? Math.min(1, (animationNow - hitStamp) / 560) : 1;
                                const showHitSpark = hitProgress < 1;
                                const noteColor = wasHit
                                    ? '#45FF92'
                                    : note.fret >= 5 ? SONG_COLORS.highlight : SONG_COLORS.primary;

                                return (
                                    <React.Fragment key={`tab-shape-${selectedSong.id}-${note.index}`}>
                                        {showHitSpark && (
                                            <>
                                                <Circle
                                                    cx={x}
                                                    cy={y}
                                                    r={16 + (hitProgress * 18)}
                                                    color={withOpacity('#45FF92', Math.max(0, 0.22 - (hitProgress * 0.18)))}
                                                />
                                                <Circle
                                                    cx={x}
                                                    cy={y}
                                                    r={8 + (hitProgress * 10)}
                                                    color={withOpacity('#CFFFF0', Math.max(0, 0.34 - (hitProgress * 0.28)))}
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

                            <Rect x={PLAYHEAD_X - 10} y={0} width={20} height={LANE_HEIGHT} color={withOpacity(SONG_COLORS.primary, 0.09)} />
                            <Rect x={PLAYHEAD_X - 2} y={14} width={4} height={LANE_HEIGHT - 28} color={SONG_COLORS.primary} />
                            <Circle cx={PLAYHEAD_X} cy={30} r={9} color={SONG_COLORS.highlight} />
                            <Circle cx={PLAYHEAD_X} cy={30} r={18} color={withOpacity(SONG_COLORS.highlight, 0.12)} />

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
                                const y = getStringY(note.stringIndex) + (Math.sin((animationNow / 250) + (note.index * 0.8)) * 2.5);
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
                                    {STRING_LABELS.map((label, index) => (
                                        <Text
                                            key={`legend-${label}`}
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

                    <View style={styles.transportRow}>
                        <TouchableOpacity
                            style={[styles.transportButton, styles.transportPrimary]}
                            onPress={() => void togglePlayback()}
                        >
                            <Text style={styles.transportPrimaryText}>{isPlaying ? 'Pause' : 'Play'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.transportButton}
                            onPress={() => void restartSong()}
                        >
                            <Text style={styles.transportText}>Restart</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.transportButton}
                            onPress={() => void seekBy(-seekStepSeconds)}
                        >
                            <Text style={styles.transportText}>-{seekStepSeconds}s</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.transportButton}
                            onPress={() => void seekBy(seekStepSeconds)}
                        >
                            <Text style={styles.transportText}>+{seekStepSeconds}s</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.transportButton}
                            onPress={() => void finishSession(selectedSong)}
                        >
                            <Text style={styles.transportText}>Finish</Text>
                        </TouchableOpacity>
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
                                <Text style={styles.guideLine}>4. Import uses two files: one audio file and one JSON file with chordEvents and tabNotes.</Text>
                            </View>
                        )}
                    </View>
                </View>
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
    songChipActive: {
        borderColor: SONG_COLORS.primary,
        backgroundColor: withOpacity(SONG_COLORS.panelRaised, 0.98),
        shadowColor: SONG_COLORS.primary,
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
    },
    importChip: {
        borderColor: withOpacity(SONG_COLORS.secondary, 0.3),
        backgroundColor: withOpacity(SONG_COLORS.secondary, 0.08),
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
        borderColor: SONG_COLORS.primary,
        backgroundColor: withOpacity(SONG_COLORS.primary, 0.12),
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
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: SONG_COLORS.border,
        backgroundColor: SONG_COLORS.panelRaised,
        ...SHADOWS.card,
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
        marginTop: 12,
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
    transportPrimary: {
        borderColor: withOpacity(SONG_COLORS.secondary, 0.34),
        backgroundColor: withOpacity(SONG_COLORS.secondary, 0.12),
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
        marginTop: 12,
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
