import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import PageTransitionView from '../components/PageTransitionView';
import PremiumBackdrop from '../components/PremiumBackdrop';
import InstrumentCarousel, { InstrumentCarouselItem } from '../components/InstrumentCarousel';
import LessonList from '../components/LessonList';
import { LessonInstrument, LESSON_PACK_COUNTS } from '../data/lessonLibrary';
import type { LessonsStackParamList } from '../navigation/lessonStack';
import { GamificationSnapshot, getGamificationSnapshot } from '../services/gamification';
import {
    fetchLessonCatalog,
    LessonCatalogItem,
    LessonCategory,
} from '../services/lessonCatalog';
import type { AssetImageKey } from '../utils/AssetMap';
import { COLORS, PREMIUM_GRADIENT, RADII, SHADOWS } from '../theme';

type LessonsStep = 'instrument_picker' | 'lesson_list';
type LessonPath = LessonInstrument | 'Theory';
type LessonLevelGroup = 'Beginner' | 'Intermediate' | 'Advanced';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface LessonPathContent {
    eyebrow: string;
    subtitle: string;
    listSubtitle: string;
    emptyTitle: string;
    emptyBody: string;
    imageKey: AssetImageKey;
    iconName: IconName;
}

const PRACTICAL_PATHS: LessonInstrument[] = ['Guitar', 'Bass', 'Piano', 'Drums'];
const LEARNING_PATHS: LessonPath[] = [...PRACTICAL_PATHS, 'Theory'];
const THEORY_CATEGORIES: LessonCategory[] = ['theory', 'quiz', 'game'];
const LEVEL_GROUPS: LessonLevelGroup[] = ['Beginner', 'Intermediate', 'Advanced'];

const LESSON_PATH_CONTENT: Record<LessonPath, LessonPathContent> = {
    Guitar: {
        eyebrow: 'Strings',
        subtitle: 'Riffs, chords, timing, and confident first-song progress.',
        listSubtitle: 'Build clean fretting, rhythm control, and musical confidence one focused rep at a time.',
        emptyTitle: 'No guitar lessons yet',
        emptyBody: 'This guitar path is ready, but the live catalog does not have lessons to show right now.',
        imageKey: 'guitar_carousel',
        iconName: 'musical-notes-outline',
    },
    Bass: {
        eyebrow: 'Groove',
        subtitle: 'Pocket, timing, low-end control, and practical bass movement.',
        listSubtitle: 'Train the pocket, note length, and simple movement that keeps a band locked together.',
        emptyTitle: 'No bass lessons yet',
        emptyBody: 'The bass path is being built. Try Guitar, Piano, Drums, or Theory for now.',
        imageKey: 'bass_carousel',
        iconName: 'pulse-outline',
    },
    Piano: {
        eyebrow: 'Keys',
        subtitle: 'Chords, scales, reading, touch, and modern harmony.',
        listSubtitle: 'Move from clean hand position into voicings, inversions, and expressive practice routines.',
        emptyTitle: 'No piano lessons yet',
        emptyBody: 'This piano path is ready, but the live catalog does not have lessons to show right now.',
        imageKey: 'piano_carousel',
        iconName: 'keypad-outline',
    },
    Drums: {
        eyebrow: 'Rhythm',
        subtitle: 'Rudiments, coordination, groove, and reliable time feel.',
        listSubtitle: 'Work through balance, limb coordination, groove shape, and practical rhythm vocabulary.',
        emptyTitle: 'No drum lessons yet',
        emptyBody: 'This drum path is ready, but the live catalog does not have lessons to show right now.',
        imageKey: 'drums_carousel',
        iconName: 'radio-outline',
    },
    Theory: {
        eyebrow: 'Concepts',
        subtitle: 'Notes, intervals, harmony, quizzes, and musician drills.',
        listSubtitle: 'Connect what you play to the theory underneath it with compact explanations and checkpoints.',
        emptyTitle: 'No theory content yet',
        emptyBody: 'Theory, quiz, and game shelves are ready, but the live catalog does not have rows to show yet.',
        imageKey: 'theory_icon_4',
        iconName: 'library-outline',
    },
};

type TheoryScreenProps = NativeStackScreenProps<LessonsStackParamList, 'LessonLibrary'>;

function isPracticalPath(path: LessonPath): path is LessonInstrument {
    return path !== 'Theory';
}

async function fetchLessonsForPath(path: LessonPath): Promise<LessonCatalogItem[]> {
    if (path === 'Theory') {
        const categoryResults = await Promise.all(
            THEORY_CATEGORIES.map((category) => fetchLessonCatalog({ category })),
        );

        return categoryResults
            .flat()
            .sort((left, right) => left.orderIndex - right.orderIndex);
    }

    return fetchLessonCatalog({ category: 'practical', instrument: path });
}

function getStaticPathMeta(path: LessonPath) {
    if (path === 'Theory') {
        return 'Concepts and drills';
    }

    const count = LESSON_PACK_COUNTS[path];
    return count > 0 ? `${count} lessons` : 'Path building';
}

function getLessonLevel(lesson: LessonCatalogItem, index: number, total: number): LessonLevelGroup {
    const tier = lesson.tier.toLowerCase();

    if (tier.includes('beginner')) {
        return 'Beginner';
    }

    if (tier.includes('advanced') || tier.includes('upper')) {
        return 'Advanced';
    }

    if (tier.includes('intermediate')) {
        return 'Intermediate';
    }

    if (index < total / 3) {
        return 'Beginner';
    }

    if (index < (total * 2) / 3) {
        return 'Intermediate';
    }

    return 'Advanced';
}

function groupLessonsByLevel(lessons: LessonCatalogItem[]) {
    const groups: Record<LessonLevelGroup, LessonCatalogItem[]> = {
        Beginner: [],
        Intermediate: [],
        Advanced: [],
    };

    lessons.forEach((lesson, index) => {
        groups[getLessonLevel(lesson, index, lessons.length)].push(lesson);
    });

    return LEVEL_GROUPS
        .map((level) => ({ level, lessons: groups[level] }))
        .filter((group) => group.lessons.length > 0);
}

function formatProgress(completedCount: number, totalCount: number) {
    if (totalCount <= 0) {
        return '0%';
    }

    return `${Math.round((completedCount / totalCount) * 100)}%`;
}

export default function TheoryScreen({ navigation, route }: TheoryScreenProps) {
    const tabBarHeight = useBottomTabBarHeight();
    const routeLessonInstrument = route.params?.lessonInstrument;
    const requestedLessonId = route.params?.selectedLessonId;
    const initialPath = routeLessonInstrument ?? 'Guitar';
    const [lessonsStep, setLessonsStep] = useState<LessonsStep>(
        routeLessonInstrument || requestedLessonId ? 'lesson_list' : 'instrument_picker',
    );
    const [selectedPath, setSelectedPath] = useState<LessonPath>(initialPath);
    const [selectedLessonId, setSelectedLessonId] = useState<string>(requestedLessonId ?? '');
    const [lessonOptions, setLessonOptions] = useState<LessonCatalogItem[]>([]);
    const [snapshot, setSnapshot] = useState<GamificationSnapshot | null>(null);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [isCatalogLoading, setIsCatalogLoading] = useState(true);

    useFocusEffect(
        React.useCallback(() => {
            let isMounted = true;

            const loadSnapshot = async () => {
                try {
                    const nextSnapshot = await getGamificationSnapshot();

                    if (isMounted) {
                        setSnapshot(nextSnapshot);
                    }
                } catch (error) {
                    console.error('Failed to load lesson progress snapshot:', error);
                }
            };

            void loadSnapshot();

            return () => {
                isMounted = false;
            };
        }, []),
    );

    useEffect(() => {
        if (routeLessonInstrument) {
            setSelectedPath(routeLessonInstrument);
            setLessonsStep('lesson_list');
        }

        if (requestedLessonId) {
            setSelectedLessonId(requestedLessonId);
            setLessonsStep('lesson_list');
        }
    }, [requestedLessonId, routeLessonInstrument]);

    useEffect(() => {
        let isMounted = true;

        const loadLessons = async () => {
            setIsCatalogLoading(true);
            setCatalogError(null);

            try {
                const nextLessons = await fetchLessonsForPath(selectedPath);

                if (!isMounted) {
                    return;
                }

                setLessonOptions(nextLessons);
                setSelectedLessonId((currentSelection) => {
                    if (currentSelection && nextLessons.some((lesson) => lesson.id === currentSelection)) {
                        return currentSelection;
                    }

                    if (requestedLessonId && nextLessons.some((lesson) => lesson.id === requestedLessonId)) {
                        return requestedLessonId;
                    }

                    return '';
                });
            } catch (error) {
                console.error('Failed to load lessons:', error);

                if (isMounted) {
                    setLessonOptions([]);
                    setCatalogError('Could not load this learning path.');
                }
            } finally {
                if (isMounted) {
                    setIsCatalogLoading(false);
                }
            }
        };

        void loadLessons();

        return () => {
            isMounted = false;
        };
    }, [requestedLessonId, selectedPath]);

    const completedContentIds = useMemo(() => {
        if (selectedPath === 'Theory') {
            return Array.from(new Set([
                ...(snapshot?.completedLessonIds ?? []),
                ...(snapshot?.completedQuizIds ?? []),
            ]));
        }

        return snapshot?.completedLessonIds ?? [];
    }, [selectedPath, snapshot?.completedLessonIds, snapshot?.completedQuizIds]);

    const completedVisibleLessons = useMemo(
        () => lessonOptions.filter((lesson) => completedContentIds.includes(lesson.id)).length,
        [completedContentIds, lessonOptions],
    );

    const lessonGroups = useMemo(() => groupLessonsByLevel(lessonOptions), [lessonOptions]);
    const selectedPathContent = LESSON_PATH_CONTENT[selectedPath];
    const selectedPathMeta = isCatalogLoading
        ? 'Syncing path...'
        : `${lessonOptions.length} ${lessonOptions.length === 1 ? 'lesson' : 'lessons'}`;
    const pathProgress = formatProgress(completedVisibleLessons, lessonOptions.length);
    const progressFillWidth = lessonOptions.length > 0 && completedVisibleLessons > 0
        ? Math.max(8, (completedVisibleLessons / lessonOptions.length) * 100)
        : 0;

    const instrumentCarouselItems: InstrumentCarouselItem[] = useMemo(() => (
        LEARNING_PATHS.map((path) => ({
            id: path,
            title: path,
            subtitle: LESSON_PATH_CONTENT[path].subtitle,
            eyebrow: LESSON_PATH_CONTENT[path].eyebrow,
            meta: path === selectedPath ? selectedPathMeta : getStaticPathMeta(path),
            ctaLabel: path === selectedPath ? 'View lessons' : 'Focus path',
            assetKey: LESSON_PATH_CONTENT[path].imageKey,
            iconName: LESSON_PATH_CONTENT[path].iconName,
        }))
    ), [selectedPath, selectedPathMeta]);

    const handleSelectPath = (path: LessonPath) => {
        setSelectedPath(path);
        setSelectedLessonId('');
    };

    const handleOpenPath = (item?: InstrumentCarouselItem) => {
        if (item && LEARNING_PATHS.includes(item.id as LessonPath)) {
            handleSelectPath(item.id as LessonPath);
        }

        setLessonsStep('lesson_list');
    };

    const handleChangeInstrument = () => {
        setLessonsStep('instrument_picker');
    };

    const handleOpenLesson = (lessonId: string) => {
        setSelectedLessonId(lessonId);
        navigation.navigate('LessonDetail', { lessonId });
    };

    return (
        <LinearGradient
            colors={['#160721', '#22113a', '#103344']}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.92, y: 1 }}
            style={styles.screen}
        >
            <PremiumBackdrop variant="studio" />
            <PageTransitionView style={styles.screen}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarHeight + 28 }]}
                >
                    <View style={styles.headerBlock}>
                        <View style={styles.headerCopy}>
                            <Text style={styles.headerEyebrow}>Lessons</Text>
                            <Text style={styles.headerTitle}>
                                {lessonsStep === 'instrument_picker' ? 'Choose your path' : `${selectedPath} lessons`}
                            </Text>
                            <Text style={styles.headerBody}>
                                {lessonsStep === 'instrument_picker'
                                    ? 'Pick an instrument path first, then move into focused lessons and guided practice content.'
                                    : selectedPathContent.listSubtitle}
                            </Text>
                        </View>

                        <View style={styles.progressRailCard}>
                            <Text style={styles.progressLabel}>Path progress</Text>
                            <Text style={styles.progressValue}>{pathProgress}</Text>
                            <View style={styles.progressRail}>
                                <View
                                    style={[
                                        styles.progressFill,
                                        { width: `${progressFillWidth}%` },
                                    ]}
                                />
                            </View>
                        </View>
                    </View>

                    {lessonsStep === 'instrument_picker' ? (
                        <View style={styles.pickerSection}>
                            <InstrumentCarousel
                                items={instrumentCarouselItems}
                                selectedId={selectedPath}
                                onSelect={(item) => handleSelectPath(item.id as LessonPath)}
                                onOpen={handleOpenPath}
                            />

                            <LinearGradient
                                colors={['rgba(27, 17, 55, 0.92)', 'rgba(14, 42, 52, 0.84)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.pathPreviewCard}
                            >
                                <View style={styles.pathPreviewHeader}>
                                    <View style={styles.pathPreviewIcon}>
                                        <Ionicons name={selectedPathContent.iconName} size={22} color={COLORS.mint} />
                                    </View>
                                    <View style={styles.pathPreviewCopy}>
                                        <Text style={styles.pathPreviewEyebrow}>{selectedPathContent.eyebrow}</Text>
                                        <Text style={styles.pathPreviewTitle}>{selectedPath}</Text>
                                    </View>
                                </View>

                                <Text style={styles.pathPreviewBody}>{selectedPathContent.listSubtitle}</Text>

                                <View style={styles.pathMetaRow}>
                                    <View style={styles.pathMetaPill}>
                                        <Text style={styles.pathMetaValue}>{selectedPathMeta}</Text>
                                        <Text style={styles.pathMetaLabel}>Catalog</Text>
                                    </View>
                                    <View style={styles.pathMetaPill}>
                                        <Text style={styles.pathMetaValue}>{completedVisibleLessons}</Text>
                                        <Text style={styles.pathMetaLabel}>Completed</Text>
                                    </View>
                                    <View style={styles.pathMetaPill}>
                                        <Text style={styles.pathMetaValue}>{snapshot?.streakDays ?? 0}d</Text>
                                        <Text style={styles.pathMetaLabel}>Streak</Text>
                                    </View>
                                </View>

                                <Pressable
                                    onPress={() => handleOpenPath()}
                                    style={({ pressed }) => [
                                        styles.primaryButtonWrap,
                                        pressed && styles.primaryButtonPressed,
                                    ]}
                                >
                                    <LinearGradient
                                        colors={[PREMIUM_GRADIENT[0], PREMIUM_GRADIENT[4], PREMIUM_GRADIENT[8]]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.primaryButton}
                                    >
                                        <Text style={styles.primaryButtonText}>View lessons</Text>
                                        <Ionicons name="arrow-forward" color="#F8FCFF" size={18} />
                                    </LinearGradient>
                                </Pressable>
                            </LinearGradient>
                        </View>
                    ) : (
                        <View style={styles.lessonPathSection}>
                            <View style={styles.pathHeaderRow}>
                                <Pressable
                                    hitSlop={10}
                                    onPress={handleChangeInstrument}
                                    style={({ pressed }) => [styles.changePathButton, pressed && styles.changePathButtonPressed]}
                                >
                                    <Ionicons name="chevron-back" color="#F8FCFF" size={17} />
                                    <Text style={styles.changePathText}>Change path</Text>
                                </Pressable>

                                <View style={styles.pathStatusPill}>
                                    <Text style={styles.pathStatusText}>
                                        {isPracticalPath(selectedPath) ? 'Instrument path' : 'Theory path'}
                                    </Text>
                                </View>
                            </View>

                            <LinearGradient
                                colors={['rgba(116, 0, 184, 0.18)', 'rgba(78, 168, 222, 0.16)', 'rgba(128, 255, 219, 0.1)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.lessonSummaryCard}
                            >
                                <Text style={styles.lessonSummaryEyebrow}>{selectedPathContent.eyebrow}</Text>
                                <Text style={styles.lessonSummaryTitle}>{selectedPath}</Text>
                                <Text style={styles.lessonSummaryBody}>{selectedPathContent.listSubtitle}</Text>

                                <View style={styles.summaryChipRow}>
                                    <View style={styles.summaryChip}>
                                        <Text style={styles.summaryChipText}>{selectedPathMeta}</Text>
                                    </View>
                                    <View style={styles.summaryChip}>
                                        <Text style={styles.summaryChipText}>{completedVisibleLessons} completed</Text>
                                    </View>
                                    <View style={styles.summaryChip}>
                                        <Text style={styles.summaryChipText}>{snapshot?.xp ?? 0} XP</Text>
                                    </View>
                                </View>
                            </LinearGradient>

                            {isCatalogLoading ? (
                                <View style={styles.stateCard}>
                                    <ActivityIndicator color={COLORS.mint} size="large" />
                                    <Text style={styles.stateTitle}>Loading lessons</Text>
                                    <Text style={styles.stateBody}>
                                        Preparing the latest lesson path for {selectedPath}.
                                    </Text>
                                </View>
                            ) : null}

                            {!isCatalogLoading && catalogError ? (
                                <View style={styles.stateCard}>
                                    <Text style={styles.stateTitle}>Lessons unavailable</Text>
                                    <Text style={styles.stateBody}>{catalogError}</Text>
                                    <Pressable
                                        onPress={handleChangeInstrument}
                                        style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                                    >
                                        <Text style={styles.secondaryButtonText}>Back to instruments</Text>
                                    </Pressable>
                                </View>
                            ) : null}

                            {!isCatalogLoading && !catalogError && lessonOptions.length === 0 ? (
                                <View style={styles.stateCard}>
                                    <Text style={styles.stateTitle}>{selectedPathContent.emptyTitle}</Text>
                                    <Text style={styles.stateBody}>{selectedPathContent.emptyBody}</Text>
                                    <Pressable
                                        onPress={handleChangeInstrument}
                                        style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                                    >
                                        <Text style={styles.secondaryButtonText}>Back to instruments</Text>
                                    </Pressable>
                                </View>
                            ) : null}

                            {!isCatalogLoading && !catalogError && lessonOptions.length > 0 ? (
                                <View style={styles.levelStack}>
                                    {lessonGroups.map((group) => (
                                        <View key={group.level} style={styles.levelSection}>
                                            <View style={styles.levelHeaderRow}>
                                                <View>
                                                    <Text style={styles.levelEyebrow}>Level</Text>
                                                    <Text style={styles.levelTitle}>{group.level}</Text>
                                                </View>
                                                <Text style={styles.levelCount}>{group.lessons.length} lessons</Text>
                                            </View>

                                            <LessonList
                                                lessons={group.lessons}
                                                selectedLessonId={selectedLessonId}
                                                onSelectLesson={handleOpenLesson}
                                                completedLessonIds={completedContentIds}
                                            />
                                        </View>
                                    ))}
                                </View>
                            ) : null}
                        </View>
                    )}
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
        paddingTop: 20,
        paddingHorizontal: 16,
        gap: 18,
    },
    headerBlock: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 14,
    },
    headerCopy: {
        flex: 1,
        gap: 7,
    },
    headerEyebrow: {
        color: 'rgba(128,255,219,0.88)',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    headerTitle: {
        color: '#F8FCFF',
        fontSize: 31,
        lineHeight: 36,
        fontWeight: '900',
    },
    headerBody: {
        color: 'rgba(226,238,255,0.78)',
        fontSize: 14,
        lineHeight: 21,
    },
    progressRailCard: {
        width: 104,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(14, 10, 33, 0.62)',
        gap: 7,
        ...SHADOWS.soft,
    },
    progressLabel: {
        color: 'rgba(228,240,255,0.7)',
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    progressValue: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '900',
    },
    progressRail: {
        height: 6,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    progressFill: {
        height: '100%',
        borderRadius: 999,
        backgroundColor: COLORS.mint,
    },
    pickerSection: {
        gap: 18,
    },
    pathPreviewCard: {
        borderRadius: RADII.l,
        paddingHorizontal: 20,
        paddingVertical: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.13)',
        gap: 16,
        ...SHADOWS.card,
    },
    pathPreviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    pathPreviewIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(128,255,219,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(128,255,219,0.24)',
    },
    pathPreviewCopy: {
        flex: 1,
        gap: 2,
    },
    pathPreviewEyebrow: {
        color: COLORS.mint,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    pathPreviewTitle: {
        color: '#FFFFFF',
        fontSize: 25,
        fontWeight: '900',
    },
    pathPreviewBody: {
        color: 'rgba(238,247,255,0.86)',
        fontSize: 14,
        lineHeight: 21,
    },
    pathMetaRow: {
        flexDirection: 'row',
        gap: 10,
    },
    pathMetaPill: {
        flex: 1,
        minHeight: 64,
        justifyContent: 'center',
        paddingHorizontal: 11,
        paddingVertical: 10,
        borderRadius: 18,
        backgroundColor: 'rgba(13, 10, 31, 0.46)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        gap: 3,
    },
    pathMetaValue: {
        color: '#F8FCFF',
        fontSize: 15,
        fontWeight: '900',
    },
    pathMetaLabel: {
        color: 'rgba(225,238,255,0.64)',
        fontSize: 11,
        fontWeight: '700',
    },
    primaryButtonWrap: {
        borderRadius: 999,
        overflow: 'hidden',
    },
    primaryButtonPressed: {
        transform: [{ scale: 0.985 }],
    },
    primaryButton: {
        minHeight: 52,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '900',
    },
    lessonPathSection: {
        gap: 16,
    },
    pathHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    changePathButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 13,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(16, 13, 37, 0.68)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    changePathButtonPressed: {
        transform: [{ scale: 0.985 }],
    },
    changePathText: {
        color: '#F7FBFF',
        fontSize: 13,
        fontWeight: '800',
    },
    pathStatusPill: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: 'rgba(128,255,219,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(128,255,219,0.22)',
    },
    pathStatusText: {
        color: COLORS.mint,
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    lessonSummaryCard: {
        borderRadius: RADII.l,
        paddingHorizontal: 20,
        paddingVertical: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        gap: 9,
        ...SHADOWS.card,
    },
    lessonSummaryEyebrow: {
        color: COLORS.mint,
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
    },
    lessonSummaryTitle: {
        color: '#FFFFFF',
        fontSize: 26,
        fontWeight: '900',
    },
    lessonSummaryBody: {
        color: 'rgba(244,248,255,0.86)',
        fontSize: 14,
        lineHeight: 21,
    },
    summaryChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingTop: 3,
    },
    summaryChip: {
        paddingHorizontal: 11,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(9, 13, 30, 0.26)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    summaryChipText: {
        color: '#F4FBFF',
        fontSize: 12,
        fontWeight: '800',
    },
    levelStack: {
        gap: 18,
    },
    levelSection: {
        gap: 12,
    },
    levelHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    levelEyebrow: {
        color: 'rgba(128,255,219,0.82)',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    levelTitle: {
        color: '#F8FCFF',
        fontSize: 22,
        fontWeight: '900',
    },
    levelCount: {
        color: 'rgba(225,238,255,0.7)',
        fontSize: 12,
        fontWeight: '800',
    },
    stateCard: {
        borderRadius: RADII.l,
        paddingHorizontal: 20,
        paddingVertical: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(15, 10, 35, 0.52)',
        alignItems: 'center',
        gap: 10,
        ...SHADOWS.card,
    },
    stateTitle: {
        color: '#F7FBFF',
        fontSize: 20,
        fontWeight: '800',
        textAlign: 'center',
    },
    stateBody: {
        color: 'rgba(223,237,255,0.76)',
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
    },
    secondaryButton: {
        marginTop: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(128,255,219,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(128,255,219,0.24)',
    },
    secondaryButtonPressed: {
        transform: [{ scale: 0.985 }],
    },
    secondaryButtonText: {
        color: COLORS.mint,
        fontSize: 13,
        fontWeight: '900',
    },
});
