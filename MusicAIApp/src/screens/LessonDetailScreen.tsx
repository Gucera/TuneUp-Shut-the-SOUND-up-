import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    ImageBackground,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { ResizeMode, Video } from 'expo-av';
import PremiumBackdrop from '../components/PremiumBackdrop';
import PageTransitionView from '../components/PageTransitionView';
import type { LessonsStackParamList } from '../navigation/lessonStack';
import {
    GamificationSnapshot,
    getGamificationSnapshot,
    PracticeActivity,
    rewardPracticeActivity,
} from '../services/gamification';
import { fetchLessonDetail, LessonDetail } from '../services/lessonCatalog';
import { COLORS, PREMIUM_GRADIENT, RADII, SHADOWS } from '../theme';
import { FALLBACK_IMAGE, resolveOptionalImageAsset, resolveVideoAsset } from '../utils/AssetMap';

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

export default function LessonDetailScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<LessonsStackParamList, 'LessonDetail'>>();
    const route = useRoute<RouteProp<LessonsStackParamList, 'LessonDetail'>>();
    const tabBarHeight = useBottomTabBarHeight();
    const lessonId = route.params.lessonId;
    const [lesson, setLesson] = useState<LessonDetail | null>(null);
    const [snapshot, setSnapshot] = useState<GamificationSnapshot | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCompleting, setIsCompleting] = useState(false);
    const [hasVideoError, setHasVideoError] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<Video | null>(null);

    const unloadVideo = useCallback(async () => {
        const activeVideo = videoRef.current;

        if (!activeVideo) {
            return;
        }

        try {
            await activeVideo.stopAsync();
        } catch {
            // The player may already be stopped while we are leaving the screen.
        }

        try {
            await activeVideo.unloadAsync();
        } catch {
            // `expo-av` can reject unloads during quick navigation transitions.
        }
    }, []);

    const handleBackPress = useCallback(() => {
        const stackState = navigation.getState();

        if (navigation.canGoBack() && stackState.index > 0) {
            navigation.goBack();
            return;
        }

        navigation.reset({
            index: 0,
            routes: [{ name: 'LessonLibrary' }],
        });
    }, [navigation]);

    useEffect(() => {
        let isMounted = true;

        const loadLesson = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const [nextLesson, nextSnapshot] = await Promise.all([
                    fetchLessonDetail(lessonId),
                    getGamificationSnapshot(),
                ]);

                if (!isMounted) {
                    return;
                }

                setLesson(nextLesson);
                setSnapshot(nextSnapshot);
            } catch (loadError) {
                console.error('Failed to load lesson detail:', loadError);

                if (isMounted) {
                    setLesson(null);
                    setError('Could not load this lesson from Supabase.');
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        void loadLesson();

        return () => {
            isMounted = false;
        };
    }, [lessonId]);

    useFocusEffect(
        useCallback(() => {
            return () => {
                void unloadVideo();
            };
        }, [unloadVideo]),
    );

    useEffect(() => {
        setHasVideoError(false);
        return () => {
            void unloadVideo();
        };
    }, [lessonId, unloadVideo]);

    const isCompleted = useMemo(() => {
        if (!lesson) {
            return false;
        }

        const completedIds = lesson.category === 'quiz' || lesson.category === 'game'
            ? snapshot?.completedQuizIds
            : snapshot?.completedLessonIds;

        return completedIds?.includes(lesson.id) ?? false;
    }, [lesson, snapshot?.completedLessonIds, snapshot?.completedQuizIds]);

    const imageSource = useMemo(
        () => resolveOptionalImageAsset(lesson?.imageUrl) ?? FALLBACK_IMAGE,
        [lesson?.imageUrl],
    );
    const videoSource = useMemo(
        () => resolveVideoAsset(lesson?.videoUrl),
        [lesson?.videoUrl],
    );
    const hasPlayableVideo = Boolean(videoSource) && !hasVideoError;
    const flowTitle = lesson?.category === 'theory'
        ? 'Theory Breakdown'
        : lesson?.category === 'quiz'
            ? 'Challenge Format'
            : lesson?.category === 'game'
                ? 'How To Play'
                : 'Practice Steps';
    const quizSectionTitle = lesson?.category === 'quiz' ? 'Question Set' : 'Checkpoint Questions';
    const completeButtonText = isCompleted
        ? lesson?.category === 'quiz'
            ? 'Quiz Completed'
            : lesson?.category === 'game'
                ? 'Game Completed'
                : 'Lesson Completed'
        : isCompleting
            ? 'Granting XP...'
            : lesson?.category === 'quiz'
                ? `Finish Quiz • +${lesson?.xpReward ?? 0} XP`
                : lesson?.category === 'game'
                    ? `Finish Game • +${lesson?.xpReward ?? 0} XP`
                    : `Complete Lesson • +${lesson?.xpReward ?? 0} XP`;

    const handleCompleteLesson = async () => {
        if (!lesson || isCompleting || isCompleted) {
            return;
        }

        setIsCompleting(true);

        try {
            const completionActivity: PracticeActivity = lesson.category === 'quiz'
                ? { kind: 'quiz', id: lesson.id }
                : lesson.category === 'game'
                    ? { kind: 'puzzle', id: lesson.id }
                    : {
                        kind: 'lesson',
                        id: lesson.id,
                        instrument: lesson.instrument ?? 'Guitar',
                    };
            const result = await rewardPracticeActivity(lesson.xpReward, completionActivity);

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            setSnapshot(result.snapshot);
        } catch (completionError) {
            console.error('Failed to complete lesson:', completionError);
        } finally {
            setIsCompleting(false);
        }
    };

    return (
        <LinearGradient
            colors={['#130625', '#1c0b36', '#27144f']}
            start={{ x: 0.06, y: 0 }}
            end={{ x: 0.94, y: 1 }}
            style={styles.screen}
        >
            <PremiumBackdrop variant="studio" />
            <PageTransitionView style={styles.screen}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarHeight + 36 }]}
                >
                    <View style={styles.headerRow}>
                        <Pressable
                            hitSlop={12}
                            onPress={handleBackPress}
                            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
                        >
                            <Ionicons name="arrow-back" color="#F7FBFF" size={18} />
                            <Text style={styles.backButtonText}>Back</Text>
                        </Pressable>
                    </View>

                    {isLoading ? (
                        <View style={styles.stateCard}>
                            <ActivityIndicator color={COLORS.mint} size="large" />
                            <Text style={styles.stateTitle}>Loading lesson</Text>
                            <Text style={styles.stateBody}>
                                Fetching the latest lesson content, media, and quiz pack from Supabase.
                            </Text>
                        </View>
                    ) : null}

                    {!isLoading && error ? (
                        <View style={styles.stateCard}>
                            <Text style={styles.stateTitle}>Lesson unavailable</Text>
                            <Text style={styles.stateBody}>{error}</Text>
                        </View>
                    ) : null}

                    {!isLoading && !error && lesson ? (
                        <>
                            <ImageBackground
                                source={imageSource}
                                imageStyle={styles.heroImage}
                                style={styles.heroCard}
                            >
                                <LinearGradient
                                    colors={['rgba(18, 8, 40, 0.16)', 'rgba(39, 14, 76, 0.62)', '#130625']}
                                    locations={[0.08, 0.48, 1]}
                                    start={{ x: 0.16, y: 0 }}
                                    end={{ x: 0.84, y: 1 }}
                                    style={StyleSheet.absoluteFillObject}
                                />
                                <LinearGradient
                                    colors={[withOpacity(PREMIUM_GRADIENT[3], 0.28), withOpacity(PREMIUM_GRADIENT[8], 0.14)]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={StyleSheet.absoluteFillObject}
                                />

                                <Text style={styles.heroEyebrow}>{lesson.courseTitle}</Text>
                                <Text style={styles.heroTitle}>{lesson.title}</Text>
                                <Text style={styles.heroSummary}>{lesson.summary}</Text>

                                <View style={styles.heroMetaRow}>
                                    <View style={styles.metaPill}>
                                        <Text style={styles.metaPillText}>{lesson.categoryLabel}</Text>
                                    </View>
                                    {lesson.instrument ? (
                                        <View style={styles.metaPill}>
                                            <Text style={styles.metaPillText}>{lesson.instrument}</Text>
                                        </View>
                                    ) : null}
                                    <View style={styles.metaPill}>
                                        <Text style={styles.metaPillText}>{lesson.tier}</Text>
                                    </View>
                                    <View style={styles.metaPill}>
                                        <Text style={styles.metaPillText}>{lesson.durationMin} min</Text>
                                    </View>
                                    <View style={styles.metaPill}>
                                        <Text style={styles.metaPillText}>{lesson.xpReward} XP</Text>
                                    </View>
                                </View>

                                <View style={styles.tagRow}>
                                    {lesson.focusTags.map((tag) => (
                                        <View key={tag} style={styles.tagPill}>
                                            <Text style={styles.tagText}>{tag}</Text>
                                        </View>
                                    ))}
                                </View>
                            </ImageBackground>

                            <View style={styles.mediaSection}>
                                <View style={styles.mediaHeaderRow}>
                                    <View>
                                        <Text style={styles.sectionEyebrow}>Lesson Media</Text>
                                        <Text style={styles.sectionTitle}>Premium Preview</Text>
                                    </View>
                                    <View style={styles.mediaBadge}>
                                        <Text style={styles.mediaBadgeText}>
                                            {hasPlayableVideo ? 'Bundled Video' : 'Artwork Fallback'}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.videoFrame}>
                                    {hasPlayableVideo ? (
                                        <Video
                                            ref={videoRef}
                                            key={`${lesson.id}-video`}
                                            source={videoSource!}
                                            style={styles.video}
                                            resizeMode={ResizeMode.COVER}
                                            useNativeControls
                                            onError={() => setHasVideoError(true)}
                                        />
                                    ) : (
                                        <ImageBackground
                                            source={imageSource}
                                            imageStyle={styles.videoFallbackImage}
                                            style={styles.videoFallback}
                                        >
                                            <LinearGradient
                                                colors={['rgba(14, 8, 31, 0.18)', 'rgba(16, 9, 39, 0.62)', '#130625']}
                                                locations={[0.08, 0.48, 1]}
                                                start={{ x: 0.18, y: 0 }}
                                                end={{ x: 0.82, y: 1 }}
                                                style={StyleSheet.absoluteFillObject}
                                            />
                                            <View style={styles.videoFallbackCopy}>
                                                <Ionicons name="play-circle-outline" size={40} color="#80ffdb" />
                                                <Text style={styles.videoFallbackTitle}>Premium lesson preview</Text>
                                                <Text style={styles.videoFallbackBody}>
                                                    This lesson is ready for local video playback. If the clip key is missing, the artwork still keeps the page polished.
                                                </Text>
                                            </View>
                                        </ImageBackground>
                                    )}
                                </View>

                                <Text style={styles.mediaCaption}>
                                    Local media is resolved through the asset map, so Supabase only stores string keys and the UI still fails gracefully.
                                </Text>
                            </View>

                            <View style={styles.sectionCard}>
                                <Text style={styles.sectionEyebrow}>Guided Flow</Text>
                                <Text style={styles.sectionTitle}>{flowTitle}</Text>
                                <View style={styles.stepList}>
                                    {lesson.steps.map((step, index) => (
                                        <View key={`${lesson.id}-step-${index + 1}`} style={styles.stepRow}>
                                            <LinearGradient
                                                colors={[PREMIUM_GRADIENT[index % PREMIUM_GRADIENT.length], PREMIUM_GRADIENT[(index + 3) % PREMIUM_GRADIENT.length]]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={styles.stepBadge}
                                            >
                                                <Text style={styles.stepBadgeText}>{index + 1}</Text>
                                            </LinearGradient>
                                            <Text style={styles.stepText}>{step}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>

                            <View style={styles.sectionCard}>
                                <Text style={styles.sectionEyebrow}>Quiz Pack</Text>
                                <Text style={styles.sectionTitle}>{quizSectionTitle}</Text>
                                {lesson.quizzes.length === 0 ? (
                                    <Text style={styles.emptyQuizText}>
                                        This lesson does not have a live quiz yet. The lesson body is ready, and quiz rows can be added in Supabase at any time.
                                    </Text>
                                ) : (
                                    <View style={styles.quizList}>
                                        {lesson.quizzes.map((quiz, quizIndex) => (
                                            <View key={quiz.id} style={styles.quizCard}>
                                                <Text style={styles.quizIndex}>Question {quizIndex + 1}</Text>
                                                <Text style={styles.quizQuestion}>{quiz.question}</Text>
                                                <View style={styles.quizOptions}>
                                                    {quiz.options.map((option, optionIndex) => {
                                                        const isCorrect = optionIndex === quiz.correctOptionIndex;

                                                        return (
                                                            <View
                                                                key={`${quiz.id}-option-${optionIndex}`}
                                                                style={[
                                                                    styles.quizOption,
                                                                    isCorrect && styles.quizOptionCorrect,
                                                                ]}
                                                            >
                                                                <Text style={[styles.quizOptionLabel, isCorrect && styles.quizOptionLabelCorrect]}>
                                                                    {String.fromCharCode(65 + optionIndex)}
                                                                </Text>
                                                                <Text style={[styles.quizOptionText, isCorrect && styles.quizOptionTextCorrect]}>
                                                                    {option}
                                                                </Text>
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                                {quiz.explanation ? (
                                                    <Text style={styles.quizExplanation}>{quiz.explanation}</Text>
                                                ) : null}
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>

                            <Pressable
                                disabled={isCompleting || isCompleted}
                                onPress={() => void handleCompleteLesson()}
                                style={({ pressed }) => [
                                    styles.completeButtonWrap,
                                    pressed && !isCompleted && styles.completeButtonWrapPressed,
                                    (isCompleting || isCompleted) && styles.completeButtonWrapDisabled,
                                ]}
                            >
                                <LinearGradient
                                    colors={isCompleted
                                        ? ['#3d5a7a', '#4977a8']
                                        : ['#7400b8', '#5390d9', '#80ffdb']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.completeButton}
                                >
                                    {isCompleting ? <ActivityIndicator color="#F9FDFF" /> : null}
                                    <Text style={styles.completeButtonText}>
                                        {completeButtonText}
                                    </Text>
                                </LinearGradient>
                            </Pressable>
                        </>
                    ) : null}
                </ScrollView>
            </PageTransitionView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    contentContainer: {
        paddingTop: 18,
        paddingHorizontal: 16,
        gap: 18,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(16, 13, 37, 0.68)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    backButtonPressed: {
        transform: [{ scale: 0.985 }],
    },
    backButtonText: {
        color: '#F7FBFF',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.4,
    },
    stateCard: {
        borderRadius: RADII.l,
        paddingHorizontal: 22,
        paddingVertical: 28,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(12, 9, 30, 0.62)',
        alignItems: 'center',
        gap: 10,
        ...SHADOWS.card,
    },
    stateTitle: {
        color: '#F8FCFF',
        fontSize: 20,
        fontWeight: '800',
        textAlign: 'center',
    },
    stateBody: {
        color: 'rgba(225,238,255,0.78)',
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
    },
    heroCard: {
        minHeight: 294,
        borderRadius: 30,
        overflow: 'hidden',
        paddingHorizontal: 20,
        paddingVertical: 22,
        gap: 14,
        justifyContent: 'flex-end',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        backgroundColor: '#130625',
        ...SHADOWS.card,
    },
    heroImage: {
        borderRadius: 30,
    },
    heroEyebrow: {
        color: '#DFFBFF',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1.8,
        textTransform: 'uppercase',
    },
    heroTitle: {
        color: '#FFFFFF',
        fontSize: 30,
        lineHeight: 34,
        fontWeight: '900',
        letterSpacing: -0.6,
    },
    heroSummary: {
        color: 'rgba(248,252,255,0.9)',
        fontSize: 15,
        lineHeight: 23,
    },
    heroMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    metaPill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(12, 13, 29, 0.22)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    metaPillText: {
        color: '#F9FDFF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tagPill: {
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(10, 15, 32, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    tagText: {
        color: '#F4FBFF',
        fontSize: 11,
        fontWeight: '700',
    },
    mediaSection: {
        borderRadius: 28,
        paddingHorizontal: 18,
        paddingVertical: 20,
        gap: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(11, 8, 26, 0.62)',
        ...SHADOWS.soft,
    },
    mediaHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    mediaBadge: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(100, 223, 223, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(128,255,219,0.26)',
    },
    mediaBadgeText: {
        color: '#80ffdb',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    videoFrame: {
        height: 232,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#130625',
        borderWidth: 1,
        borderColor: 'rgba(100, 223, 223, 0.28)',
        shadowColor: '#64dfdf',
        shadowOpacity: 0.24,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 18,
    },
    video: {
        width: '100%',
        height: '100%',
        backgroundColor: '#130625',
    },
    videoFallback: {
        flex: 1,
        justifyContent: 'center',
    },
    videoFallbackImage: {
        borderRadius: 24,
    },
    videoFallbackCopy: {
        paddingHorizontal: 22,
        gap: 8,
        alignItems: 'flex-start',
    },
    videoFallbackTitle: {
        color: '#F8FCFF',
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    videoFallbackBody: {
        color: 'rgba(232,243,255,0.86)',
        fontSize: 14,
        lineHeight: 21,
        maxWidth: '82%',
    },
    mediaCaption: {
        color: 'rgba(225,238,255,0.74)',
        fontSize: 13,
        lineHeight: 20,
    },
    sectionCard: {
        borderRadius: 28,
        paddingHorizontal: 18,
        paddingVertical: 20,
        gap: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(11, 8, 26, 0.62)',
        ...SHADOWS.soft,
    },
    sectionEyebrow: {
        color: '#95E9FF',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    sectionTitle: {
        color: '#F6FBFF',
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    stepList: {
        gap: 12,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    stepBadge: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    stepBadgeText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '900',
    },
    stepText: {
        flex: 1,
        color: '#E7F3FF',
        fontSize: 15,
        lineHeight: 23,
    },
    quizList: {
        gap: 14,
    },
    quizCard: {
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: 22,
        backgroundColor: withOpacity(COLORS.deepSurfaceAlt, 0.74),
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    quizIndex: {
        color: '#8DE7FF',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    quizQuestion: {
        color: '#F8FCFF',
        fontSize: 18,
        fontWeight: '800',
        lineHeight: 24,
    },
    quizOptions: {
        gap: 10,
    },
    quizOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(15, 12, 33, 0.6)',
    },
    quizOptionCorrect: {
        borderColor: 'rgba(128,255,219,0.42)',
        backgroundColor: 'rgba(17, 48, 45, 0.32)',
    },
    quizOptionLabel: {
        width: 28,
        color: '#B7D1FF',
        fontSize: 14,
        fontWeight: '900',
    },
    quizOptionLabelCorrect: {
        color: '#80ffdb',
    },
    quizOptionText: {
        flex: 1,
        color: '#E6F2FF',
        fontSize: 14,
        lineHeight: 20,
    },
    quizOptionTextCorrect: {
        color: '#F6FFFC',
    },
    quizExplanation: {
        color: 'rgba(211,232,255,0.76)',
        fontSize: 13,
        lineHeight: 20,
    },
    emptyQuizText: {
        color: 'rgba(225,238,255,0.74)',
        fontSize: 14,
        lineHeight: 22,
    },
    completeButtonWrap: {
        borderRadius: 999,
        overflow: 'hidden',
    },
    completeButtonWrapPressed: {
        transform: [{ scale: 0.985 }],
    },
    completeButtonWrapDisabled: {
        opacity: 0.86,
    },
    completeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 20,
        paddingVertical: 17,
        borderRadius: 999,
        ...SHADOWS.card,
    },
    completeButtonText: {
        color: '#F9FDFF',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
});
