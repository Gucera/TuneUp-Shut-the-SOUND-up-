import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import PageTransitionView from '../components/PageTransitionView';
import PremiumBackdrop from '../components/PremiumBackdrop';
import InstrumentCarousel from '../components/InstrumentCarousel';
import LessonList from '../components/LessonList';
import { LessonInstrument } from '../data/lessonLibrary';
import type { LessonsStackParamList } from '../navigation/lessonStack';
import { GamificationSnapshot, getGamificationSnapshot } from '../services/gamification';
import {
    fetchLessonCatalog,
    LessonCatalogItem,
    LessonCategory,
    LESSON_CATEGORY_LABELS,
} from '../services/lessonCatalog';
import type { AssetImageKey } from '../utils/AssetMap';
import { COLORS, PREMIUM_GRADIENT, RADII, SHADOWS } from '../theme';

const LESSON_INSTRUMENT_CONTENT: Record<LessonInstrument, {
    eyebrow: string;
    subtitle: string;
    imageKey: AssetImageKey;
    iconName: 'musical-notes-outline' | 'keypad-outline' | 'radio-outline';
}> = {
    Guitar: {
        eyebrow: 'Strings',
        subtitle: 'Dynamic Supabase lessons for clean chord work, rhythm control, and confident first-song progress.',
        imageKey: 'guitar_carousel',
        iconName: 'musical-notes-outline',
    },
    Piano: {
        eyebrow: 'Keys',
        subtitle: 'Live lesson packs for harmony, touch, and flow once your piano catalog lands in Supabase.',
        imageKey: 'piano_carousel',
        iconName: 'keypad-outline',
    },
    Drums: {
        eyebrow: 'Rhythm',
        subtitle: 'Groove and time-feel lessons with room for drum-specific catalog drops from the database.',
        imageKey: 'drums_carousel',
        iconName: 'radio-outline',
    },
};

type TheoryScreenProps = NativeStackScreenProps<LessonsStackParamList, 'LessonLibrary'>;

const CATEGORY_CONTENT: Record<LessonCategory, {
    eyebrow: string;
    title: string;
    subtitle: string;
    helper: string;
    emptyTitle: string;
    emptyBody: string;
}> = {
    practical: {
        eyebrow: 'Hands-On',
        title: 'Practical Lessons',
        subtitle: 'Instrument-specific coaching for technique, groove, speed, and clean reps that translate straight into practice time.',
        helper: 'Instrument filters stay visible here so the live catalog can pivot between guitar, piano, and drums.',
        emptyTitle: 'No practical lessons yet',
        emptyBody: 'This instrument tab is connected to Supabase, but there are no practical lesson rows for it yet.',
    },
    theory: {
        eyebrow: 'Concepts',
        title: 'Theory Pack',
        subtitle: 'Rich theory modules, premium breakdowns, and visual explanations loaded dynamically from Supabase.',
        helper: 'Theory lessons ignore the instrument carousel so you can browse general musicianship content in one place.',
        emptyTitle: 'No theory lessons yet',
        emptyBody: 'Theory content is wired up, but Supabase does not have theory rows for this category yet.',
    },
    quiz: {
        eyebrow: 'Challenge',
        title: 'Quiz Packs',
        subtitle: 'Standalone quiz sets with question banks that can ship independently from the app release cycle.',
        helper: 'Quiz entries are fetched as their own category and can show multi-question packs from the related quizzes table.',
        emptyTitle: 'No quiz packs yet',
        emptyBody: 'This quiz category is live, but there are no standalone quiz lessons in Supabase yet.',
    },
    game: {
        eyebrow: 'Play',
        title: 'Games & Puzzles',
        subtitle: 'Interactive training formats like ear drills, speed runs, and rhythm puzzles now live beside the core academy.',
        helper: 'Game entries share the same premium layout, but they pull category-specific instructions from Supabase.',
        emptyTitle: 'No games yet',
        emptyBody: 'The games shelf is ready, but Supabase does not have any game rows to render yet.',
    },
};

export default function TheoryScreen({ navigation, route }: TheoryScreenProps) {
    const tabBarHeight = useBottomTabBarHeight();
    const [snapshot, setSnapshot] = useState<GamificationSnapshot | null>(null);
    const routeLessonInstrument = route.params?.lessonInstrument;
    const requestedLessonId = route.params?.selectedLessonId;
    const [selectedCategory, setSelectedCategory] = useState<LessonCategory>('practical');
    const [lessonInstrument, setLessonInstrument] = useState<LessonInstrument>(routeLessonInstrument ?? 'Guitar');
    const [selectedLessonId, setSelectedLessonId] = useState<string>(requestedLessonId ?? '');
    const [lessonOptions, setLessonOptions] = useState<LessonCatalogItem[]>([]);
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
                    console.error('Failed to load lesson catalog snapshot:', error);
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
            setSelectedCategory('practical');
            setLessonInstrument(routeLessonInstrument);
        }

        if (requestedLessonId) {
            setSelectedLessonId(requestedLessonId);
        }
    }, [requestedLessonId, routeLessonInstrument]);

    useEffect(() => {
        let isMounted = true;

        const loadLessons = async () => {
            setIsCatalogLoading(true);
            setCatalogError(null);

            try {
                const nextLessons = await fetchLessonCatalog({
                    category: selectedCategory,
                    instrument: selectedCategory === 'practical' ? lessonInstrument : undefined,
                });

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

                    return nextLessons[0]?.id ?? '';
                });
            } catch (error) {
                console.error('Failed to load lessons from Supabase:', error);

                if (isMounted) {
                    setLessonOptions([]);
                    setCatalogError('Could not load the live lesson catalog.');
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
    }, [lessonInstrument, requestedLessonId, selectedCategory]);

    const instrumentCarouselItems = useMemo(() => (
        (Object.keys(LESSON_INSTRUMENT_CONTENT) as LessonInstrument[]).map((instrument) => {
            const isCurrentInstrument = instrument === lessonInstrument;
            const liveCount = isCurrentInstrument ? lessonOptions.length : null;
            const meta = isCatalogLoading && isCurrentInstrument
                ? 'Syncing live catalog...'
                : `${liveCount ?? 0} live lessons`;

            return {
                id: instrument,
                title: instrument,
                subtitle: LESSON_INSTRUMENT_CONTENT[instrument].subtitle,
                eyebrow: LESSON_INSTRUMENT_CONTENT[instrument].eyebrow,
                meta,
                assetKey: LESSON_INSTRUMENT_CONTENT[instrument].imageKey,
                iconName: LESSON_INSTRUMENT_CONTENT[instrument].iconName,
            };
        })
    ), [isCatalogLoading, lessonInstrument, lessonOptions.length]);

    const categorySummary = CATEGORY_CONTENT[selectedCategory];
    const completedContentIds = useMemo(() => {
        if (selectedCategory === 'quiz' || selectedCategory === 'game') {
            return snapshot?.completedQuizIds ?? [];
        }

        return snapshot?.completedLessonIds ?? [];
    }, [selectedCategory, snapshot?.completedLessonIds, snapshot?.completedQuizIds]);

    const handleOpenLesson = (lessonId: string) => {
        setSelectedLessonId(lessonId);
        navigation.navigate('LessonDetail', { lessonId });
    };

    return (
        <LinearGradient
            colors={['#19072f', '#25114a', '#34205f']}
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
                    <View style={styles.carouselSection}>
                        <View style={styles.categorySection}>
                            <View style={styles.categoryHeaderRow}>
                                <View style={styles.categoryHeaderCopy}>
                                    <Text style={styles.categoryEyebrow}>Academy</Text>
                                    <Text style={styles.categoryTitle}>Dynamic Content Library</Text>
                                    <Text style={styles.categoryBody}>
                                        Switch between {LESSON_CATEGORY_LABELS.practical.toLowerCase()}, {LESSON_CATEGORY_LABELS.theory.toLowerCase()}, {LESSON_CATEGORY_LABELS.quiz.toLowerCase()}, and {LESSON_CATEGORY_LABELS.game.toLowerCase()} without shipping a new app build.
                                    </Text>
                                </View>
                                <View style={styles.categoryCountBadge}>
                                    <Text style={styles.categoryCountLabel}>LIVE</Text>
                                    <Text style={styles.categoryCountValue}>{lessonOptions.length}</Text>
                                </View>
                            </View>

                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.categoryChipRow}
                            >
                                {(Object.keys(CATEGORY_CONTENT) as LessonCategory[]).map((category, index) => {
                                    const isActive = category === selectedCategory;
                                    return (
                                        <Pressable
                                            key={category}
                                            onPress={() => {
                                                setSelectedCategory(category);
                                                setSelectedLessonId('');
                                            }}
                                            style={({ pressed }) => [
                                                styles.categoryChipShell,
                                                pressed && styles.categoryChipPressed,
                                            ]}
                                        >
                                            <LinearGradient
                                                colors={isActive
                                                    ? [
                                                        PREMIUM_GRADIENT[index],
                                                        PREMIUM_GRADIENT[Math.min(index + 3, PREMIUM_GRADIENT.length - 1)],
                                                        PREMIUM_GRADIENT[Math.min(index + 6, PREMIUM_GRADIENT.length - 1)],
                                                    ]
                                                    : ['rgba(35, 17, 72, 0.96)', 'rgba(24, 11, 52, 0.9)', 'rgba(18, 9, 40, 0.88)']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                                            >
                                                <Text style={[styles.categoryChipEyebrow, isActive && styles.categoryChipEyebrowActive]}>
                                                    {CATEGORY_CONTENT[category].eyebrow}
                                                </Text>
                                                <Text style={styles.categoryChipTitle}>{LESSON_CATEGORY_LABELS[category]}</Text>
                                            </LinearGradient>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>

                            <LinearGradient
                                colors={['rgba(116, 0, 184, 0.18)', 'rgba(78, 168, 222, 0.18)', 'rgba(128, 255, 219, 0.12)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.categorySummaryCard}
                            >
                                <Text style={styles.categorySummaryEyebrow}>{categorySummary.eyebrow}</Text>
                                <Text style={styles.categorySummaryTitle}>{categorySummary.title}</Text>
                                <Text style={styles.categorySummaryBody}>{categorySummary.subtitle}</Text>
                                <Text style={styles.categorySummaryHelper}>{categorySummary.helper}</Text>
                            </LinearGradient>
                        </View>

                        {selectedCategory === 'practical' ? (
                            <InstrumentCarousel
                                items={instrumentCarouselItems}
                                selectedId={lessonInstrument}
                                onSelect={(item) => {
                                    setLessonInstrument(item.id as LessonInstrument);
                                    setSelectedLessonId('');
                                }}
                            />
                        ) : null}
                    </View>

                    <View style={styles.lessonListSection}>
                        {isCatalogLoading ? (
                            <View style={styles.stateCard}>
                                <ActivityIndicator color={COLORS.mint} size="large" />
                                <Text style={styles.stateTitle}>Loading live lessons</Text>
                                <Text style={styles.stateBody}>
                                    Pulling the latest academy catalog from Supabase so every tap opens current content.
                                </Text>
                            </View>
                        ) : null}

                        {!isCatalogLoading && catalogError ? (
                            <View style={styles.stateCard}>
                                <Text style={styles.stateTitle}>Catalog unavailable</Text>
                                <Text style={styles.stateBody}>{catalogError}</Text>
                            </View>
                        ) : null}

                        {!isCatalogLoading && !catalogError && lessonOptions.length === 0 ? (
                            <View style={styles.stateCard}>
                                <Text style={styles.stateTitle}>{categorySummary.emptyTitle}</Text>
                                <Text style={styles.stateBody}>{categorySummary.emptyBody}</Text>
                            </View>
                        ) : null}

                        {!isCatalogLoading && !catalogError && lessonOptions.length > 0 ? (
                            <LessonList
                                lessons={lessonOptions}
                                selectedLessonId={selectedLessonId}
                                onSelectLesson={handleOpenLesson}
                                completedLessonIds={completedContentIds}
                            />
                        ) : null}
                    </View>
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
    carouselSection: {
        marginTop: 4,
        gap: 18,
    },
    lessonListSection: {
        paddingTop: 2,
    },
    categorySection: {
        gap: 16,
    },
    categoryHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
    },
    categoryHeaderCopy: {
        flex: 1,
        gap: 6,
    },
    categoryEyebrow: {
        color: 'rgba(128,255,219,0.86)',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.4,
        textTransform: 'uppercase',
    },
    categoryTitle: {
        color: '#F7FBFF',
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.8,
    },
    categoryBody: {
        color: 'rgba(226,238,255,0.76)',
        fontSize: 14,
        lineHeight: 21,
    },
    categoryCountBadge: {
        minWidth: 78,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        backgroundColor: 'rgba(17, 10, 40, 0.58)',
        alignItems: 'center',
        gap: 2,
    },
    categoryCountLabel: {
        color: 'rgba(128,255,219,0.82)',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    categoryCountValue: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '900',
    },
    categoryChipRow: {
        gap: 12,
        paddingRight: 4,
    },
    categoryChipShell: {
        borderRadius: 22,
    },
    categoryChipPressed: {
        transform: [{ scale: 0.98 }],
    },
    categoryChip: {
        minWidth: 138,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        gap: 3,
        ...SHADOWS.soft,
    },
    categoryChipActive: {
        borderColor: 'rgba(128,255,219,0.42)',
    },
    categoryChipEyebrow: {
        color: 'rgba(241,247,255,0.7)',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    categoryChipEyebrowActive: {
        color: '#F8FCFF',
    },
    categoryChipTitle: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    categorySummaryCard: {
        borderRadius: RADII.l,
        paddingHorizontal: 20,
        paddingVertical: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        gap: 8,
        ...SHADOWS.card,
    },
    categorySummaryEyebrow: {
        color: COLORS.mint,
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    categorySummaryTitle: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.7,
    },
    categorySummaryBody: {
        color: 'rgba(244,248,255,0.88)',
        fontSize: 14,
        lineHeight: 21,
    },
    categorySummaryHelper: {
        color: 'rgba(212,233,255,0.62)',
        fontSize: 13,
        lineHeight: 19,
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
});
