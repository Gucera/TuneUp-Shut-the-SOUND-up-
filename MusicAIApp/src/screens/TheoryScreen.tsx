import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Dimensions,
    findNodeHandle,
    LayoutRectangle,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { getProgressSnapshot } from '../database/services';
import {
    getRandomPuzzle,
    NOTE_LABELS,
    shuffleNotes,
    TheoryPuzzle,
} from '../data/theoryPuzzles';
import { AudioChordQuestion, getRandomAudioQuestion } from '../data/audioChordQuiz';
import { getLessonPackagesByInstrument, LESSON_PACK_COUNTS, LessonInstrument, LessonPackage } from '../data/lessonLibrary';
import { getRandomTheoryQuizQuestion, TheoryQuizQuestion } from '../data/theoryQuizQuestions';
import { COLORS, SHADOWS } from '../theme';
import Breadcrumb, { BreadcrumbSegment } from '../components/Breadcrumb';
import LessonVisualGallery from '../components/LessonVisualGallery';
import GamificationDeck from '../components/GamificationDeck';
import PageTransitionView from '../components/PageTransitionView';
import PremiumBackdrop from '../components/PremiumBackdrop';
import PremiumCelebrationOverlay from '../components/PremiumCelebrationOverlay';
import PremiumHeroStrip from '../components/PremiumHeroStrip';
import ScreenSettingsButton from '../components/ScreenSettingsButton';
import SkeletonBlock from '../components/SkeletonBlock';
import { LeaderboardEntry } from '../services/api';
import { getAppSettings } from '../services/appSettings';
import { useCelebration } from '../hooks/useCelebration';
import { GamificationSnapshot, getGamificationSnapshot, getLeaderboard, rewardPracticeActivity, syncGamificationProfile } from '../services/gamification';

const { width } = Dimensions.get('window');

// Position 0 is the bottom line of the staff (E)
const NOTES_DATA = [
    { name: 'E', position: 0 },
    { name: 'F', position: 1 },
    { name: 'G', position: 2 },
    { name: 'A', position: 3 },
    { name: 'B', position: 4 },
    { name: 'C', position: 5 },
    { name: 'D', position: 6 },
    { name: 'F2', position: 8 },
];

const PIANO_KEYS = [
    { note: 'C', label: 'C', hasBlack: true },
    { note: 'D', label: 'D', hasBlack: true },
    { note: 'E', label: 'E', hasBlack: false },
    { note: 'F', label: 'F', hasBlack: true },
    { note: 'G', label: 'G', hasBlack: true },
    { note: 'A', label: 'A', hasBlack: true },
    { note: 'B', label: 'B', hasBlack: false },
];

const STAFF_HEIGHT = 34;
const BOTTOM_LINE_Y = 176;

type TheoryMode = 'lessons' | 'quiz' | 'quick' | 'puzzle' | 'audio';

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

function noteToStaffPosition(note: string): number {
    const first = note.trim().charAt(0).toUpperCase();
    const map: Record<string, number> = { E: 0, F: 1, G: 2, A: 3, B: 4, C: 5, D: 6 };
    return map[first] ?? 4;
}

type DropHandler = (note: string, absoluteX: number, absoluteY: number) => void;

interface DraggableNoteProps {
    note: string;
    label: string;
    startX: number;
    startY: number;
    resetKey: number;
    disabled: boolean;
    onDrop: DropHandler;
}

function DraggableNote({
    note,
    label,
    startX,
    startY,
    resetKey,
    disabled,
    onDrop,
}: DraggableNoteProps) {
    const x = useSharedValue(startX);
    const y = useSharedValue(startY);
    const scale = useSharedValue(1);

    useEffect(() => {
        x.value = withSpring(startX);
        y.value = withSpring(startY);
        scale.value = withSpring(1);
    }, [startX, startY, resetKey, x, y, scale]);

    const pan = Gesture.Pan()
        .enabled(!disabled)
        .onBegin(() => {
            scale.value = withSpring(1.07);
        })
        .onUpdate((event) => {
            x.value = startX + event.translationX;
            y.value = startY + event.translationY;
        })
        .onEnd((event) => {
            runOnJS(onDrop)(note, event.absoluteX, event.absoluteY);
            x.value = withSpring(startX);
            y.value = withSpring(startY);
            scale.value = withSpring(1);
        })
        .onFinalize(() => {
            x.value = withSpring(startX);
            y.value = withSpring(startY);
            scale.value = withSpring(1);
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
    }));

    return (
        <GestureDetector gesture={pan}>
            <Animated.View style={[styles.dragNoteChip, animatedStyle, disabled && styles.dragNoteChipDisabled]}>
                <Text style={styles.dragNoteMain}>{note}</Text>
                <Text style={styles.dragNoteSub}>{label}</Text>
            </Animated.View>
        </GestureDetector>
    );
}

interface AnimatedLessonPickerChipProps {
    index: number;
    isActive: boolean;
    lesson: LessonPackage;
    animationsEnabled: boolean;
    onPress: () => void;
}

function AnimatedLessonPickerChip({
    index,
    isActive,
    lesson,
    animationsEnabled,
    onPress,
}: AnimatedLessonPickerChipProps) {
    return (
        <Animated.View
            entering={animationsEnabled
                ? FadeInDown.delay(index * 55).springify().damping(18).stiffness(185)
                : undefined}
        >
            <TouchableOpacity
                style={[styles.lessonPickerChip, isActive && styles.lessonPickerChipActive]}
                onPress={onPress}
            >
                <Text style={[styles.lessonPickerNumber, isActive && styles.lessonPickerNumberActive]}>
                    {index + 1}
                </Text>
                <View style={styles.lessonPickerTextWrap}>
                    <Text numberOfLines={1} style={[styles.lessonPickerTitle, isActive && styles.lessonPickerTitleActive]}>
                        {lesson.title}
                    </Text>
                    <Text style={styles.lessonPickerMeta}>{lesson.tier}</Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

export default function TheoryScreen() {
    const tabBarHeight = useBottomTabBarHeight();
    const initialPuzzle = useMemo(() => getRandomPuzzle(), []);
    const initialAudio = useMemo(() => getRandomAudioQuestion(), []);
    const initialQuiz = useMemo(() => getRandomTheoryQuizQuestion(), []);

    const [mode, setMode] = useState<TheoryMode>('lessons');
    const [lessonInstrument, setLessonInstrument] = useState<LessonInstrument>('Guitar');
    const [selectedLessonId, setSelectedLessonId] = useState('gtr-01-posture-tone');

    const [currentNote, setCurrentNote] = useState(NOTES_DATA[2]);
    const [quickFeedback, setQuickFeedback] = useState<string | null>(null);
    const [noteColor, setNoteColor] = useState(COLORS.textStrong);

    const [xp, setXp] = useState(0);
    const [level, setLevel] = useState(1);
    const [streak, setStreak] = useState(0);
    const [isProgressLoading, setIsProgressLoading] = useState(false);
    const [gameSnapshot, setGameSnapshot] = useState<GamificationSnapshot | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
    const [lessonActionText, setLessonActionText] = useState<string | null>(null);
    const [lessonAnimationsEnabled, setLessonAnimationsEnabled] = useState(true);
    const [showTheoryDeck, setShowTheoryDeck] = useState(true);
    const [showQuizExplanation, setShowQuizExplanation] = useState(true);

    const [currentPuzzle, setCurrentPuzzle] = useState<TheoryPuzzle>(initialPuzzle);
    const [puzzlePool, setPuzzlePool] = useState<string[]>(() => shuffleNotes(initialPuzzle.pool));
    const [orderSlots, setOrderSlots] = useState<string[]>(() =>
        initialPuzzle.kind === 'order' ? Array(initialPuzzle.answer.length).fill('') : []
    );
    const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
    const [puzzleFeedback, setPuzzleFeedback] = useState<string | null>(null);
    const [puzzleSolved, setPuzzleSolved] = useState(false);
    const [dragResetKey, setDragResetKey] = useState(0);

    const [currentAudioQuestion, setCurrentAudioQuestion] = useState<AudioChordQuestion>(initialAudio);
    const [audioFeedback, setAudioFeedback] = useState<string | null>(null);
    const [audioSelectedOption, setAudioSelectedOption] = useState<string | null>(null);
    const [isChordPlaying, setIsChordPlaying] = useState(false);
    const [currentQuizQuestion, setCurrentQuizQuestion] = useState<TheoryQuizQuestion>(initialQuiz);
    const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
    const [quizSelectedIndex, setQuizSelectedIndex] = useState<number | null>(null);

    const [slotLayouts, setSlotLayouts] = useState<Record<number, LayoutRectangle>>({});
    const [staffWindow, setStaffWindow] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const [lessonsSectionY, setLessonsSectionY] = useState(0);
    const [instrumentSectionY, setInstrumentSectionY] = useState(0);
    const [lessonListSectionY, setLessonListSectionY] = useState(0);
    const { celebration, showCelebration } = useCelebration();

    const theoryScrollRef = useRef<ScrollView | null>(null);
    const staffRef = useRef<View | null>(null);
    const chordSoundRef = useRef<Audio.Sound | null>(null);
    const lessonOptions = useMemo(() => getLessonPackagesByInstrument(lessonInstrument), [lessonInstrument]);
    const selectedLesson = useMemo(
        () => lessonOptions.find((lesson) => lesson.id === selectedLessonId) ?? lessonOptions[0],
        [lessonOptions, selectedLessonId],
    );
    const scrollToTheoryY = useCallback((targetY: number) => {
        theoryScrollRef.current?.scrollTo({
            y: Math.max(0, targetY - 18),
            animated: true,
        });
    }, []);

    const syncProgress = useCallback(async () => {
        setIsProgressLoading(true);
        setIsLeaderboardLoading(true);
        try {
            const [progress, snapshot, settings] = await Promise.all([
                getProgressSnapshot(),
                getGamificationSnapshot(),
                getAppSettings(),
            ]);

            setXp(progress.xp);
            setLevel(progress.level);
            setStreak(snapshot.streakDays);
            setGameSnapshot(snapshot);
            setLessonAnimationsEnabled(settings.showLessonAnimations);
            setShowTheoryDeck(settings.theoryShowGamificationDeck);
            setShowQuizExplanation(settings.theoryShowQuizExplanation);

            await syncGamificationProfile();
            const nextLeaderboard = await getLeaderboard();
            setLeaderboard(nextLeaderboard);
        } catch (error) {
            console.error('Failed to load progress:', error);
        } finally {
            setIsProgressLoading(false);
            setIsLeaderboardLoading(false);
        }
    }, []);

    useEffect(() => {
        void syncProgress();
    }, [syncProgress]);

    useFocusEffect(
        useCallback(() => {
            void syncProgress();
        }, [syncProgress]),
    );

    useEffect(() => {
        return () => {
            if (chordSoundRef.current) {
                void chordSoundRef.current.unloadAsync();
            }
        };
    }, []);

    useEffect(() => {
        if (!selectedLesson) {
            return;
        }

        if (selectedLesson.id !== selectedLessonId) {
            setSelectedLessonId(selectedLesson.id);
        }
    }, [selectedLesson, selectedLessonId]);

    useEffect(() => {
        setLessonActionText(null);
    }, [selectedLessonId]);

    const applyReward = useCallback(async (
        amount: number,
        activity: Parameters<typeof rewardPracticeActivity>[1],
    ) => {
        try {
            const result = await rewardPracticeActivity(amount, activity);
            setXp(result.progress.xp);
            setLevel(result.progress.level);
            setStreak(result.snapshot.streakDays);
            setGameSnapshot(result.snapshot);
            const nextLeaderboard = await getLeaderboard();
            setLeaderboard(nextLeaderboard);

            if (result.newBadges.length > 0) {
                showCelebration({
                    title: 'Badge unlocked',
                    subtitle: result.newBadges.map((badge) => badge.title).join(' • '),
                    variant: 'confetti',
                }, 2200);
            }
        } catch (error) {
            console.error('Failed to update rewards:', error);
        }
    }, [showCelebration]);

    const markLessonComplete = useCallback(async () => {
        if (!selectedLesson) {
            return;
        }

        if (gameSnapshot?.completedLessonIds.includes(selectedLesson.id)) {
            setLessonActionText('Already completed. Review it any time.');
            return;
        }

        const lessonXp =
            selectedLesson.tier === 'Beginner'
                ? 45
                : selectedLesson.tier === 'Early Intermediate'
                    ? 60
                    : selectedLesson.tier === 'Intermediate'
                        ? 80
                        : 100;

        await applyReward(lessonXp, {
            kind: 'lesson',
            id: selectedLesson.id,
            instrument: selectedLesson.instrument,
        });
        setLessonActionText(`Lesson completed. +${lessonXp} XP added.`);
        showCelebration({
            title: 'Lesson complete',
            subtitle: `${selectedLesson.title} locked in with +${lessonXp} XP.`,
            variant: 'confetti',
        }, 2100);
    }, [applyReward, gameSnapshot?.completedLessonIds, selectedLesson, showCelebration]);

    const measureStaffInWindow = useCallback(() => {
        const handle = findNodeHandle(staffRef.current);
        if (!handle) {
            return;
        }

        UIManager.measureInWindow(handle, (x, y, measuredWidth, measuredHeight) => {
            setStaffWindow({ x, y, width: measuredWidth, height: measuredHeight });
        });
    }, []);

    const nextQuickQuestion = useCallback(() => {
        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * NOTES_DATA.length);
        } while (NOTES_DATA[randomIndex].name === currentNote.name);

        setCurrentNote(NOTES_DATA[randomIndex]);
        setNoteColor(COLORS.textStrong);
        setQuickFeedback(null);
    }, [currentNote.name]);

    const handleQuickPress = (pressedNote: string) => {
        const target = currentNote.name[0];
        if (pressedNote === target) {
            void applyReward(10, { kind: 'quick-note', id: `quick-${currentNote.name}` });
            setQuickFeedback('Correct! +10 XP');
            setNoteColor(COLORS.success);
            setTimeout(() => {
                void nextQuickQuestion();
            }, 220);
        } else {
            setQuickFeedback('Wrong note, try again.');
            setNoteColor(COLORS.danger);
            setTimeout(() => {
                setNoteColor(COLORS.textStrong);
                setQuickFeedback(null);
            }, 500);
        }
    };

    const resetPuzzleState = useCallback((puzzle: TheoryPuzzle) => {
        setPuzzlePool(shuffleNotes(puzzle.pool));
        setPuzzleFeedback(null);
        setPuzzleSolved(false);
        setSlotLayouts({});
        setDragResetKey((prev) => prev + 1);
        if (puzzle.kind === 'order') {
            setOrderSlots(Array(puzzle.answer.length).fill(''));
        } else {
            setOrderSlots([]);
        }
        setSelectedNotes([]);
    }, []);

    const goToNextPuzzle = useCallback(() => {
        const nextPuzzle = getRandomPuzzle(currentPuzzle.id);
        setCurrentPuzzle(nextPuzzle);
        resetPuzzleState(nextPuzzle);
    }, [currentPuzzle.id, resetPuzzleState]);

    const handleDropOnStaff = useCallback((note: string, absoluteX: number, absoluteY: number) => {
        if (currentPuzzle.kind !== 'order' || puzzleSolved) {
            return;
        }

        let hitIndex = -1;
        for (let i = 0; i < currentPuzzle.answer.length; i += 1) {
            const slot = slotLayouts[i];
            if (!slot) {
                continue;
            }

            const left = staffWindow.x + slot.x;
            const right = left + slot.width;
            const top = staffWindow.y + slot.y;
            const bottom = top + slot.height;
            const isInside = absoluteX >= left && absoluteX <= right && absoluteY >= top && absoluteY <= bottom;

            if (isInside) {
                hitIndex = i;
                break;
            }
        }

        if (hitIndex < 0) {
            return;
        }

        setOrderSlots((prev) => {
            const next = [...prev];
            const existingIndex = next.findIndex((item) => item === note);
            if (existingIndex >= 0) {
                next[existingIndex] = '';
            }

            if (next[hitIndex] && next[hitIndex] !== note) {
                return prev;
            }

            next[hitIndex] = note;
            return next;
        });

        setPuzzleFeedback(null);
    }, [currentPuzzle, puzzleSolved, slotLayouts, staffWindow]);

    const clearOrderSlot = (index: number) => {
        if (currentPuzzle.kind !== 'order' || puzzleSolved) {
            return;
        }
        setOrderSlots((prev) => {
            const next = [...prev];
            next[index] = '';
            return next;
        });
    };

    const toggleSelectNote = (note: string) => {
        if (currentPuzzle.kind !== 'select' || puzzleSolved) {
            return;
        }

        setSelectedNotes((prev) => {
            if (prev.includes(note)) {
                return prev.filter((item) => item !== note);
            }

            if (prev.length >= currentPuzzle.answer.length) {
                return prev;
            }

            return [...prev, note];
        });
    };

    const checkPuzzle = () => {
        if (puzzleSolved) {
            return;
        }

        if (currentPuzzle.kind === 'order') {
            if (orderSlots.some((slot) => slot === '')) {
                setPuzzleFeedback('Drop notes into every slot first.');
                return;
            }

            const correct = orderSlots.every((note, index) => note === currentPuzzle.answer[index]);
            if (correct) {
                setPuzzleSolved(true);
                setPuzzleFeedback(`Great job! +${currentPuzzle.xpReward} XP`);
                void applyReward(currentPuzzle.xpReward, { kind: 'puzzle', id: currentPuzzle.id });
                showCelebration({
                    title: 'Puzzle solved',
                    subtitle: `Clean answer for +${currentPuzzle.xpReward} XP.`,
                    variant: 'success',
                });
            } else {
                setPuzzleFeedback('Order is wrong. Try once more.');
            }
            return;
        }

        if (selectedNotes.length !== currentPuzzle.answer.length) {
            setPuzzleFeedback(`Pick ${currentPuzzle.answer.length} notes.`);
            return;
        }

        const sortedSelected = [...selectedNotes].sort();
        const sortedAnswer = [...currentPuzzle.answer].sort();
        const isCorrect = sortedSelected.every((note, index) => note === sortedAnswer[index]);

        if (isCorrect) {
            setPuzzleSolved(true);
            setPuzzleFeedback(`Great job! +${currentPuzzle.xpReward} XP`);
            void applyReward(currentPuzzle.xpReward, { kind: 'puzzle', id: currentPuzzle.id });
            showCelebration({
                title: 'Puzzle solved',
                subtitle: `Clean answer for +${currentPuzzle.xpReward} XP.`,
                variant: 'success',
            });
        } else {
            setPuzzleFeedback('Wrong notes. Give it another shot.');
        }
    };

    const playCurrentChord = async () => {
        try {
            setIsChordPlaying(true);
            if (chordSoundRef.current) {
                await chordSoundRef.current.unloadAsync();
                chordSoundRef.current = null;
            }

            const { sound } = await Audio.Sound.createAsync(currentAudioQuestion.audioSource, {
                shouldPlay: true,
                volume: 1,
            });

            chordSoundRef.current = sound;
            sound.setOnPlaybackStatusUpdate((status) => {
                if (!status.isLoaded) {
                    return;
                }
                if (status.didJustFinish || !status.isPlaying) {
                    setIsChordPlaying(false);
                }
            });
        } catch (error) {
            setIsChordPlaying(false);
            console.error('Failed to play chord audio:', error);
        }
    };

    const answerAudioQuestion = (option: string) => {
        if (audioSelectedOption) {
            return;
        }

        setAudioSelectedOption(option);

        if (option === currentAudioQuestion.correctChord) {
            setAudioFeedback(`Correct! +${currentAudioQuestion.xpReward} XP`);
            void applyReward(currentAudioQuestion.xpReward, { kind: 'audio-quiz', id: currentAudioQuestion.id });
            showCelebration({
                title: 'Ear test cleared',
                subtitle: `You caught ${currentAudioQuestion.correctChord} for +${currentAudioQuestion.xpReward} XP.`,
                variant: 'success',
            });
        } else {
            setAudioFeedback(`Not quite. It was ${currentAudioQuestion.correctChord}.`);
        }
    };

    const nextAudioQuestion = async () => {
        if (chordSoundRef.current) {
            await chordSoundRef.current.unloadAsync();
            chordSoundRef.current = null;
        }
        setIsChordPlaying(false);

        const nextQuestion = getRandomAudioQuestion(currentAudioQuestion.id);
        setCurrentAudioQuestion(nextQuestion);
        setAudioSelectedOption(null);
        setAudioFeedback(null);
    };

    const answerTheoryQuiz = (selectedIndex: number) => {
        if (quizSelectedIndex !== null) {
            return;
        }

        setQuizSelectedIndex(selectedIndex);

        if (selectedIndex === currentQuizQuestion.correctIndex) {
            setQuizFeedback(`Correct! +${currentQuizQuestion.xpReward} XP`);
            void applyReward(currentQuizQuestion.xpReward, { kind: 'quiz', id: currentQuizQuestion.id });
            showCelebration({
                title: 'Theory answer correct',
                subtitle: `Nice read. +${currentQuizQuestion.xpReward} XP added.`,
                variant: 'success',
            });
            return;
        }

        setQuizFeedback('Not quite. Read the explanation and try the next one.');
    };

    const nextTheoryQuiz = () => {
        const nextQuestion = getRandomTheoryQuizQuestion(currentQuizQuestion.id);
        setCurrentQuizQuestion(nextQuestion);
        setQuizSelectedIndex(null);
        setQuizFeedback(null);
    };

    const difficultyLabel =
        currentPuzzle.difficulty === 'easy' ? 'Easy' : currentPuzzle.difficulty === 'medium' ? 'Medium' : 'Hard';

    const difficultyColor =
        currentPuzzle.difficulty === 'easy'
            ? COLORS.success
            : currentPuzzle.difficulty === 'medium'
                ? COLORS.warning
                : COLORS.accent;
    const quizDifficultyColor =
        currentQuizQuestion.difficulty === 'easy'
            ? COLORS.success
            : currentQuizQuestion.difficulty === 'medium'
                ? COLORS.warning
                : COLORS.accent;
    const isBootLoading = isProgressLoading && !gameSnapshot;
    const selectedLessonIndex = selectedLesson ? lessonOptions.findIndex((lesson) => lesson.id === selectedLesson.id) : 0;
    const lessonAccent =
        lessonInstrument === 'Guitar'
            ? COLORS.primary
            : lessonInstrument === 'Piano'
                ? COLORS.secondary
                : COLORS.accent;
    const lessonMarker = lessonInstrument === 'Guitar' ? 'G' : lessonInstrument === 'Piano' ? 'P' : 'D';
    const lessonPackProgress = lessonOptions.length > 0 ? ((selectedLessonIndex + 1) / lessonOptions.length) : 0;
    const lessonPhase =
        selectedLessonIndex < Math.ceil(lessonOptions.length / 3)
            ? 'Foundation'
            : selectedLessonIndex < Math.ceil((lessonOptions.length * 2) / 3)
                ? 'Build'
                : 'Performance';
    const isLessonCompleted = !!selectedLesson && !!gameSnapshot?.completedLessonIds.includes(selectedLesson.id);
    const completedInstrumentLessons = useMemo(
        () => lessonOptions.filter((lesson) => gameSnapshot?.completedLessonIds.includes(lesson.id)).length,
        [gameSnapshot, lessonOptions],
    );
    const breadcrumbProgress = lessonOptions.length > 0
        ? completedInstrumentLessons / lessonOptions.length
        : 0;
    const breadcrumbProgressLabel = `${completedInstrumentLessons}/${lessonOptions.length || 0} complete`;
    const breadcrumbSegments = useMemo<BreadcrumbSegment[]>(() => [
        {
            key: 'lessons-root',
            label: 'Lessons',
            onPress: () => {
                setMode('lessons');
                scrollToTheoryY(lessonsSectionY);
            },
        },
        {
            key: `instrument-${lessonInstrument}`,
            label: lessonInstrument,
            onPress: () => {
                setMode('lessons');
                scrollToTheoryY(instrumentSectionY);
            },
        },
        {
            key: `level-${selectedLessonIndex + 1}`,
            label: `Level ${selectedLessonIndex + 1}`,
            onPress: () => {
                setMode('lessons');
                scrollToTheoryY(lessonListSectionY);
            },
        },
        {
            key: selectedLesson.id,
            label: selectedLesson.title,
        },
    ], [
        instrumentSectionY,
        lessonInstrument,
        lessonListSectionY,
        lessonsSectionY,
        scrollToTheoryY,
        selectedLesson.id,
        selectedLesson.title,
        selectedLessonIndex,
    ]);

    const quickNoteTop = BOTTOM_LINE_Y - (currentNote.position * (STAFF_HEIGHT / 2));

    const slotStep =
        currentPuzzle.kind === 'order' && currentPuzzle.answer.length > 1
            ? (width - 150) / (currentPuzzle.answer.length - 1)
            : 0;

    return (
        <LinearGradient
            colors={[COLORS.panelAlt, COLORS.background, COLORS.backgroundAlt]}
            start={{ x: 0.06, y: 0 }}
            end={{ x: 0.94, y: 1 }}
            style={styles.container}
        >
        <PremiumBackdrop variant="light" />
        <PageTransitionView style={styles.container}>
        <ScrollView
            ref={theoryScrollRef}
            style={styles.container}
            contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarHeight + 28 }]}
            showsVerticalScrollIndicator={false}
            scrollEnabled={mode !== 'puzzle'}
        >
            <View style={styles.headerRow}>
                <View style={styles.headerTextWrap}>
                    <Text style={styles.title}>Theory Lab</Text>
                    <Text style={styles.subTitle}>Premium lesson packs, theory quiz work, ear training, and puzzle flow</Text>
                </View>
                <ScreenSettingsButton />
            </View>

            <PremiumHeroStrip
                icon="library-outline"
                eyebrow="Premium Study"
                title="Lessons, theory drills, and ear work in one polished study room."
                body="The structure stays simple, but the top layer now feels more guided and more premium from the moment you land here."
                metrics={[
                    { label: 'Lessons', value: '50' },
                    { label: 'Quiz', value: '50 Q' },
                    { label: 'Streak', value: `${streak} days` },
                ]}
            />

            {showTheoryDeck && (
                isBootLoading ? (
                    <View style={[styles.card, { paddingVertical: 18 }]}>
                        <SkeletonBlock style={{ width: 82, height: 12, marginBottom: 12 }} />
                        <SkeletonBlock style={{ width: '70%', height: 18, marginBottom: 14 }} />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <SkeletonBlock style={{ flex: 1, height: 72 }} />
                            <SkeletonBlock style={{ flex: 1, height: 72 }} />
                        </View>
                    </View>
                ) : (
                    <GamificationDeck
                        snapshot={gameSnapshot}
                        leaderboard={leaderboard}
                        isRefreshing={isLeaderboardLoading}
                        onRefresh={() => {
                            void syncProgress();
                        }}
                    />
                )
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
                {[
                    { key: 'lessons', label: 'Lesson Packs' },
                    { key: 'quiz', label: 'Theory Quiz' },
                    { key: 'quick', label: 'Quick Note' },
                    { key: 'puzzle', label: 'Drag Puzzle' },
                    { key: 'audio', label: 'Audio Quiz' },
                ].map((item) => {
                    const isActive = mode === item.key;
                    return (
                        <TouchableOpacity
                            key={item.key}
                            style={[styles.modeButton, isActive && styles.modeButtonActive]}
                            onPress={() => setMode(item.key as TheoryMode)}
                        >
                            <Text style={[styles.modeButtonText, isActive && styles.modeButtonTextActive]}>{item.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {isBootLoading ? (
                <>
                    <View style={styles.scoreBoard}>
                        {[0, 1, 2].map((index) => (
                            <View key={`score-skeleton-${index}`}>
                                <SkeletonBlock style={{ width: 54, height: 10, marginBottom: 8 }} />
                                <SkeletonBlock style={{ width: 66, height: 18 }} />
                            </View>
                        ))}
                    </View>

                    <View style={styles.card}>
                        <SkeletonBlock style={{ width: 140, height: 18, marginBottom: 12 }} />
                        <SkeletonBlock style={{ width: '86%', height: 12, marginBottom: 16 }} />
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                            <SkeletonBlock style={{ flex: 1, height: 64 }} />
                            <SkeletonBlock style={{ flex: 1, height: 64 }} />
                            <SkeletonBlock style={{ flex: 1, height: 64 }} />
                        </View>
                        <SkeletonBlock style={{ width: '100%', height: 220, marginBottom: 14 }} />
                        <SkeletonBlock style={{ width: '68%', height: 16, marginBottom: 10 }} />
                        <SkeletonBlock style={{ width: '100%', height: 14, marginBottom: 8 }} />
                        <SkeletonBlock style={{ width: '92%', height: 14, marginBottom: 8 }} />
                        <SkeletonBlock style={{ width: '82%', height: 14 }} />
                    </View>
                </>
            ) : (
                <>
            <View style={styles.scoreBoard}>
                <View>
                    <Text style={styles.scoreLabel}>TOTAL XP</Text>
                    <Text style={styles.scoreValue}>{isProgressLoading ? '...' : xp}</Text>
                </View>
                <View>
                    <Text style={styles.scoreLabel}>LEVEL</Text>
                    <Text style={styles.scoreValue}>{level}</Text>
                </View>
                <View>
                    <Text style={styles.scoreLabel}>STREAK</Text>
                    <Text style={[styles.scoreValue, { color: streak > 2 ? COLORS.primary : COLORS.textStrong }]}>{streak}</Text>
                </View>
            </View>

            {mode === 'lessons' && selectedLesson && (
                <View
                    style={styles.card}
                    onLayout={(event) => setLessonsSectionY(event.nativeEvent.layout.y)}
                >
                    <Breadcrumb
                        key={`lesson-breadcrumb-${lessonInstrument}-${selectedLesson.id}-${selectedLessonIndex}`}
                        accentColor={lessonAccent}
                        animationsEnabled={lessonAnimationsEnabled}
                        progress={breadcrumbProgress}
                        progressLabel={breadcrumbProgressLabel}
                        segments={breadcrumbSegments}
                    />

                    <View style={styles.cardTopRow}>
                        <Text style={styles.cardTitle}>Ready Lesson Packs</Text>
                        <View style={[styles.diffPill, { borderColor: COLORS.primary }]}>
                            <Text style={[styles.diffPillText, { color: COLORS.primary }]}>50 TOTAL</Text>
                        </View>
                    </View>

                    <Text style={styles.cardInstruction}>
                        Premium English lesson paths for guitar, piano, and drums. Pick the instrument, then step through the pack like a real curriculum.
                    </Text>

                    <View
                        style={styles.lessonCountRow}
                        onLayout={(event) => setInstrumentSectionY(event.nativeEvent.layout.y)}
                    >
                        {(['Guitar', 'Piano', 'Drums'] as LessonInstrument[]).map((instrument) => {
                            const isActive = lessonInstrument === instrument;
                            return (
                                <TouchableOpacity
                                    key={instrument}
                                    style={[styles.instrumentButton, isActive && styles.instrumentButtonActive]}
                                    onPress={() => setLessonInstrument(instrument)}
                                >
                                    <Text style={[styles.instrumentButtonText, isActive && styles.instrumentButtonTextActive]}>
                                        {instrument}
                                    </Text>
                                    <Text style={[styles.instrumentCountText, isActive && styles.instrumentCountTextActive]}>
                                        {LESSON_PACK_COUNTS[instrument]} lessons
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <ScrollView
                        horizontal
                        key={`lesson-row-${lessonInstrument}`}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.lessonPickerRow}
                        onLayout={(event) => setLessonListSectionY(event.nativeEvent.layout.y)}
                    >
                        {lessonOptions.map((lesson, index) => {
                            const isActive = selectedLesson.id === lesson.id;
                            return (
                                <AnimatedLessonPickerChip
                                    key={lesson.id}
                                    animationsEnabled={lessonAnimationsEnabled}
                                    index={index}
                                    isActive={isActive}
                                    lesson={lesson}
                                    onPress={() => setSelectedLessonId(lesson.id)}
                                />
                            );
                        })}
                    </ScrollView>

                    <Animated.View
                        key={`lesson-hero-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(80).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                        <LinearGradient
                            colors={[withOpacity(lessonAccent, 0.16), withOpacity(lessonAccent, 0.05)]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.lessonHero}
                        >
                            <View style={[styles.lessonHeroBadge, { borderColor: withOpacity(lessonAccent, 0.26) }]}>
                                <Text style={[styles.lessonHeroBadgeText, { color: lessonAccent }]}>{lessonMarker}</Text>
                            </View>

                            <View style={styles.lessonHeroBody}>
                                <View style={styles.lessonHeroTopRow}>
                                    <View style={styles.lessonHeroMain}>
                                        <Text style={styles.lessonHeroTitle}>{selectedLesson.title}</Text>
                                        <Text style={styles.lessonHeroSubtitle}>{selectedLesson.subtitle}</Text>
                                    </View>

                                    <View style={[styles.lessonHeroTierPill, { borderColor: withOpacity(lessonAccent, 0.24) }]}>
                                        <Text style={[styles.lessonHeroTierText, { color: lessonAccent }]}>{selectedLesson.tier}</Text>
                                    </View>
                                </View>

                                <View style={styles.lessonHeroProgressRow}>
                                    <Text style={styles.lessonHeroProgressText}>
                                        Lesson {selectedLessonIndex + 1} of {lessonOptions.length}
                                    </Text>
                                    <Text style={[styles.lessonHeroProgressText, { color: lessonAccent }]}>{lessonPhase}</Text>
                                </View>

                                <View style={styles.lessonProgressRail}>
                                    <View
                                        style={[
                                            styles.lessonProgressFill,
                                            {
                                                width: `${Math.max(8, lessonPackProgress * 100)}%`,
                                                backgroundColor: lessonAccent,
                                            },
                                        ]}
                                    />
                                </View>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    <Animated.View
                        key={`lesson-stats-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(120).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                        <View style={styles.lessonStatsRow}>
                            <View style={styles.lessonStatBox}>
                                <Text style={styles.lessonStatLabel}>INSTRUMENT</Text>
                                <Text style={styles.lessonStatValue}>{selectedLesson.instrument}</Text>
                            </View>
                            <View style={styles.lessonStatBox}>
                                <Text style={styles.lessonStatLabel}>DURATION</Text>
                                <Text style={styles.lessonStatValue}>{selectedLesson.durationMin} min</Text>
                            </View>
                            <View style={styles.lessonStatBox}>
                                <Text style={styles.lessonStatLabel}>FOCUS</Text>
                                <Text style={[styles.lessonStatValue, { color: lessonAccent }]}>{selectedLesson.focusTags.length} lanes</Text>
                            </View>
                        </View>
                    </Animated.View>

                    <Animated.View
                        key={`lesson-goal-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(160).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                        <View style={styles.lessonGoalCard}>
                            <Text style={styles.lessonSectionTitle}>Session Goal</Text>
                            <Text style={styles.lessonBody}>{selectedLesson.goal}</Text>
                        </View>
                    </Animated.View>

                    <Animated.View
                        key={`lesson-tags-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(200).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                        <View style={styles.lessonTagRow}>
                            {selectedLesson.focusTags.map((tag) => (
                                <View key={tag} style={[styles.lessonTag, { borderColor: withOpacity(lessonAccent, 0.18) }]}>
                                    <Text style={styles.lessonTagText}>{tag}</Text>
                                </View>
                            ))}
                        </View>
                    </Animated.View>

                    <Animated.View
                        key={`lesson-visuals-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(240).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                        <LessonVisualGallery
                            visuals={selectedLesson.visuals}
                            accentColor={lessonAccent}
                            animationsEnabled={lessonAnimationsEnabled}
                        />
                    </Animated.View>

                    <Animated.View
                        key={`lesson-warmup-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(280).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                    <View style={styles.lessonSectionCard}>
                        <View style={styles.lessonSectionHeading}>
                            <View style={[styles.lessonSectionIcon, { backgroundColor: withOpacity(lessonAccent, 0.14) }]}>
                                <Text style={[styles.lessonSectionIconText, { color: lessonAccent }]}>WU</Text>
                            </View>
                            <View style={styles.lessonSectionHeadingText}>
                                <Text style={styles.lessonSectionTitle}>Warm-Up</Text>
                                <Text style={styles.lessonSectionSubtitle}>Get the body and ears settled first.</Text>
                            </View>
                        </View>
                        {selectedLesson.warmup.map((item, index) => (
                            <View key={`warm-${index}`} style={styles.lessonListRow}>
                                <View style={[styles.lessonListDot, { backgroundColor: lessonAccent }]} />
                                <Text style={styles.lessonBullet}>{item}</Text>
                            </View>
                        ))}
                    </View>
                    </Animated.View>

                    <Animated.View
                        key={`lesson-flow-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(320).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                    <View style={styles.lessonSectionCard}>
                        <View style={styles.lessonSectionHeading}>
                            <View style={[styles.lessonSectionIcon, { backgroundColor: withOpacity(lessonAccent, 0.14) }]}>
                                <Text style={[styles.lessonSectionIconText, { color: lessonAccent }]}>FL</Text>
                            </View>
                            <View style={styles.lessonSectionHeadingText}>
                                <Text style={styles.lessonSectionTitle}>Lesson Flow</Text>
                                <Text style={styles.lessonSectionSubtitle}>Main checkpoints, in order, like a guided session.</Text>
                            </View>
                        </View>

                        {selectedLesson.lessonSteps.map((item, index) => (
                            <View key={`flow-${index}`} style={styles.lessonTimelineRow}>
                                <View style={styles.lessonTimelineRail}>
                                    <View style={[styles.lessonTimelineDot, { borderColor: lessonAccent, backgroundColor: withOpacity(lessonAccent, 0.12) }]}>
                                        <Text style={[styles.lessonTimelineDotText, { color: lessonAccent }]}>{index + 1}</Text>
                                    </View>
                                    {index < selectedLesson.lessonSteps.length - 1 && <View style={styles.lessonTimelineLine} />}
                                </View>
                                <View style={styles.lessonTimelineCard}>
                                    <Text style={styles.lessonTimelineText}>{item}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                    </Animated.View>

                    <Animated.View
                        key={`lesson-loop-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(360).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                    <View style={styles.lessonSectionCard}>
                        <View style={styles.lessonSectionHeading}>
                            <View style={[styles.lessonSectionIcon, { backgroundColor: withOpacity(lessonAccent, 0.14) }]}>
                                <Text style={[styles.lessonSectionIconText, { color: lessonAccent }]}>LP</Text>
                            </View>
                            <View style={styles.lessonSectionHeadingText}>
                                <Text style={styles.lessonSectionTitle}>Practice Loop</Text>
                                <Text style={styles.lessonSectionSubtitle}>The repeat block that locks the skill in.</Text>
                            </View>
                        </View>
                        {selectedLesson.practiceLoop.map((item, index) => (
                            <View key={`loop-${index}`} style={styles.lessonListRow}>
                                <View style={[styles.lessonListDot, { backgroundColor: lessonAccent }]} />
                                <Text style={styles.lessonBullet}>{item}</Text>
                            </View>
                        ))}
                    </View>
                    </Animated.View>

                    <Animated.View
                        key={`lesson-coach-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(400).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                    <View style={styles.lessonSectionCard}>
                        <View style={styles.lessonSectionHeading}>
                            <View style={[styles.lessonSectionIcon, { backgroundColor: withOpacity(lessonAccent, 0.14) }]}>
                                <Text style={[styles.lessonSectionIconText, { color: lessonAccent }]}>CN</Text>
                            </View>
                            <View style={styles.lessonSectionHeadingText}>
                                <Text style={styles.lessonSectionTitle}>Coach Notes</Text>
                                <Text style={styles.lessonSectionSubtitle}>Simple reminders that keep the session musical.</Text>
                            </View>
                        </View>
                        {selectedLesson.coachNotes.map((item, index) => (
                            <View key={`coach-${index}`} style={styles.lessonListRow}>
                                <View style={[styles.lessonListDot, { backgroundColor: lessonAccent }]} />
                                <Text style={styles.lessonBullet}>{item}</Text>
                            </View>
                        ))}
                    </View>
                    </Animated.View>

                    <Animated.View
                        key={`lesson-checkpoint-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(440).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                        <View style={styles.quizExplanationCard}>
                            <Text style={styles.noteLabel}>CHECKPOINT</Text>
                            <Text style={styles.noteText}>{selectedLesson.checkpoint}</Text>
                        </View>
                    </Animated.View>

                    <Animated.View
                        key={`lesson-action-${selectedLesson.id}`}
                        entering={lessonAnimationsEnabled
                            ? FadeInDown.delay(480).springify().damping(18).stiffness(185)
                            : undefined}
                    >
                        <View style={styles.lessonActionCard}>
                            <View style={styles.lessonActionTextWrap}>
                                <Text style={styles.lessonActionTitle}>
                                    {isLessonCompleted ? 'Lesson completed' : 'Lock this lesson in'}
                                </Text>
                                <Text style={styles.lessonActionBody}>
                                    {isLessonCompleted
                                        ? 'This lesson already counts toward your streak, badges, and leaderboard profile.'
                                        : 'Mark this one done when you finish the full loop and checkpoint cleanly.'}
                                </Text>
                                {lessonActionText && <Text style={styles.lessonActionFeedback}>{lessonActionText}</Text>}
                            </View>

                            <TouchableOpacity
                                style={[styles.lessonCompleteButton, isLessonCompleted && styles.lessonCompleteButtonDone]}
                                onPress={() => void markLessonComplete()}
                            >
                                <Text style={[styles.lessonCompleteButtonText, isLessonCompleted && styles.lessonCompleteButtonTextDone]}>
                                    {isLessonCompleted ? 'Completed' : 'Complete Lesson'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </View>
            )}

            {mode === 'quiz' && (
                <View style={styles.card}>
                    <View style={styles.cardTopRow}>
                        <Text style={styles.cardTitle}>Theory Master Quiz</Text>
                        <View style={[styles.diffPill, { borderColor: quizDifficultyColor }]}>
                            <Text style={[styles.diffPillText, { color: quizDifficultyColor }]}>
                                {currentQuizQuestion.difficulty.toUpperCase()}
                            </Text>
                        </View>
                    </View>

                    <Text style={styles.cardInstruction}>{currentQuizQuestion.question}</Text>
                    <Text style={styles.helperText}>
                        {currentQuizQuestion.topic} • 50-question bank • +{currentQuizQuestion.xpReward} XP
                    </Text>

                    <View style={styles.audioOptionsWrap}>
                        {currentQuizQuestion.options.map((option, index) => {
                            const showCorrect = quizSelectedIndex !== null && index === currentQuizQuestion.correctIndex;
                            const showWrong = quizSelectedIndex === index && index !== currentQuizQuestion.correctIndex;

                            return (
                                <TouchableOpacity
                                    key={option}
                                    style={[
                                        styles.audioOption,
                                        showCorrect && styles.audioOptionCorrect,
                                        showWrong && styles.audioOptionWrong,
                                    ]}
                                    onPress={() => answerTheoryQuiz(index)}
                                    disabled={quizSelectedIndex !== null}
                                >
                                    <Text style={styles.audioOptionText}>{option}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text
                        style={[
                            styles.puzzleFeedbackText,
                            { color: quizFeedback?.includes('Correct') ? COLORS.success : COLORS.danger },
                        ]}
                    >
                        {quizFeedback || 'Pick the best answer.'}
                    </Text>

                    {quizSelectedIndex !== null && showQuizExplanation && (
                        <View style={styles.quizExplanationCard}>
                            <Text style={styles.noteLabel}>WHY THIS WORKS</Text>
                            <Text style={styles.noteText}>{currentQuizQuestion.explanation}</Text>
                        </View>
                    )}

                    <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.primaryBtn} onPress={nextTheoryQuiz}>
                            <Text style={styles.primaryBtnText}>{quizSelectedIndex === null ? 'Skip Question' : 'Next Question'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {mode === 'quick' && (
                <>
                    <Text
                        style={[
                            styles.feedbackText,
                            { color: quickFeedback?.includes('Wrong') ? COLORS.danger : COLORS.primary },
                        ]}
                    >
                        {quickFeedback || 'Which note is this?'}
                    </Text>

                    <View style={styles.quickStaffContainer}>
                        {[0, 1, 2, 3, 4].map((i) => (
                            <View key={i} style={[styles.staffLine, { top: BOTTOM_LINE_Y - i * STAFF_HEIGHT }]} />
                        ))}

                        <Text style={styles.trebleClef}>🎼</Text>

                        <View
                            style={[
                                styles.quickNoteHead,
                                {
                                    top: quickNoteTop - STAFF_HEIGHT / 2 + 1,
                                    backgroundColor: noteColor,
                                    borderColor: noteColor,
                                },
                            ]}
                        >
                            <View style={[styles.quickNoteStem, { backgroundColor: noteColor }]} />
                        </View>
                    </View>

                    <View style={styles.pianoContainer}>
                        {PIANO_KEYS.map((key) => (
                            <View key={key.note} style={{ flex: 1, position: 'relative' }}>
                                <TouchableOpacity
                                    style={styles.whiteKey}
                                    onPress={() => handleQuickPress(key.note)}
                                    activeOpacity={0.85}
                                >
                                    <View style={{ alignItems: 'center' }}>
                                        <Text style={styles.keyLabelBold}>{key.note}</Text>
                                        <Text style={styles.keyLabelFaint}>{key.label}</Text>
                                    </View>
                                </TouchableOpacity>
                                {key.hasBlack && <View style={styles.blackKey} />}
                            </View>
                        ))}
                    </View>
                </>
            )}

            {mode === 'puzzle' && (
                <View style={styles.card}>
                    <View style={styles.cardTopRow}>
                        <Text style={styles.cardTitle}>{currentPuzzle.title}</Text>
                        <View style={[styles.diffPill, { borderColor: difficultyColor }]}>
                            <Text style={[styles.diffPillText, { color: difficultyColor }]}>{difficultyLabel}</Text>
                        </View>
                    </View>

                    <Text style={styles.cardInstruction}>{currentPuzzle.instruction}</Text>
                    <Text style={styles.rewardText}>Reward: +{currentPuzzle.xpReward} XP</Text>

                    {currentPuzzle.kind === 'order' ? (
                        <>
                            <Text style={styles.helperText}>Drag each note and drop it on the staff slot.</Text>

                            <View
                                ref={staffRef}
                                style={styles.puzzleStaffContainer}
                                onLayout={() => {
                                    setTimeout(measureStaffInWindow, 0);
                                }}
                            >
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <View key={i} style={[styles.staffLine, { top: BOTTOM_LINE_Y - i * STAFF_HEIGHT }]} />
                                ))}
                                <Text style={styles.trebleClef}>🎼</Text>

                                {currentPuzzle.answer.map((targetNote, index) => {
                                    const targetPos = noteToStaffPosition(targetNote);
                                    const top = BOTTOM_LINE_Y - targetPos * (STAFF_HEIGHT / 2) - 12;
                                    const left = 58 + slotStep * index - 17;
                                    const currentValue = orderSlots[index];

                                    return (
                                        <Pressable
                                            key={`slot-${index}`}
                                            style={[
                                                styles.dropSlot,
                                                { left, top },
                                                currentValue && styles.dropSlotFilled,
                                            ]}
                                            onPress={() => clearOrderSlot(index)}
                                            onLayout={(event) => {
                                                const layout = event.nativeEvent.layout;
                                                setSlotLayouts((prev) => ({ ...prev, [index]: layout }));
                                            }}
                                        >
                                            <Text style={[styles.dropSlotText, currentValue && styles.dropSlotTextFilled]}>
                                                {currentValue || index + 1}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <View style={styles.dragArea}>
                                {puzzlePool.map((note, index) => {
                                    const isPlaced = orderSlots.includes(note);
                                    const col = index % 4;
                                    const row = Math.floor(index / 4);
                                    const startX = 8 + col * 78;
                                    const startY = 8 + row * 68;

                                    return (
                                        <DraggableNote
                                            key={`${currentPuzzle.id}-${note}`}
                                            note={note}
                                            label={NOTE_LABELS[note] ?? note}
                                            startX={startX}
                                            startY={startY}
                                            resetKey={dragResetKey}
                                            disabled={isPlaced || puzzleSolved}
                                            onDrop={handleDropOnStaff}
                                        />
                                    );
                                })}
                            </View>
                        </>
                    ) : (
                        <>
                            <Text style={styles.sectionTitle}>
                                Select notes: {selectedNotes.length}/{currentPuzzle.answer.length}
                            </Text>
                            <View style={styles.selectPool}>
                                {puzzlePool.map((note) => {
                                    const selected = selectedNotes.includes(note);
                                    return (
                                        <Pressable
                                            key={`${currentPuzzle.id}-${note}`}
                                            style={[styles.selectChip, selected && styles.selectChipActive]}
                                            onPress={() => toggleSelectNote(note)}
                                            disabled={puzzleSolved}
                                        >
                                            <Text style={[styles.selectChipMain, selected && styles.selectChipMainActive]}>{note}</Text>
                                            <Text style={[styles.selectChipSub, selected && styles.selectChipSubActive]}>
                                                {NOTE_LABELS[note] ?? note}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    <Text
                        style={[
                            styles.puzzleFeedbackText,
                            { color: puzzleFeedback?.includes('Great') ? COLORS.success : COLORS.danger },
                        ]}
                    >
                        {puzzleFeedback || 'Solve it, then tap Check Answer.'}
                    </Text>

                    <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.primaryBtn} onPress={checkPuzzle}>
                            <Text style={styles.primaryBtnText}>Check Answer</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.secondaryBtn} onPress={goToNextPuzzle}>
                            <Text style={styles.secondaryBtnText}>Next Puzzle</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {mode === 'audio' && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Chord Recognition</Text>
                    <Text style={styles.cardInstruction}>{currentAudioQuestion.prompt}</Text>

                    <TouchableOpacity style={styles.playChordBtn} onPress={playCurrentChord}>
                        <Text style={styles.playChordBtnText}>{isChordPlaying ? 'Playing...' : 'Play Chord Sound'}</Text>
                    </TouchableOpacity>

                    <View style={styles.audioOptionsWrap}>
                        {currentAudioQuestion.options.map((option) => {
                            const isSelected = audioSelectedOption === option;
                            const isCorrect = option === currentAudioQuestion.correctChord;
                            const showCorrect = !!audioSelectedOption && isCorrect;
                            const showWrong = !!audioSelectedOption && isSelected && !isCorrect;

                            return (
                                <TouchableOpacity
                                    key={option}
                                    style={[
                                        styles.audioOption,
                                        showCorrect && styles.audioOptionCorrect,
                                        showWrong && styles.audioOptionWrong,
                                    ]}
                                    onPress={() => answerAudioQuestion(option)}
                                    disabled={!!audioSelectedOption}
                                >
                                    <Text style={styles.audioOptionText}>{option}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <Text
                        style={[
                            styles.puzzleFeedbackText,
                            { color: audioFeedback?.includes('Correct') ? COLORS.success : COLORS.danger },
                        ]}
                    >
                        {audioFeedback || 'Listen carefully and pick the chord.'}
                    </Text>

                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => void nextAudioQuestion()}>
                        <Text style={styles.secondaryBtnText}>Next Audio Question</Text>
                    </TouchableOpacity>
                </View>
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
    container: {
        flex: 1,
    },
    contentContainer: {
        paddingTop: 56,
        paddingHorizontal: 12,
        paddingBottom: 98,
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
    title: {
        color: COLORS.textStrong,
        fontSize: 32,
        fontWeight: '900',
        marginBottom: 2,
    },
    subTitle: {
        color: COLORS.textDim,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 12,
    },
    modeRow: {
        gap: 8,
        marginBottom: 12,
        paddingRight: 6,
    },
    modeButton: {
        minWidth: 116,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        borderRadius: 20,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: COLORS.panel,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    modeButtonActive: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.panel,
    },
    modeButtonText: {
        color: COLORS.textDim,
        fontWeight: '800',
        fontSize: 12,
    },
    modeButtonTextActive: {
        color: COLORS.textStrong,
    },
    scoreBoard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        borderRadius: 24,
        backgroundColor: COLORS.panelAlt,
        paddingVertical: 14,
        ...SHADOWS.card,
    },
    scoreLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '700',
        textAlign: 'center',
    },
    scoreValue: {
        color: COLORS.textStrong,
        fontSize: 21,
        fontWeight: '900',
        textAlign: 'center',
    },
    feedbackText: {
        textAlign: 'center',
        fontSize: 15,
        marginBottom: 14,
        minHeight: 22,
        fontWeight: '800',
    },
    quickStaffContainer: {
        height: 248,
        marginHorizontal: 8,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        overflow: 'hidden',
        marginBottom: 18,
        ...SHADOWS.card,
    },
    staffLine: {
        position: 'absolute',
        left: 12,
        right: 12,
        height: 2,
        backgroundColor: COLORS.textStrong,
    },
    trebleClef: {
        position: 'absolute',
        left: 18,
        top: 74,
        fontSize: 46,
        color: COLORS.textStrong,
    },
    quickNoteHead: {
        position: 'absolute',
        left: width / 2 - 17,
        width: 26,
        height: 19,
        borderRadius: 10,
        transform: [{ rotate: '-10deg' }],
        zIndex: 10,
    },
    quickNoteStem: {
        position: 'absolute',
        right: 2,
        bottom: 8,
        width: 2,
        height: 38,
    },
    pianoContainer: {
        flexDirection: 'row',
        height: 150,
        marginHorizontal: 4,
        backgroundColor: COLORS.panel,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        padding: 4,
        ...SHADOWS.soft,
    },
    whiteKey: {
        flex: 1,
        backgroundColor: COLORS.panelAlt,
        marginHorizontal: 1,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        justifyContent: 'flex-end',
        paddingBottom: 13,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderColor: COLORS.pixelLine,
    },
    blackKey: {
        position: 'absolute',
        top: 0,
        right: -12,
        width: 24,
        height: '60%',
        backgroundColor: COLORS.textStrong,
        zIndex: 10,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        borderBottomWidth: 1,
        borderColor: COLORS.text,
    },
    keyLabelBold: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '800',
    },
    keyLabelFaint: {
        color: COLORS.textDim,
        fontSize: 10,
    },
    card: {
        backgroundColor: COLORS.panelAlt,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        padding: 16,
        ...SHADOWS.card,
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6,
    },
    cardTitle: {
        color: COLORS.textStrong,
        fontSize: 21,
        fontWeight: '900',
        flex: 1,
    },
    cardInstruction: {
        color: COLORS.text,
        fontSize: 14,
        marginBottom: 6,
    },
    helperText: {
        color: COLORS.textDim,
        fontSize: 12,
        marginBottom: 8,
    },
    lessonCountRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
        marginBottom: 12,
    },
    instrumentButton: {
        flex: 1,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        borderRadius: 20,
        paddingVertical: 10,
        paddingHorizontal: 10,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    instrumentButtonActive: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.panel,
    },
    instrumentButtonText: {
        color: COLORS.textStrong,
        fontSize: 13,
        fontWeight: '900',
    },
    instrumentButtonTextActive: {
        color: COLORS.primary,
    },
    instrumentCountText: {
        color: COLORS.textDim,
        fontSize: 10,
        marginTop: 3,
    },
    instrumentCountTextActive: {
        color: COLORS.text,
    },
    lessonPickerRow: {
        gap: 8,
        paddingBottom: 12,
    },
    lessonPickerChip: {
        width: 194,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 18,
        padding: 12,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    lessonPickerChipActive: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.panel,
    },
    lessonPickerNumber: {
        width: 30,
        height: 30,
        borderRadius: 15,
        textAlign: 'center',
        textAlignVertical: 'center',
        backgroundColor: COLORS.panelInset,
        color: COLORS.textStrong,
        fontWeight: '900',
        overflow: 'hidden',
        paddingTop: 6,
    },
    lessonPickerNumberActive: {
        backgroundColor: COLORS.primary,
        color: COLORS.panelAlt,
    },
    lessonPickerTextWrap: {
        flex: 1,
    },
    lessonPickerTitle: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '800',
    },
    lessonPickerTitleActive: {
        color: COLORS.primary,
    },
    lessonPickerMeta: {
        color: COLORS.textDim,
        fontSize: 10,
        marginTop: 4,
    },
    lessonHero: {
        borderRadius: 24,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        padding: 14,
        marginBottom: 12,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    lessonHeroBadge: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 1,
        backgroundColor: COLORS.panelAlt,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lessonHeroBadgeText: {
        fontSize: 24,
        fontWeight: '900',
    },
    lessonHeroBody: {
        flex: 1,
    },
    lessonHeroTopRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
    },
    lessonHeroMain: {
        flex: 1,
    },
    lessonHeroTitle: {
        color: COLORS.textStrong,
        fontSize: 18,
        fontWeight: '900',
    },
    lessonHeroSubtitle: {
        color: COLORS.text,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 4,
    },
    lessonHeroTierPill: {
        borderWidth: 1,
        borderRadius: 999,
        backgroundColor: COLORS.panelAlt,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    lessonHeroTierText: {
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    lessonHeroProgressRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 8,
    },
    lessonHeroProgressText: {
        color: COLORS.textDim,
        fontSize: 11,
        fontWeight: '700',
    },
    lessonProgressRail: {
        height: 8,
        borderRadius: 999,
        backgroundColor: COLORS.panelAlt,
        overflow: 'hidden',
    },
    lessonProgressFill: {
        height: '100%',
        borderRadius: 999,
    },
    lessonStatsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    lessonStatBox: {
        flex: 1,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 10,
        ...SHADOWS.soft,
    },
    lessonStatLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
    },
    lessonStatValue: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '800',
        marginTop: 4,
    },
    lessonHeadline: {
        color: COLORS.textStrong,
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 8,
    },
    lessonBody: {
        color: COLORS.text,
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 10,
    },
    lessonGoalCard: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 18,
        padding: 12,
        marginBottom: 12,
        ...SHADOWS.soft,
    },
    lessonTagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    lessonTag: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    lessonTagText: {
        color: COLORS.primary,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    lessonSectionTitle: {
        color: COLORS.textStrong,
        fontSize: 13,
        fontWeight: '900',
        marginBottom: 6,
        marginTop: 8,
    },
    lessonSectionSubtitle: {
        color: COLORS.textDim,
        fontSize: 11,
        lineHeight: 16,
        marginTop: 2,
    },
    lessonSectionCard: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 20,
        padding: 12,
        marginBottom: 12,
        ...SHADOWS.soft,
    },
    lessonSectionHeading: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        marginBottom: 10,
    },
    lessonSectionIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lessonSectionIconText: {
        fontSize: 11,
        fontWeight: '900',
    },
    lessonSectionHeadingText: {
        flex: 1,
    },
    lessonListRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 8,
    },
    lessonListDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 5,
    },
    lessonBullet: {
        color: COLORS.text,
        fontSize: 12,
        lineHeight: 19,
        marginBottom: 4,
        flex: 1,
    },
    lessonTimelineRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'stretch',
        marginBottom: 8,
    },
    lessonTimelineRail: {
        width: 28,
        alignItems: 'center',
    },
    lessonTimelineDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lessonTimelineDotText: {
        fontSize: 11,
        fontWeight: '900',
    },
    lessonTimelineLine: {
        width: 2,
        flex: 1,
        backgroundColor: COLORS.pixelLine,
        marginTop: 6,
        marginBottom: -2,
    },
    lessonTimelineCard: {
        flex: 1,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    lessonTimelineText: {
        color: COLORS.textStrong,
        fontSize: 12,
        lineHeight: 18,
    },
    lessonActionCard: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 20,
        padding: 12,
        marginBottom: 12,
        ...SHADOWS.soft,
    },
    lessonActionTextWrap: {
        marginBottom: 12,
    },
    lessonActionTitle: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 6,
    },
    lessonActionBody: {
        color: COLORS.text,
        fontSize: 12,
        lineHeight: 18,
    },
    lessonActionFeedback: {
        color: COLORS.primary,
        fontSize: 11,
        fontWeight: '800',
        marginTop: 8,
    },
    lessonCompleteButton: {
        borderRadius: 18,
        backgroundColor: COLORS.primary,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        paddingVertical: 12,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    lessonCompleteButtonDone: {
        backgroundColor: COLORS.panel,
    },
    lessonCompleteButtonText: {
        color: COLORS.panelAlt,
        fontSize: 12,
        fontWeight: '900',
    },
    lessonCompleteButtonTextDone: {
        color: COLORS.primary,
    },
    rewardText: {
        color: COLORS.primary,
        fontWeight: '800',
        marginBottom: 10,
        fontSize: 13,
    },
    diffPill: {
        borderWidth: 1,
        borderRadius: 99,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    diffPillText: {
        fontSize: 11,
        fontWeight: '700',
    },
    puzzleStaffContainer: {
        height: 238,
        borderRadius: 20,
        backgroundColor: COLORS.panelAlt,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        overflow: 'hidden',
        marginBottom: 10,
    },
    dropSlot: {
        position: 'absolute',
        width: 34,
        height: 24,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelInset,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dropSlotFilled: {
        borderColor: COLORS.secondary,
        backgroundColor: 'rgba(78, 168, 222, 0.12)',
    },
    dropSlotText: {
        color: COLORS.textDim,
        fontWeight: '700',
        fontSize: 12,
    },
    dropSlotTextFilled: {
        color: COLORS.textStrong,
    },
    dragArea: {
        position: 'relative',
        height: 150,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelInset,
        marginBottom: 12,
        overflow: 'hidden',
    },
    dragNoteChip: {
        position: 'absolute',
        width: 66,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        paddingVertical: 8,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    dragNoteChipDisabled: {
        opacity: 0.35,
    },
    dragNoteMain: {
        color: COLORS.textStrong,
        fontWeight: '900',
        fontSize: 16,
    },
    dragNoteSub: {
        color: COLORS.textDim,
        fontSize: 10,
        marginTop: 2,
    },
    sectionTitle: {
        color: COLORS.text,
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 8,
    },
    selectPool: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    selectChip: {
        minWidth: 58,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        paddingHorizontal: 10,
        paddingVertical: 8,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    selectChipActive: {
        borderColor: COLORS.primary,
        backgroundColor: 'rgba(116, 0, 184, 0.12)',
    },
    selectChipMain: {
        color: COLORS.textStrong,
        fontWeight: '900',
        fontSize: 15,
    },
    selectChipMainActive: {
        color: COLORS.primary,
    },
    selectChipSub: {
        color: COLORS.textDim,
        fontSize: 10,
    },
    selectChipSubActive: {
        color: COLORS.textStrong,
    },
    puzzleFeedbackText: {
        textAlign: 'center',
        fontSize: 14,
        marginVertical: 10,
        minHeight: 20,
        fontWeight: '700',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
    },
    primaryBtn: {
        flex: 1,
        backgroundColor: COLORS.primary,
        borderRadius: 18,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        ...SHADOWS.soft,
    },
    secondaryBtn: {
        flex: 1,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        paddingVertical: 12,
        alignItems: 'center',
        ...SHADOWS.soft,
    },
    primaryBtnText: {
        color: COLORS.panelAlt,
        fontWeight: '900',
    },
    secondaryBtnText: {
        color: COLORS.textStrong,
        fontWeight: '900',
    },
    playChordBtn: {
        backgroundColor: COLORS.accent,
        borderRadius: 18,
        paddingVertical: 12,
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        ...SHADOWS.soft,
    },
    playChordBtnText: {
        color: COLORS.panelAlt,
        fontWeight: '900',
    },
    audioOptionsWrap: {
        gap: 8,
    },
    quizExplanationCard: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 18,
        padding: 12,
        marginBottom: 10,
        ...SHADOWS.soft,
    },
    noteLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
    },
    noteText: {
        color: COLORS.textStrong,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 6,
    },
    audioOption: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 18,
        paddingVertical: 11,
        paddingHorizontal: 12,
        ...SHADOWS.soft,
    },
    audioOptionCorrect: {
        borderColor: COLORS.success,
        backgroundColor: 'rgba(100, 223, 223, 0.12)',
    },
    audioOptionWrong: {
        borderColor: COLORS.danger,
        backgroundColor: 'rgba(94, 96, 206, 0.12)',
    },
    audioOptionText: {
        color: COLORS.textStrong,
        fontWeight: '700',
        textAlign: 'center',
    },
});
