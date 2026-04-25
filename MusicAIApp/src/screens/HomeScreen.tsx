import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { SONG_LESSONS, SongLesson } from '../data/songLessons';
import { LESSON_PACKS } from '../data/lessonLibrary';
import PageTransitionView from '../components/PageTransitionView';
import PremiumBackdrop from '../components/PremiumBackdrop';
import { useAppToast } from '../components/AppToastProvider';
import { BADGE_DEFINITIONS, GamificationSnapshot, getGamificationSnapshot } from '../services/gamification';
import { loadImportedSongs } from '../services/songLibrary';
import { PREMIUM_GRADIENT, SHADOWS } from '../theme';

type ResumeItem =
    | {
        kind: 'lesson';
        title: string;
        subtitle: string;
        badge: string;
        lessonId: string;
        instrument: string;
    }
    | {
        kind: 'song';
        title: string;
        subtitle: string;
        badge: string;
        songId: string;
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

function getInitials(displayName: string) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return 'P';
    }

    return parts
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
}

export default function HomeScreen() {
    const navigation = useNavigation<any>();
    const { showToast } = useAppToast();
    const tabBarHeight = useBottomTabBarHeight();
    const [snapshot, setSnapshot] = useState<GamificationSnapshot | null>(null);
    const [importedSongs, setImportedSongs] = useState<SongLesson[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refreshHome = useCallback(() => {
        let isMounted = true;

        const load = async () => {
            setIsLoading(true);
            try {
                const [nextSnapshot, nextImportedSongs] = await Promise.all([
                    getGamificationSnapshot(),
                    loadImportedSongs(),
                ]);

                if (!isMounted) {
                    return;
                }

                setSnapshot(nextSnapshot);
                setImportedSongs(nextImportedSongs);
            } catch (error) {
                showToast({
                    title: 'Dashboard unavailable',
                    message: 'The home summary could not refresh right now. Pull back in a moment.',
                    variant: 'warning',
                });
                console.error('Failed to load Home dashboard:', error);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        void load();

        return () => {
            isMounted = false;
        };
    }, [showToast]);

    useFocusEffect(refreshHome);

    const firstName = useMemo(() => {
        const displayName = snapshot?.displayName?.trim();
        if (!displayName) {
            return 'Player';
        }

        return displayName.split(/\s+/)[0] ?? 'Player';
    }, [snapshot?.displayName]);

    const avatarInitials = useMemo(() => getInitials(snapshot?.displayName ?? 'Player'), [snapshot?.displayName]);
    const lessonCompletionCount = snapshot?.completedLessonIds.length ?? 0;
    const songCompletionCount = snapshot?.completedSongIds.length ?? 0;
    const badgeCount = snapshot?.unlockedBadgeIds.length ?? 0;
    const totalSongCount = importedSongs.length + SONG_LESSONS.length;
    const lessonProgress = LESSON_PACKS.length > 0 ? lessonCompletionCount / LESSON_PACKS.length : 0;
    const songProgress = totalSongCount > 0 ? songCompletionCount / totalSongCount : 0;
    const badgeProgress = BADGE_DEFINITIONS.length > 0 ? badgeCount / BADGE_DEFINITIONS.length : 0;

    const resumeItem = useMemo<ResumeItem>(() => {
        const lastLessonId = snapshot?.completedLessonIds.at(-1) ?? null;
        if (lastLessonId) {
            const lesson = LESSON_PACKS.find((entry) => entry.id === lastLessonId);
            if (lesson) {
                return {
                    kind: 'lesson',
                    title: lesson.title,
                    subtitle: `${lesson.instrument} • ${lesson.tier} • ${lesson.durationMin} min`,
                    badge: 'Jump back into your lesson path',
                    lessonId: lesson.id,
                    instrument: lesson.instrument,
                };
            }
        }

        const lastSongId = snapshot?.completedSongIds.at(-1) ?? null;
        if (lastSongId) {
            const song = [...importedSongs, ...SONG_LESSONS].find((entry) => entry.id === lastSongId);
            if (song) {
                return {
                    kind: 'song',
                    title: song.title,
                    subtitle: `${song.artist} • ${song.difficulty}`,
                    badge: 'Resume your latest practice track',
                    songId: song.id,
                };
            }
        }

        const fallbackLesson = LESSON_PACKS[0];
        return {
            kind: 'lesson',
            title: fallbackLesson.title,
            subtitle: `${fallbackLesson.instrument} • ${fallbackLesson.tier} • ${fallbackLesson.durationMin} min`,
            badge: 'Start a fresh premium lesson',
            lessonId: fallbackLesson.id,
            instrument: fallbackLesson.instrument,
        };
    }, [importedSongs, snapshot?.completedLessonIds, snapshot?.completedSongIds]);

    const handleContinue = async () => {
        await Haptics.selectionAsync().catch(() => undefined);

        if (resumeItem.kind === 'lesson') {
            navigation.navigate('Lessons', {
                screen: 'LessonLibrary',
                params: {
                    lessonInstrument: resumeItem.instrument,
                    selectedLessonId: resumeItem.lessonId,
                },
            });
            return;
        }

        navigation.navigate('Songs', {
            focusSongId: resumeItem.songId,
        });
    };

    const handleQuickJump = async (routeName: 'Lessons' | 'Tuner' | 'Songs') => {
        await Haptics.selectionAsync().catch(() => undefined);
        navigation.navigate(routeName);
    };

    const openStudio = async () => {
        await Haptics.selectionAsync().catch(() => undefined);
        navigation.getParent()?.navigate('Studio');
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
                    contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarHeight + 30 }]}
                >
                    <Animated.View entering={FadeInUp.delay(40).springify().damping(18).stiffness(160)} style={styles.headerRow}>
                        <View style={styles.headerCopy}>
                            <Text style={styles.eyebrow}>Dashboard</Text>
                            <Text style={styles.title}>Welcome back, {firstName}</Text>
                            <Text style={styles.subtitle}>
                                {snapshot?.streakMessage ?? 'Your premium practice room is ready when you are.'}
                            </Text>
                        </View>

                        <Pressable
                            onPress={() => navigation.navigate('Profile')}
                            style={({ pressed }) => [
                                styles.avatarPressable,
                                pressed && styles.scalePressed,
                            ]}
                        >
                            <LinearGradient
                                colors={[PREMIUM_GRADIENT[0], PREMIUM_GRADIENT[2], PREMIUM_GRADIENT[8]]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.avatarOrb}
                            >
                                <Text style={styles.avatarText}>{avatarInitials}</Text>
                            </LinearGradient>
                        </Pressable>
                    </Animated.View>

                    <Animated.View entering={FadeInUp.delay(110).springify().damping(18).stiffness(160)} style={styles.statsGrid}>
                        {[
                            { label: 'XP', value: `${snapshot?.xp ?? 0}`, icon: 'flash-outline' as const },
                            { label: 'Level', value: `${snapshot?.level ?? 1}`, icon: 'diamond-outline' as const },
                            { label: 'Streak', value: `${snapshot?.streakDays ?? 0}d`, icon: 'flame-outline' as const },
                        ].map((item, index) => (
                            <Animated.View
                                key={item.label}
                                entering={FadeInUp.delay(160 + (index * 70)).springify().damping(18).stiffness(160)}
                                style={styles.statsCardWrap}
                            >
                                <LinearGradient
                                    colors={['#7400b8', '#6930c3', '#5e60ce']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.statCard}
                                >
                                    <View style={styles.statIconWrap}>
                                        <Ionicons name={item.icon} size={18} color="#F8FBFF" />
                                    </View>
                                    <Text style={styles.statLabel}>{item.label}</Text>
                                    <Text style={styles.statValue}>{item.value}</Text>
                                </LinearGradient>
                            </Animated.View>
                        ))}
                    </Animated.View>

                    <Animated.View entering={FadeInUp.delay(280).springify().damping(18).stiffness(160)}>
                        <LinearGradient
                            colors={['rgba(100,223,223,0.32)', 'rgba(114,239,221,0.28)', 'rgba(128,255,219,0.22)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.resumeGlow}
                        />

                        <LinearGradient
                            colors={['#64dfdf', '#72efdd', '#80ffdb']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.resumeCard}
                        >
                            <View style={styles.resumeTopRow}>
                                <View style={styles.resumeBadge}>
                                    <Text style={styles.resumeBadgeText}>{resumeItem.badge}</Text>
                                </View>
                                <View style={styles.resumeIconWrap}>
                                    <Ionicons
                                        name={resumeItem.kind === 'lesson' ? 'library-outline' : 'disc-outline'}
                                        size={22}
                                        color="#0B1730"
                                    />
                                </View>
                            </View>

                            <Text style={styles.resumeTitle}>{resumeItem.title}</Text>
                            <Text style={styles.resumeSubtitle}>{resumeItem.subtitle}</Text>

                            <Pressable
                                onPress={() => void handleContinue()}
                                style={({ pressed }) => [
                                    styles.continueButton,
                                    pressed && styles.scalePressed,
                                ]}
                            >
                                <LinearGradient
                                    colors={['#19072f', '#34205f']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.continueButtonFill}
                                >
                                    <Text style={styles.continueButtonText}>Continue</Text>
                                    <Ionicons name="arrow-forward" size={18} color="#80ffdb" />
                                </LinearGradient>
                            </Pressable>
                        </LinearGradient>
                    </Animated.View>

                    <Animated.View entering={FadeInUp.delay(360).springify().damping(18).stiffness(160)} style={styles.detailGrid}>
                        <LinearGradient
                            colors={['rgba(116,0,184,0.4)', 'rgba(94,96,206,0.22)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.detailCard}
                        >
                            <Text style={styles.detailEyebrow}>Progress Board</Text>
                            <Text style={styles.detailTitle}>Your library at a glance</Text>
                            <Text style={styles.detailBody}>
                                A cleaner snapshot of how much of the lesson catalog, song flow, and badge track you have already covered.
                            </Text>

                            {[
                                {
                                    label: 'Lessons finished',
                                    value: `${lessonCompletionCount}/${LESSON_PACKS.length}`,
                                    progress: lessonProgress,
                                    fill: '#72efdd',
                                },
                                {
                                    label: 'Song flow sessions',
                                    value: `${songCompletionCount}/${Math.max(1, totalSongCount)}`,
                                    progress: songProgress,
                                    fill: '#64dfdf',
                                },
                                {
                                    label: 'Badges unlocked',
                                    value: `${badgeCount}/${BADGE_DEFINITIONS.length}`,
                                    progress: badgeProgress,
                                    fill: '#80ffdb',
                                },
                            ].map((item) => (
                                <View key={item.label} style={styles.progressRow}>
                                    <View style={styles.progressCopy}>
                                        <Text style={styles.progressLabel}>{item.label}</Text>
                                        <Text style={styles.progressValue}>{item.value}</Text>
                                    </View>
                                    <View style={styles.progressRail}>
                                        <View
                                            style={[
                                                styles.progressFill,
                                                {
                                                    width: `${Math.max(10, item.progress * 100)}%`,
                                                    backgroundColor: item.fill,
                                                },
                                            ]}
                                        />
                                    </View>
                                </View>
                            ))}
                        </LinearGradient>

                        <LinearGradient
                            colors={['rgba(37,17,74,0.96)', 'rgba(25,7,47,0.96)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.detailCard}
                        >
                            <Text style={styles.detailEyebrow}>Quick Launch</Text>
                            <Text style={styles.detailTitle}>Jump straight into the room you need</Text>
                            <Text style={styles.detailBody}>
                                Browse the lesson catalog, open the tuner, or head back into song flow without leaving the dashboard.
                            </Text>

                            <View style={styles.quickActionRow}>
                                {[
                                    { label: 'Lessons', icon: 'library-outline' as const, route: 'Lessons' as const },
                                    { label: 'Tuner', icon: 'radio-outline' as const, route: 'Tuner' as const },
                                    { label: 'Songs', icon: 'disc-outline' as const, route: 'Songs' as const },
                                ].map((item) => (
                                    <Pressable
                                        key={item.label}
                                        onPress={() => void handleQuickJump(item.route)}
                                        style={({ pressed }) => [
                                            styles.quickActionButton,
                                            pressed && styles.scalePressed,
                                        ]}
                                    >
                                        <View style={styles.quickActionOrb}>
                                            <Ionicons name={item.icon} size={18} color="#80ffdb" />
                                        </View>
                                        <Text style={styles.quickActionText}>{item.label}</Text>
                                    </Pressable>
                                ))}
                                <Pressable
                                    onPress={() => void openStudio()}
                                    style={({ pressed }) => [
                                        styles.quickActionButton,
                                        pressed && styles.scalePressed,
                                    ]}
                                >
                                    <View style={styles.quickActionOrb}>
                                        <Ionicons name="pulse-outline" size={18} color="#80ffdb" />
                                    </View>
                                    <Text style={styles.quickActionText}>Studio</Text>
                                </Pressable>
                            </View>

                            <View style={styles.todayStrip}>
                                <Text style={styles.todayStripLabel}>
                                    {snapshot?.didPracticeToday ? 'Today is already protected' : 'One focused session keeps your streak alive'}
                                </Text>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    {isLoading ? (
                        <View style={styles.loadingState}>
                            <ActivityIndicator color="#80ffdb" size="large" />
                            <Text style={styles.loadingText}>Refreshing your latest progress…</Text>
                        </View>
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
        paddingTop: 30,
        paddingHorizontal: 18,
        gap: 18,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
    },
    headerCopy: {
        flex: 1,
        gap: 6,
    },
    eyebrow: {
        color: '#72efdd',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.6,
        textTransform: 'uppercase',
    },
    title: {
        color: '#F8FBFF',
        fontSize: 30,
        fontWeight: '900',
        letterSpacing: -0.6,
    },
    subtitle: {
        color: 'rgba(223, 237, 255, 0.78)',
        fontSize: 14,
        lineHeight: 21,
    },
    avatarPressable: {
        borderRadius: 28,
    },
    avatarOrb: {
        width: 72,
        height: 72,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        ...SHADOWS.card,
    },
    avatarText: {
        color: '#F8FBFF',
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: 0.4,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    statsCardWrap: {
        flex: 1,
    },
    statCard: {
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 18,
        gap: 8,
        minHeight: 124,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        ...SHADOWS.card,
    },
    statIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    statLabel: {
        color: 'rgba(238, 244, 255, 0.74)',
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: 30,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    resumeGlow: {
        position: 'absolute',
        top: 18,
        left: 18,
        right: 18,
        bottom: -12,
        borderRadius: 28,
    },
    resumeCard: {
        borderRadius: 26,
        padding: 22,
        borderWidth: 1,
        borderColor: withOpacity('#80ffdb', 0.5),
        ...SHADOWS.card,
        shadowColor: '#80ffdb',
    },
    resumeTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 14,
    },
    resumeBadge: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(9, 26, 47, 0.14)',
        borderWidth: 1,
        borderColor: 'rgba(9, 26, 47, 0.08)',
    },
    resumeBadgeText: {
        color: '#0B1730',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    resumeIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.28)',
    },
    resumeTitle: {
        color: '#0A1530',
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.6,
    },
    resumeSubtitle: {
        color: 'rgba(10, 21, 48, 0.76)',
        fontSize: 14,
        lineHeight: 21,
        marginTop: 8,
    },
    detailGrid: {
        gap: 14,
    },
    detailCard: {
        borderRadius: 24,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        gap: 14,
        ...SHADOWS.card,
    },
    detailEyebrow: {
        color: '#80ffdb',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    detailTitle: {
        color: '#F8FBFF',
        fontSize: 21,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    detailBody: {
        color: 'rgba(223, 237, 255, 0.74)',
        fontSize: 13,
        lineHeight: 20,
    },
    progressRow: {
        gap: 8,
    },
    progressCopy: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    progressLabel: {
        color: '#F8FBFF',
        fontSize: 13,
        fontWeight: '700',
    },
    progressValue: {
        color: '#80ffdb',
        fontSize: 12,
        fontWeight: '800',
    },
    progressRail: {
        height: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 999,
    },
    quickActionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    quickActionButton: {
        flexBasis: '48%',
        flexGrow: 1,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: 'rgba(128,255,219,0.18)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        gap: 10,
    },
    quickActionOrb: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(116,0,184,0.32)',
        borderWidth: 1,
        borderColor: 'rgba(128,255,219,0.2)',
    },
    quickActionText: {
        color: '#F8FBFF',
        fontSize: 13,
        fontWeight: '800',
    },
    todayStrip: {
        marginTop: 4,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    todayStripLabel: {
        color: 'rgba(233, 242, 255, 0.86)',
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
    },
    continueButton: {
        marginTop: 20,
        borderRadius: 20,
        overflow: 'hidden',
        alignSelf: 'flex-start',
    },
    continueButtonFill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 18,
        paddingVertical: 14,
    },
    continueButtonText: {
        color: '#F8FBFF',
        fontSize: 15,
        fontWeight: '900',
    },
    scalePressed: {
        transform: [{ scale: 0.985 }],
    },
    loadingState: {
        alignItems: 'center',
        gap: 10,
        paddingTop: 12,
    },
    loadingText: {
        color: 'rgba(223, 237, 255, 0.72)',
        fontSize: 13,
        fontWeight: '600',
    },
});
