import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import GamificationDeck from '../components/GamificationDeck';
import PageTransitionView from '../components/PageTransitionView';
import PremiumBackdrop from '../components/PremiumBackdrop';
import PremiumCelebrationOverlay from '../components/PremiumCelebrationOverlay';
import PremiumHeroStrip from '../components/PremiumHeroStrip';
import ScreenSettingsButton from '../components/ScreenSettingsButton';
import SkeletonBlock from '../components/SkeletonBlock';
import { useAppToast } from '../components/AppToastProvider';
import { LESSON_PACKS, LessonPackage } from '../data/lessonLibrary';
import { SongLesson, SONG_LESSONS } from '../data/songLessons';
import { COLORS, SHADOWS } from '../theme';
import { AppSettings, getAppSettings, updateAppSettings } from '../services/appSettings';
import { ApiDiagnosticsResult, checkBackendHealth } from '../services/apiDiagnostics';
import { useCelebration } from '../hooks/useCelebration';
import {
    BADGE_DEFINITIONS,
    BadgeDefinition,
    GamificationSnapshot,
    getGamificationSnapshot,
    getLeaderboard,
    syncGamificationProfile,
    updateDisplayName,
} from '../services/gamification';
import { fetchTrafficAnalyses, LeaderboardEntry, TrafficAnalysisEntry } from '../services/api';
import { loadImportedSongs } from '../services/songLibrary';
import { supabase } from '../services/supabaseClient';

const GOAL_OPTIONS = [10, 20, 30, 45];
const SEEK_STEP_OPTIONS = [5, 10, 15, 20];

type ProfileShelf = 'lessons' | 'songs' | 'badges';
type SongShelfMode = 'flow' | 'studio';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type StudioSaveWithKey = TrafficAnalysisEntry & { key: string };

const BADGE_VISUALS: Record<string, { icon: IconName; start: string; end: string }> = {
    first_song: { icon: 'musical-notes', start: '#8A7BFF', end: '#56CFA8' },
    drum_master: { icon: 'disc', start: '#FFB36E', end: '#FF7D96' },
    lesson_starter: { icon: 'book', start: '#6E7CFF', end: '#42C2FF' },
    theory_starter: { icon: 'bulb', start: '#A07CFF', end: '#6E7CFF' },
    streak_three: { icon: 'flame', start: '#F4B76C', end: '#FF7D96' },
};

function withOpacity(hex: string, opacity: number) {
    const safeOpacity = Math.max(0, Math.min(1, opacity));
    const sanitized = hex.replace('#', '');
    const fullHex =
        sanitized.length === 3
            ? sanitized
                  .split('')
                  .map((char) => `${char}${char}`)
                  .join('')
            : sanitized;

    const value = parseInt(fullHex, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
}

function formatDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '--';
    }

    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return `${minutes}:${`${remainder}`.padStart(2, '0')}`;
}

function formatSavedAt(value: string | null) {
    if (!value) {
        return 'Recently saved';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Recently saved';
    }

    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function SettingRow({
    label,
    description,
    value,
    onChange,
}: {
    label: string;
    description: string;
    value: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <View style={styles.settingRow}>
            <View style={styles.settingTextWrap}>
                <Text style={styles.settingLabel}>{label}</Text>
                <Text style={styles.settingBody}>{description}</Text>
            </View>
            <Switch
                value={value}
                onValueChange={onChange}
                trackColor={{ true: withOpacity(COLORS.primary, 0.5), false: COLORS.pixelLine }}
                thumbColor={COLORS.panelAlt}
            />
        </View>
    );
}

function LibraryButton({
    icon,
    label,
    meta,
    count,
    active,
    onPress,
}: {
    icon: IconName;
    label: string;
    meta: string;
    count: string;
    active: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={[styles.libraryButton, active && styles.libraryButtonActive]}
            onPress={onPress}
        >
            <View style={[styles.libraryIconWrap, active && styles.libraryIconWrapActive]}>
                <Ionicons
                    name={icon}
                    size={18}
                    color={active ? COLORS.panelAlt : COLORS.textStrong}
                />
            </View>
            <View style={styles.libraryButtonTextWrap}>
                <Text style={styles.libraryButtonLabel}>{label}</Text>
                <Text style={styles.libraryButtonMeta}>{meta}</Text>
            </View>
            <Text style={[styles.libraryButtonCount, active && styles.libraryButtonCountActive]}>
                {count}
            </Text>
        </TouchableOpacity>
    );
}

export default function ProfileScreen() {
    const tabBarHeight = useBottomTabBarHeight();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { showToast } = useAppToast();
    const scrollRef = useRef<ScrollView | null>(null);
    const [snapshot, setSnapshot] = useState<GamificationSnapshot | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [nameDraft, setNameDraft] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSavingName, setIsSavingName] = useState(false);
    const [settingsOffsetY, setSettingsOffsetY] = useState(0);
    const [importedSongs, setImportedSongs] = useState<SongLesson[]>([]);
    const [studioSaves, setStudioSaves] = useState<TrafficAnalysisEntry[]>([]);
    const [activeShelf, setActiveShelf] = useState<ProfileShelf>('lessons');
    const [activeSongMode, setActiveSongMode] = useState<SongShelfMode>('flow');
    const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
    const [selectedFlowSongId, setSelectedFlowSongId] = useState<string | null>(null);
    const [selectedStudioSongKey, setSelectedStudioSongKey] = useState<string | null>(null);
    const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(
        BADGE_DEFINITIONS[0]?.id ?? null,
    );
    const [apiDiagnostics, setApiDiagnostics] = useState<ApiDiagnosticsResult | null>(null);
    const [apiDiagnosticsCheckedAt, setApiDiagnosticsCheckedAt] = useState<string | null>(null);
    const [isCheckingApiDiagnostics, setIsCheckingApiDiagnostics] = useState(false);
    const { celebration, showCelebration } = useCelebration();

    const loadProfile = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const [nextSettings, nextSnapshot, nextImportedSongs] = await Promise.all([
                getAppSettings(),
                getGamificationSnapshot(),
                loadImportedSongs(),
            ]);

            setSettings(nextSettings);
            setSnapshot(nextSnapshot);
            setImportedSongs(nextImportedSongs);
            setNameDraft(nextSnapshot.displayName);

            if (nextSettings.leaderboardSyncEnabled) {
                await syncGamificationProfile();
            }

            const [nextBoard, nextStudioSaves] = await Promise.all([
                getLeaderboard(20),
                fetchTrafficAnalyses(nextSnapshot.userId),
            ]);

            setLeaderboard(nextBoard);
            setStudioSaves(nextStudioSaves);
        } catch (error) {
            showToast({
                title: 'Profile unavailable',
                message: 'We could not refresh your player hub right now.',
                variant: 'warning',
            });
            console.error('Failed to load profile:', error);
        } finally {
            setIsRefreshing(false);
        }
    }, [showToast]);

    const scrollToSettings = useCallback(() => {
        scrollRef.current?.scrollTo({ y: Math.max(settingsOffsetY - 16, 0), animated: true });
    }, [settingsOffsetY]);

    useFocusEffect(
        useCallback(() => {
            void loadProfile();
        }, [loadProfile]),
    );

    useEffect(() => {
        if (route.params?.focusSettings) {
            setTimeout(() => {
                scrollToSettings();
                navigation.setParams?.({ focusSettings: false });
            }, 80);
        }
    }, [navigation, route.params, scrollToSettings]);

    const handleSaveName = async () => {
        if (!nameDraft.trim()) {
            showToast({
                title: 'Name needed',
                message: 'Please enter a player name before saving.',
                variant: 'warning',
            });
            return;
        }

        setIsSavingName(true);
        try {
            const nextSnapshot = await updateDisplayName(nameDraft);
            setSnapshot(nextSnapshot);
            setNameDraft(nextSnapshot.displayName);
            const nextBoard = await getLeaderboard(20);
            setLeaderboard(nextBoard);
            showCelebration({
                title: 'Profile updated',
                subtitle: 'Your player card is using the new name now.',
                variant: 'success',
            });
        } catch {
            showToast({
                title: 'Save failed',
                message: 'Could not update the profile name right now.',
                variant: 'error',
            });
        } finally {
            setIsSavingName(false);
        }
    };

    const handleSignOut = async () => {
        const { error } = await supabase.auth.signOut();

        if (error) {
            showToast({
                title: 'Sign out failed',
                message: error.message,
                variant: 'error',
            });
        }
    };

    const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        try {
            const next = await updateAppSettings({ [key]: value });
            setSettings(next);

            if (key === 'leaderboardSyncEnabled') {
                await loadProfile();
            }
        } catch {
            showToast({
                title: 'Setting failed',
                message: 'That setting could not be saved.',
                variant: 'error',
            });
        }
    };

    const runApiDiagnostics = useCallback(async () => {
        setIsCheckingApiDiagnostics(true);
        const result = await checkBackendHealth();
        setApiDiagnostics(result);
        setApiDiagnosticsCheckedAt(
            new Date().toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
            }),
        );
        setIsCheckingApiDiagnostics(false);
    }, []);

    const openLessonFromProfile = useCallback(
        (lessonId: string) => {
            navigation.navigate('Lessons', {
                screen: 'LessonDetail',
                params: { lessonId },
            });
        },
        [navigation],
    );

    const openSongFromProfile = useCallback(
        (songId: string) => {
            navigation.navigate('Songs', {
                focusSongId: songId,
            });
        },
        [navigation],
    );

    const openStudioSave = useCallback(
        (song: StudioSaveWithKey) => {
            navigation.getParent()?.navigate('Studio', {
                savedAnalysis: {
                    songName: song.songName,
                    duration: song.duration,
                    markers: song.markers,
                    createdAt: song.createdAt,
                },
            });
        },
        [navigation],
    );

    const userRank = useMemo(() => {
        if (!snapshot) {
            return null;
        }

        const index = leaderboard.findIndex((entry) => entry.userId === snapshot.userId);
        return index >= 0 ? index + 1 : null;
    }, [leaderboard, snapshot]);

    const completedLessons = useMemo(() => {
        const completedIds = new Set(snapshot?.completedLessonIds ?? []);
        return LESSON_PACKS.filter((lesson) => completedIds.has(lesson.id));
    }, [snapshot?.completedLessonIds]);

    const flowSongMap = useMemo(() => {
        const map = new Map<string, SongLesson>();
        [...SONG_LESSONS, ...importedSongs].forEach((song) => {
            map.set(song.id, song);
        });
        return map;
    }, [importedSongs]);

    const flowSongs = useMemo(() => {
        const ordered: SongLesson[] = [];
        const seen = new Set<string>();

        importedSongs.forEach((song) => {
            if (!seen.has(song.id)) {
                ordered.push(song);
                seen.add(song.id);
            }
        });

        (snapshot?.completedSongIds ?? []).forEach((songId) => {
            const match = flowSongMap.get(songId);
            if (match && !seen.has(match.id)) {
                ordered.push(match);
                seen.add(match.id);
            }
        });

        return ordered;
    }, [flowSongMap, importedSongs, snapshot?.completedSongIds]);

    const keyedStudioSaves = useMemo<StudioSaveWithKey[]>(
        () =>
            studioSaves
                .map((item, index) => ({
                    ...item,
                    key: `${item.songName}-${item.createdAt ?? 'save'}-${index}`,
                }))
                .sort((a, b) => {
                    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return bTime - aTime;
                }),
        [studioSaves],
    );

    useEffect(() => {
        if (completedLessons.length === 0) {
            setSelectedLessonId(null);
            return;
        }

        if (!completedLessons.some((lesson) => lesson.id === selectedLessonId)) {
            setSelectedLessonId(completedLessons[0].id);
        }
    }, [completedLessons, selectedLessonId]);

    useEffect(() => {
        if (flowSongs.length === 0) {
            setSelectedFlowSongId(null);
            return;
        }

        if (!flowSongs.some((song) => song.id === selectedFlowSongId)) {
            setSelectedFlowSongId(flowSongs[0].id);
        }
    }, [flowSongs, selectedFlowSongId]);

    useEffect(() => {
        if (keyedStudioSaves.length === 0) {
            setSelectedStudioSongKey(null);
            return;
        }

        if (!keyedStudioSaves.some((entry) => entry.key === selectedStudioSongKey)) {
            setSelectedStudioSongKey(keyedStudioSaves[0].key);
        }
    }, [keyedStudioSaves, selectedStudioSongKey]);

    useEffect(() => {
        if (activeSongMode === 'flow' && flowSongs.length === 0 && keyedStudioSaves.length > 0) {
            setActiveSongMode('studio');
        }

        if (activeSongMode === 'studio' && keyedStudioSaves.length === 0 && flowSongs.length > 0) {
            setActiveSongMode('flow');
        }
    }, [activeSongMode, flowSongs.length, keyedStudioSaves.length]);

    useEffect(() => {
        void runApiDiagnostics();
    }, [runApiDiagnostics]);

    const selectedLesson = useMemo(
        () => completedLessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
        [completedLessons, selectedLessonId],
    );

    const selectedFlowSong = useMemo(
        () => flowSongs.find((song) => song.id === selectedFlowSongId) ?? null,
        [flowSongs, selectedFlowSongId],
    );

    const selectedStudioSong = useMemo(
        () => keyedStudioSaves.find((item) => item.key === selectedStudioSongKey) ?? null,
        [keyedStudioSaves, selectedStudioSongKey],
    );

    const selectedBadge = useMemo(
        () =>
            BADGE_DEFINITIONS.find((badge) => badge.id === selectedBadgeId) ??
            BADGE_DEFINITIONS[0] ??
            null,
        [selectedBadgeId],
    );

    const unlockedBadgeIds = useMemo(
        () => new Set(snapshot?.unlockedBadgeIds ?? []),
        [snapshot?.unlockedBadgeIds],
    );
    const songCardCount = `${flowSongs.length + keyedStudioSaves.length}`;
    const badgeCount = `${snapshot?.unlockedBadgeIds.length ?? 0}/${BADGE_DEFINITIONS.length}`;
    const isInitialLoading = isRefreshing && (!snapshot || !settings);

    const renderLessonDetail = (lesson: LessonPackage) => (
        <View style={styles.detailCard}>
            <View style={styles.detailHeaderRow}>
                <View style={styles.detailTitleWrap}>
                    <Text style={styles.detailKicker}>Completed lesson</Text>
                    <Text style={styles.detailTitle}>{lesson.title}</Text>
                    <Text style={styles.detailSubtitle}>{lesson.subtitle}</Text>
                </View>
                <View style={styles.detailPillRow}>
                    <View style={styles.detailPill}>
                        <Text style={styles.detailPillText}>{lesson.instrument}</Text>
                    </View>
                    <View style={styles.detailPill}>
                        <Text style={styles.detailPillText}>{lesson.tier}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.detailMetricRow}>
                <View style={styles.detailMetricCard}>
                    <Text style={styles.detailMetricLabel}>Duration</Text>
                    <Text style={styles.detailMetricValue}>{lesson.durationMin} min</Text>
                </View>
                <View style={styles.detailMetricCard}>
                    <Text style={styles.detailMetricLabel}>Focus</Text>
                    <Text style={styles.detailMetricValue}>{lesson.focusTags.length} tags</Text>
                </View>
                <View style={styles.detailMetricCard}>
                    <Text style={styles.detailMetricLabel}>Flow</Text>
                    <Text style={styles.detailMetricValue}>{lesson.lessonSteps.length} steps</Text>
                </View>
            </View>

            <Text style={styles.detailBlockTitle}>Goal</Text>
            <Text style={styles.detailBody}>{lesson.goal}</Text>

            <Text style={styles.detailBlockTitle}>Checkpoint</Text>
            <Text style={styles.detailBody}>{lesson.checkpoint}</Text>

            <View style={styles.tagRow}>
                {lesson.focusTags.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                        <Text style={styles.tagChipText}>{tag}</Text>
                    </View>
                ))}
            </View>

            <TouchableOpacity
                style={styles.detailActionButton}
                onPress={() => openLessonFromProfile(lesson.id)}
            >
                <Ionicons name="arrow-forward-outline" size={16} color={COLORS.panelAlt} />
                <Text style={styles.detailActionButtonText}>Open lesson</Text>
            </TouchableOpacity>
        </View>
    );

    const renderFlowSongDetail = (song: SongLesson) => {
        const isCompleted = snapshot?.completedSongIds.includes(song.id) ?? false;
        return (
            <View style={styles.detailCard}>
                <View style={styles.detailHeaderRow}>
                    <View style={styles.detailTitleWrap}>
                        <Text style={styles.detailKicker}>
                            {song.isImported ? 'Saved from Songs tab' : 'Song Flow progress'}
                        </Text>
                        <Text style={styles.detailTitle}>{song.title}</Text>
                        <Text style={styles.detailSubtitle}>{song.artist}</Text>
                    </View>
                    <View style={styles.detailPillRow}>
                        <View style={styles.detailPill}>
                            <Text style={styles.detailPillText}>{song.difficulty}</Text>
                        </View>
                        <View style={styles.detailPill}>
                            <Text style={styles.detailPillText}>
                                {song.isImported ? 'Imported' : 'Built-In'}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={styles.detailMetricRow}>
                    <View style={styles.detailMetricCard}>
                        <Text style={styles.detailMetricLabel}>Duration</Text>
                        <Text style={styles.detailMetricValue}>
                            {formatDuration(song.durationSec)}
                        </Text>
                    </View>
                    <View style={styles.detailMetricCard}>
                        <Text style={styles.detailMetricLabel}>Chords</Text>
                        <Text style={styles.detailMetricValue}>{song.chordEvents.length}</Text>
                    </View>
                    <View style={styles.detailMetricCard}>
                        <Text style={styles.detailMetricLabel}>Tabs</Text>
                        <Text style={styles.detailMetricValue}>{song.tabNotes.length}</Text>
                    </View>
                </View>

                <Text style={styles.detailBlockTitle}>Why it is here</Text>
                <Text style={styles.detailBody}>
                    {song.isImported
                        ? 'This track was saved into the Song Flow library from the Songs tab import flow.'
                        : 'This song appears here because you have already completed a run in Song Flow.'}
                </Text>

                <Text style={styles.detailBlockTitle}>Progress</Text>
                <Text style={styles.detailBody}>
                    {isCompleted
                        ? 'Completed in your profile. You can jump back in anytime from the Songs tab.'
                        : 'Saved in the Songs tab, but not completed yet.'}
                </Text>

                <TouchableOpacity
                    style={styles.detailActionButton}
                    onPress={() => openSongFromProfile(song.id)}
                >
                    <Ionicons name="play-outline" size={16} color={COLORS.panelAlt} />
                    <Text style={styles.detailActionButtonText}>Open in Song Flow</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderStudioSongDetail = (song: StudioSaveWithKey) => (
        <View style={styles.detailCard}>
            <View style={styles.detailHeaderRow}>
                <View style={styles.detailTitleWrap}>
                    <Text style={styles.detailKicker}>Saved from Studio</Text>
                    <Text style={styles.detailTitle}>{song.songName}</Text>
                    <Text style={styles.detailSubtitle}>Traffic analysis save</Text>
                </View>
                <View style={styles.detailPillRow}>
                    <View style={styles.detailPill}>
                        <Text style={styles.detailPillText}>{song.markers.length} sections</Text>
                    </View>
                </View>
            </View>

            <View style={styles.detailMetricRow}>
                <View style={styles.detailMetricCard}>
                    <Text style={styles.detailMetricLabel}>Duration</Text>
                    <Text style={styles.detailMetricValue}>{formatDuration(song.duration)}</Text>
                </View>
                <View style={styles.detailMetricCard}>
                    <Text style={styles.detailMetricLabel}>Markers</Text>
                    <Text style={styles.detailMetricValue}>{song.markers.length}</Text>
                </View>
                <View style={styles.detailMetricCard}>
                    <Text style={styles.detailMetricLabel}>Saved</Text>
                    <Text style={styles.detailMetricValue}>{formatSavedAt(song.createdAt)}</Text>
                </View>
            </View>

            <Text style={styles.detailBlockTitle}>Section map</Text>
            <View style={styles.tagRow}>
                {song.markers.slice(0, 8).map((marker) => (
                    <View key={`${song.key}-${marker.id}-${marker.label}`} style={styles.tagChip}>
                        <Text style={styles.tagChipText}>{marker.label}</Text>
                    </View>
                ))}
            </View>
            {song.markers.length > 8 ? (
                <Text style={styles.detailHint}>Showing the first 8 saved section markers.</Text>
            ) : null}

            <TouchableOpacity
                style={styles.detailActionButton}
                onPress={() => openStudioSave(song)}
            >
                <Ionicons name="pulse-outline" size={16} color={COLORS.panelAlt} />
                <Text style={styles.detailActionButtonText}>Open in Studio</Text>
            </TouchableOpacity>
        </View>
    );

    const renderBadgeDetail = (badge: BadgeDefinition) => {
        const unlocked = unlockedBadgeIds.has(badge.id);
        const visual = BADGE_VISUALS[badge.id] ?? BADGE_VISUALS.first_song;

        return (
            <View style={styles.detailCard}>
                <View style={styles.badgeDetailHero}>
                    <LinearGradient
                        colors={unlocked ? [visual.start, visual.end] : ['#DDE3EA', '#F5F7FA']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.badgeDetailIconWrap}
                    >
                        <Ionicons
                            name={visual.icon}
                            size={26}
                            color={unlocked ? COLORS.panelAlt : COLORS.textDim}
                        />
                    </LinearGradient>
                    <View style={styles.badgeDetailTextWrap}>
                        <Text style={styles.detailKicker}>
                            {unlocked ? 'Unlocked badge' : 'Locked badge'}
                        </Text>
                        <Text style={styles.detailTitle}>{badge.title}</Text>
                        <Text style={styles.detailSubtitle}>{badge.description}</Text>
                    </View>
                </View>

                <Text style={styles.detailBlockTitle}>How to earn it</Text>
                <Text style={styles.detailBody}>{badge.howToEarn}</Text>

                <Text style={styles.detailBlockTitle}>Status</Text>
                <Text style={styles.detailBody}>
                    {unlocked
                        ? 'You already have this one unlocked. Nice work.'
                        : 'Still locked. The rule above is the exact condition to unlock it.'}
                </Text>
            </View>
        );
    };

    return (
        <LinearGradient
            colors={[COLORS.panelAlt, COLORS.background, COLORS.backgroundAlt]}
            start={{ x: 0.02, y: 0 }}
            end={{ x: 0.98, y: 1 }}
            style={styles.screen}
        >
            <PremiumBackdrop variant="light" />
            <PageTransitionView style={styles.screen}>
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + 28 }]}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.headerRow}>
                        <View style={styles.headerTextWrap}>
                            <Text style={styles.title}>Profile</Text>
                            <Text style={styles.subTitle}>
                                Your stats, streaks, saved work, badges, and app setup all in one
                                place.
                            </Text>
                        </View>
                        <View style={styles.headerActions}>
                            <TouchableOpacity
                                style={styles.signOutButton}
                                onPress={() => void handleSignOut()}
                            >
                                <Ionicons
                                    name="log-out-outline"
                                    size={16}
                                    color={COLORS.textStrong}
                                />
                                <Text style={styles.signOutButtonText}>Sign out</Text>
                            </TouchableOpacity>
                            <ScreenSettingsButton onPress={scrollToSettings} />
                        </View>
                    </View>

                    <PremiumHeroStrip
                        icon="sparkles-outline"
                        eyebrow="Player Hub"
                        title="Everything that matters about your progress lives here."
                        body="Stats, saves, badges, and settings now sit behind a more visible premium shell while keeping the profile flow simple."
                        metrics={[
                            { label: 'XP', value: `${snapshot?.xp ?? 0}` },
                            { label: 'Badges', value: `${snapshot?.unlockedBadgeIds.length ?? 0}` },
                            { label: 'Streak', value: `${snapshot?.streakDays ?? 0} d` },
                        ]}
                    />

                    {isInitialLoading ? (
                        <>
                            <View style={styles.heroCard}>
                                <SkeletonBlock
                                    style={{ width: 72, height: 12, marginBottom: 10 }}
                                />
                                <SkeletonBlock
                                    style={{ width: '72%', height: 46, marginBottom: 14 }}
                                />
                                <View style={styles.heroStatsRow}>
                                    {[0, 1, 2].map((index) => (
                                        <SkeletonBlock
                                            key={`hero-skeleton-${index}`}
                                            style={{ flex: 1, height: 62 }}
                                        />
                                    ))}
                                </View>
                            </View>

                            <View style={styles.statGrid}>
                                {Array.from({ length: 8 }).map((_, index) => (
                                    <View key={`stat-skeleton-${index}`} style={styles.statCard}>
                                        <SkeletonBlock
                                            style={{ width: '36%', height: 10, marginBottom: 8 }}
                                        />
                                        <SkeletonBlock style={{ width: '58%', height: 20 }} />
                                    </View>
                                ))}
                            </View>

                            <View style={styles.libraryCard}>
                                <SkeletonBlock
                                    style={{ width: 120, height: 16, marginBottom: 8 }}
                                />
                                <SkeletonBlock
                                    style={{ width: '84%', height: 12, marginBottom: 14 }}
                                />
                                {[0, 1, 2].map((index) => (
                                    <SkeletonBlock
                                        key={`library-skeleton-${index}`}
                                        style={{ height: 72, marginBottom: index === 2 ? 0 : 10 }}
                                    />
                                ))}
                            </View>
                        </>
                    ) : (
                        <>
                            <View style={styles.heroCard}>
                                <View style={styles.heroTopRow}>
                                    <View style={styles.heroMain}>
                                        <Text style={styles.heroKicker}>Identity</Text>
                                        <TextInput
                                            value={nameDraft}
                                            onChangeText={setNameDraft}
                                            placeholder="Your player name"
                                            placeholderTextColor={COLORS.textDim}
                                            style={styles.nameInput}
                                        />
                                    </View>

                                    <TouchableOpacity
                                        style={styles.saveButton}
                                        onPress={() => void handleSaveName()}
                                    >
                                        <Text style={styles.saveButtonText}>
                                            {isSavingName ? 'Saving...' : 'Save'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.heroStatsRow}>
                                    <View style={styles.heroMetric}>
                                        <Text style={styles.heroMetricLabel}>Rank</Text>
                                        <Text style={styles.heroMetricValue}>
                                            {userRank ?? '--'}
                                        </Text>
                                    </View>
                                    <View style={styles.heroMetric}>
                                        <Text style={styles.heroMetricLabel}>Goal</Text>
                                        <Text style={styles.heroMetricValue}>
                                            {settings?.practiceGoalMinutes ?? 20} min
                                        </Text>
                                    </View>
                                    <View style={styles.heroMetric}>
                                        <Text style={styles.heroMetricLabel}>Songs</Text>
                                        <Text style={styles.heroMetricValue}>
                                            {snapshot?.completedSongIds.length ?? 0}/
                                            {SONG_LESSONS.length}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.statGrid}>
                                <View style={styles.statCard}>
                                    <Text style={styles.statLabel}>XP</Text>
                                    <Text style={styles.statValue}>{snapshot?.xp ?? 0}</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statLabel}>Level</Text>
                                    <Text style={styles.statValue}>{snapshot?.level ?? 1}</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statLabel}>Streak</Text>
                                    <Text style={styles.statValue}>
                                        {snapshot?.streakDays ?? 0}
                                    </Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statLabel}>Longest</Text>
                                    <Text style={styles.statValue}>
                                        {snapshot?.longestStreak ?? 0}
                                    </Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statLabel}>Lessons</Text>
                                    <Text style={styles.statValue}>
                                        {snapshot?.completedLessonIds.length ?? 0}
                                    </Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statLabel}>Quiz Wins</Text>
                                    <Text style={styles.statValue}>
                                        {snapshot?.completedQuizIds.length ?? 0}
                                    </Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statLabel}>Songs</Text>
                                    <Text style={styles.statValue}>
                                        {snapshot?.completedSongIds.length ?? 0}
                                    </Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statLabel}>Badges</Text>
                                    <Text style={styles.statValue}>
                                        {snapshot?.unlockedBadgeIds.length ?? 0}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.libraryCard}>
                                <Text style={styles.libraryTitle}>Your Libraries</Text>
                                <Text style={styles.librarySubtitle}>
                                    These buttons open the things you have saved, completed, or can
                                    still unlock.
                                </Text>

                                <View style={styles.libraryButtonColumn}>
                                    <LibraryButton
                                        icon="book-outline"
                                        label="Lessons"
                                        meta="Completed premium lessons"
                                        count={`${completedLessons.length}`}
                                        active={activeShelf === 'lessons'}
                                        onPress={() => setActiveShelf('lessons')}
                                    />
                                    <LibraryButton
                                        icon="musical-notes-outline"
                                        label="Songs"
                                        meta="Song Flow saves and Studio saves"
                                        count={songCardCount}
                                        active={activeShelf === 'songs'}
                                        onPress={() => setActiveShelf('songs')}
                                    />
                                    <LibraryButton
                                        icon="ribbon-outline"
                                        label="Badges"
                                        meta="All available achievements"
                                        count={badgeCount}
                                        active={activeShelf === 'badges'}
                                        onPress={() => setActiveShelf('badges')}
                                    />
                                </View>

                                {activeShelf === 'lessons' ? (
                                    <View style={styles.shelfCard}>
                                        <View style={styles.shelfHeaderRow}>
                                            <View>
                                                <Text style={styles.shelfTitle}>
                                                    Completed Lessons
                                                </Text>
                                                <Text style={styles.shelfSubtitle}>
                                                    {completedLessons.length} of{' '}
                                                    {LESSON_PACKS.length} lessons finished
                                                </Text>
                                            </View>
                                        </View>

                                        {completedLessons.length === 0 ? (
                                            <View style={styles.emptyState}>
                                                <Text style={styles.emptyStateTitle}>
                                                    No completed lessons yet
                                                </Text>
                                                <Text style={styles.emptyStateBody}>
                                                    Finish a lesson in Theory and it will appear
                                                    here with its details.
                                                </Text>
                                            </View>
                                        ) : (
                                            <>
                                                <View style={styles.listColumn}>
                                                    {completedLessons.map((lesson) => {
                                                        const active =
                                                            lesson.id === selectedLessonId;
                                                        return (
                                                            <TouchableOpacity
                                                                key={lesson.id}
                                                                style={[
                                                                    styles.listItem,
                                                                    active && styles.listItemActive,
                                                                ]}
                                                                onPress={() =>
                                                                    setSelectedLessonId(lesson.id)
                                                                }
                                                            >
                                                                <View style={styles.listIconWrap}>
                                                                    <Ionicons
                                                                        name="school-outline"
                                                                        size={18}
                                                                        color={COLORS.primary}
                                                                    />
                                                                </View>
                                                                <View style={styles.listItemBody}>
                                                                    <Text
                                                                        style={styles.listItemTitle}
                                                                    >
                                                                        {lesson.title}
                                                                    </Text>
                                                                    <Text
                                                                        style={styles.listItemMeta}
                                                                    >
                                                                        {lesson.instrument} •{' '}
                                                                        {lesson.tier} •{' '}
                                                                        {lesson.durationMin} min
                                                                    </Text>
                                                                </View>
                                                                <Ionicons
                                                                    name="chevron-forward"
                                                                    size={18}
                                                                    color={COLORS.textDim}
                                                                />
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                                {selectedLesson
                                                    ? renderLessonDetail(selectedLesson)
                                                    : null}
                                            </>
                                        )}
                                    </View>
                                ) : null}

                                {activeShelf === 'songs' ? (
                                    <View style={styles.shelfCard}>
                                        <View style={styles.songModeRow}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.songModeChip,
                                                    activeSongMode === 'flow' &&
                                                        styles.songModeChipActive,
                                                ]}
                                                onPress={() => setActiveSongMode('flow')}
                                            >
                                                <Text
                                                    style={[
                                                        styles.songModeChipText,
                                                        activeSongMode === 'flow' &&
                                                            styles.songModeChipTextActive,
                                                    ]}
                                                >
                                                    Song Flow ({flowSongs.length})
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[
                                                    styles.songModeChip,
                                                    activeSongMode === 'studio' &&
                                                        styles.songModeChipActive,
                                                ]}
                                                onPress={() => setActiveSongMode('studio')}
                                            >
                                                <Text
                                                    style={[
                                                        styles.songModeChipText,
                                                        activeSongMode === 'studio' &&
                                                            styles.songModeChipTextActive,
                                                    ]}
                                                >
                                                    Studio ({keyedStudioSaves.length})
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {activeSongMode === 'flow' ? (
                                            flowSongs.length === 0 ? (
                                                <View style={styles.emptyState}>
                                                    <Text style={styles.emptyStateTitle}>
                                                        No Song Flow saves yet
                                                    </Text>
                                                    <Text style={styles.emptyStateBody}>
                                                        Import a song in the Songs tab or complete a
                                                        built-in song and it will show up here.
                                                    </Text>
                                                </View>
                                            ) : (
                                                <>
                                                    <View style={styles.listColumn}>
                                                        {flowSongs.map((song) => {
                                                            const active =
                                                                song.id === selectedFlowSongId;
                                                            return (
                                                                <TouchableOpacity
                                                                    key={song.id}
                                                                    style={[
                                                                        styles.listItem,
                                                                        active &&
                                                                            styles.listItemActive,
                                                                    ]}
                                                                    onPress={() =>
                                                                        setSelectedFlowSongId(
                                                                            song.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <View
                                                                        style={styles.listIconWrap}
                                                                    >
                                                                        <Ionicons
                                                                            name="musical-notes-outline"
                                                                            size={18}
                                                                            color={COLORS.primary}
                                                                        />
                                                                    </View>
                                                                    <View
                                                                        style={styles.listItemBody}
                                                                    >
                                                                        <Text
                                                                            style={
                                                                                styles.listItemTitle
                                                                            }
                                                                        >
                                                                            {song.title}
                                                                        </Text>
                                                                        <Text
                                                                            style={
                                                                                styles.listItemMeta
                                                                            }
                                                                        >
                                                                            {song.artist} •{' '}
                                                                            {song.isImported
                                                                                ? 'Imported'
                                                                                : 'Built-In'}{' '}
                                                                            • {song.difficulty}
                                                                        </Text>
                                                                    </View>
                                                                    <Ionicons
                                                                        name="chevron-forward"
                                                                        size={18}
                                                                        color={COLORS.textDim}
                                                                    />
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                    {selectedFlowSong
                                                        ? renderFlowSongDetail(selectedFlowSong)
                                                        : null}
                                                </>
                                            )
                                        ) : null}

                                        {activeSongMode === 'studio' ? (
                                            keyedStudioSaves.length === 0 ? (
                                                <View style={styles.emptyState}>
                                                    <Text style={styles.emptyStateTitle}>
                                                        No Studio saves yet
                                                    </Text>
                                                    <Text style={styles.emptyStateBody}>
                                                        Save a traffic study from Studio and it will
                                                        show up here under your profile.
                                                    </Text>
                                                </View>
                                            ) : (
                                                <>
                                                    <View style={styles.listColumn}>
                                                        {keyedStudioSaves.map((song) => {
                                                            const active =
                                                                song.key === selectedStudioSongKey;
                                                            return (
                                                                <TouchableOpacity
                                                                    key={song.key}
                                                                    style={[
                                                                        styles.listItem,
                                                                        active &&
                                                                            styles.listItemActive,
                                                                    ]}
                                                                    onPress={() =>
                                                                        setSelectedStudioSongKey(
                                                                            song.key,
                                                                        )
                                                                    }
                                                                >
                                                                    <View
                                                                        style={styles.listIconWrap}
                                                                    >
                                                                        <Ionicons
                                                                            name="albums-outline"
                                                                            size={18}
                                                                            color={COLORS.primary}
                                                                        />
                                                                    </View>
                                                                    <View
                                                                        style={styles.listItemBody}
                                                                    >
                                                                        <Text
                                                                            style={
                                                                                styles.listItemTitle
                                                                            }
                                                                        >
                                                                            {song.songName}
                                                                        </Text>
                                                                        <Text
                                                                            style={
                                                                                styles.listItemMeta
                                                                            }
                                                                        >
                                                                            {song.markers.length}{' '}
                                                                            markers •{' '}
                                                                            {formatSavedAt(
                                                                                song.createdAt,
                                                                            )}
                                                                        </Text>
                                                                    </View>
                                                                    <Ionicons
                                                                        name="chevron-forward"
                                                                        size={18}
                                                                        color={COLORS.textDim}
                                                                    />
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                    {selectedStudioSong
                                                        ? renderStudioSongDetail(selectedStudioSong)
                                                        : null}
                                                </>
                                            )
                                        ) : null}
                                    </View>
                                ) : null}

                                {activeShelf === 'badges' ? (
                                    <View style={styles.shelfCard}>
                                        <Text style={styles.shelfTitle}>Badge Wall</Text>
                                        <Text style={styles.shelfSubtitle}>
                                            Locked badges stay black and white. Unlocked badges
                                            light up in color.
                                        </Text>

                                        <View style={styles.badgeGrid}>
                                            {BADGE_DEFINITIONS.map((badge) => {
                                                const unlocked = unlockedBadgeIds.has(badge.id);
                                                const active = selectedBadgeId === badge.id;
                                                const visual =
                                                    BADGE_VISUALS[badge.id] ??
                                                    BADGE_VISUALS.first_song;

                                                return (
                                                    <TouchableOpacity
                                                        key={badge.id}
                                                        style={[
                                                            styles.badgeTileOuter,
                                                            active && styles.badgeTileOuterActive,
                                                        ]}
                                                        onPress={() => setSelectedBadgeId(badge.id)}
                                                    >
                                                        {unlocked ? (
                                                            <LinearGradient
                                                                colors={[visual.start, visual.end]}
                                                                start={{ x: 0, y: 0 }}
                                                                end={{ x: 1, y: 1 }}
                                                                style={styles.badgeTile}
                                                            >
                                                                <Ionicons
                                                                    name={visual.icon}
                                                                    size={22}
                                                                    color={COLORS.panelAlt}
                                                                />
                                                                <Text
                                                                    style={
                                                                        styles.badgeTileTitleUnlocked
                                                                    }
                                                                >
                                                                    {badge.title}
                                                                </Text>
                                                                <Text
                                                                    style={
                                                                        styles.badgeTileStatusUnlocked
                                                                    }
                                                                >
                                                                    Unlocked
                                                                </Text>
                                                            </LinearGradient>
                                                        ) : (
                                                            <View
                                                                style={[
                                                                    styles.badgeTile,
                                                                    styles.badgeTileLocked,
                                                                ]}
                                                            >
                                                                <Ionicons
                                                                    name={visual.icon}
                                                                    size={22}
                                                                    color={COLORS.textDim}
                                                                />
                                                                <Text
                                                                    style={
                                                                        styles.badgeTileTitleLocked
                                                                    }
                                                                >
                                                                    {badge.title}
                                                                </Text>
                                                                <Text
                                                                    style={
                                                                        styles.badgeTileStatusLocked
                                                                    }
                                                                >
                                                                    Locked
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>

                                        {selectedBadge ? renderBadgeDetail(selectedBadge) : null}
                                    </View>
                                ) : null}
                            </View>
                        </>
                    )}

                    <GamificationDeck
                        snapshot={snapshot}
                        leaderboard={leaderboard}
                        isRefreshing={isRefreshing}
                        onRefresh={() => {
                            void loadProfile();
                        }}
                        showBadges={settings?.profileShowBadgeShelf !== false}
                        showLeaderboard={settings?.profileShowLeaderboard !== false}
                    />

                    <View
                        style={styles.settingsCard}
                        onLayout={(event) => setSettingsOffsetY(event.nativeEvent.layout.y)}
                    >
                        <Text style={styles.settingsTitle}>Settings</Text>
                        <Text style={styles.settingsSubtitle}>
                            Real controls for each tab, all saved locally.
                        </Text>

                        <View style={styles.settingsSectionCard}>
                            <Text style={styles.settingsSectionTitle}>General</Text>
                            <SettingRow
                                label="Haptics"
                                description="Use touch feedback on timing hits and misses."
                                value={settings?.hapticsEnabled ?? true}
                                onChange={(value) => void updateSetting('hapticsEnabled', value)}
                            />
                            <SettingRow
                                label="Leaderboard sync"
                                description="Send profile progress to the backend leaderboard."
                                value={settings?.leaderboardSyncEnabled ?? true}
                                onChange={(value) =>
                                    void updateSetting('leaderboardSyncEnabled', value)
                                }
                            />
                            <View style={styles.goalWrap}>
                                <Text style={styles.goalTitle}>Daily practice goal</Text>
                                <View style={styles.goalRow}>
                                    {GOAL_OPTIONS.map((goal) => {
                                        const active = settings?.practiceGoalMinutes === goal;
                                        return (
                                            <TouchableOpacity
                                                key={goal}
                                                style={[
                                                    styles.goalChip,
                                                    active && styles.goalChipActive,
                                                ]}
                                                onPress={() =>
                                                    void updateSetting('practiceGoalMinutes', goal)
                                                }
                                            >
                                                <Text
                                                    style={[
                                                        styles.goalChipText,
                                                        active && styles.goalChipTextActive,
                                                    ]}
                                                >
                                                    {goal} min
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>

                        <View style={styles.settingsSectionCard}>
                            <View style={styles.diagnosticsHeaderRow}>
                                <View style={styles.diagnosticsTitleWrap}>
                                    <Text style={styles.settingsSectionTitle}>
                                        Backend diagnostics
                                    </Text>
                                    <Text style={styles.diagnosticsSubtitle}>
                                        Verify the Expo app can reach the configured API.
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={[
                                        styles.diagnosticsButton,
                                        isCheckingApiDiagnostics &&
                                            styles.diagnosticsButtonDisabled,
                                    ]}
                                    disabled={isCheckingApiDiagnostics}
                                    onPress={() => void runApiDiagnostics()}
                                >
                                    <Text style={styles.diagnosticsButtonText}>
                                        {isCheckingApiDiagnostics
                                            ? 'Checking...'
                                            : 'Run check again'}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.diagnosticsGrid}>
                                <View style={styles.diagnosticsMetric}>
                                    <Text style={styles.diagnosticsLabel}>API base URL</Text>
                                    <Text style={styles.diagnosticsValue}>
                                        {apiDiagnostics?.baseUrl ?? 'Not configured'}
                                    </Text>
                                </View>
                                <View style={styles.diagnosticsMetric}>
                                    <Text style={styles.diagnosticsLabel}>Backend reachable</Text>
                                    <Text
                                        style={[
                                            styles.diagnosticsValue,
                                            apiDiagnostics?.ok
                                                ? styles.diagnosticsOk
                                                : styles.diagnosticsError,
                                        ]}
                                    >
                                        {apiDiagnostics
                                            ? apiDiagnostics.ok
                                                ? 'Yes'
                                                : 'No'
                                            : 'Not checked'}
                                    </Text>
                                </View>
                                <View style={styles.diagnosticsMetric}>
                                    <Text style={styles.diagnosticsLabel}>Status code</Text>
                                    <Text style={styles.diagnosticsValue}>
                                        {apiDiagnostics?.statusCode ?? '--'}
                                    </Text>
                                </View>
                                <View style={styles.diagnosticsMetric}>
                                    <Text style={styles.diagnosticsLabel}>Latency</Text>
                                    <Text style={styles.diagnosticsValue}>
                                        {typeof apiDiagnostics?.latencyMs === 'number'
                                            ? `${apiDiagnostics.latencyMs}ms`
                                            : '--'}
                                    </Text>
                                </View>
                                <View style={styles.diagnosticsMetric}>
                                    <Text style={styles.diagnosticsLabel}>Service</Text>
                                    <Text style={styles.diagnosticsValue}>
                                        {apiDiagnostics?.ok
                                            ? (apiDiagnostics.service ?? '--')
                                            : '--'}
                                    </Text>
                                </View>
                                <View style={styles.diagnosticsMetric}>
                                    <Text style={styles.diagnosticsLabel}>Environment</Text>
                                    <Text style={styles.diagnosticsValue}>
                                        {apiDiagnostics?.ok
                                            ? (apiDiagnostics.environment ?? '--')
                                            : '--'}
                                    </Text>
                                </View>
                                <View style={styles.diagnosticsMetric}>
                                    <Text style={styles.diagnosticsLabel}>Version</Text>
                                    <Text style={styles.diagnosticsValue}>
                                        {apiDiagnostics?.ok
                                            ? (apiDiagnostics.version ?? '--')
                                            : '--'}
                                    </Text>
                                </View>
                                <View style={styles.diagnosticsMetric}>
                                    <Text style={styles.diagnosticsLabel}>Last checked</Text>
                                    <Text style={styles.diagnosticsValue}>
                                        {apiDiagnosticsCheckedAt ?? '--'}
                                    </Text>
                                </View>
                            </View>

                            {apiDiagnostics && !apiDiagnostics.ok ? (
                                <Text style={styles.diagnosticsMessage}>
                                    {apiDiagnostics.message}
                                </Text>
                            ) : null}
                        </View>

                        <View style={styles.settingsSectionCard}>
                            <Text style={styles.settingsSectionTitle}>Theory Tab</Text>
                            <SettingRow
                                label="Lesson animations"
                                description="Show animated finger and motion guides in lesson visuals."
                                value={settings?.showLessonAnimations ?? true}
                                onChange={(value) =>
                                    void updateSetting('showLessonAnimations', value)
                                }
                            />
                            <SettingRow
                                label="Show game deck"
                                description="Show the streak, badge, and leaderboard deck at the top of Theory."
                                value={settings?.theoryShowGamificationDeck ?? true}
                                onChange={(value) =>
                                    void updateSetting('theoryShowGamificationDeck', value)
                                }
                            />
                            <SettingRow
                                label="Quiz explanation card"
                                description="Show the explanation card after answering a theory question."
                                value={settings?.theoryShowQuizExplanation ?? true}
                                onChange={(value) =>
                                    void updateSetting('theoryShowQuizExplanation', value)
                                }
                            />
                        </View>

                        <View style={styles.settingsSectionCard}>
                            <Text style={styles.settingsSectionTitle}>Practice Tab</Text>
                            <SettingRow
                                label="Backend pitch assist"
                                description="Prefer backend pitch help in the tuner when local reads are shaky."
                                value={settings?.practicePreferBackendPitchAssist ?? true}
                                onChange={(value) =>
                                    void updateSetting('practicePreferBackendPitchAssist', value)
                                }
                            />
                            <SettingRow
                                label="Show frequency readout"
                                description="Display the incoming Hz value in the tuner info panel."
                                value={settings?.practiceShowFrequencyReadout ?? true}
                                onChange={(value) =>
                                    void updateSetting('practiceShowFrequencyReadout', value)
                                }
                            />
                            <SettingRow
                                label="Show string helper"
                                description="Keep the string target chips visible under the tuner."
                                value={settings?.practiceShowStringHelper ?? true}
                                onChange={(value) =>
                                    void updateSetting('practiceShowStringHelper', value)
                                }
                            />
                        </View>

                        <View style={styles.settingsSectionCard}>
                            <Text style={styles.settingsSectionTitle}>Studio Tab</Text>
                            <SettingRow
                                label="Show coach note"
                                description="Display the preset study note under the traffic study header."
                                value={settings?.studioShowPresetNotes ?? true}
                                onChange={(value) =>
                                    void updateSetting('studioShowPresetNotes', value)
                                }
                            />
                            <SettingRow
                                label="Show focus hint"
                                description="Keep the structure focus hint visible in the track block."
                                value={settings?.studioShowFocusNotes ?? true}
                                onChange={(value) =>
                                    void updateSetting('studioShowFocusNotes', value)
                                }
                            />
                            <SettingRow
                                label="Quick markers"
                                description="Show the fast INTRO / CHORUS / BRIDGE marker buttons."
                                value={settings?.studioShowQuickMarkers ?? true}
                                onChange={(value) =>
                                    void updateSetting('studioShowQuickMarkers', value)
                                }
                            />
                        </View>

                        <View style={styles.settingsSectionCard}>
                            <Text style={styles.settingsSectionTitle}>Songs Tab</Text>
                            <SettingRow
                                label="Default to tabs"
                                description="Open Song Flow in Tabs mode instead of Chords mode."
                                value={settings?.songsPreferTabsDefault ?? false}
                                onChange={(value) =>
                                    void updateSetting('songsPreferTabsDefault', value)
                                }
                            />
                            <SettingRow
                                label="Show streak banner"
                                description="Show the streak reminder banner above the song picker."
                                value={settings?.songsShowStreakBanner ?? true}
                                onChange={(value) =>
                                    void updateSetting('songsShowStreakBanner', value)
                                }
                            />
                            <SettingRow
                                label="Backend pitch assist"
                                description="Prefer backend pitch help during live listening in Songs."
                                value={settings?.songsPreferBackendPitchAssist ?? true}
                                onChange={(value) =>
                                    void updateSetting('songsPreferBackendPitchAssist', value)
                                }
                            />
                            <View style={styles.goalWrap}>
                                <Text style={styles.goalTitle}>Seek jump size</Text>
                                <View style={styles.goalRow}>
                                    {SEEK_STEP_OPTIONS.map((seconds) => {
                                        const active = settings?.songsSeekStepSeconds === seconds;
                                        return (
                                            <TouchableOpacity
                                                key={seconds}
                                                style={[
                                                    styles.goalChip,
                                                    active && styles.goalChipActive,
                                                ]}
                                                onPress={() =>
                                                    void updateSetting(
                                                        'songsSeekStepSeconds',
                                                        seconds,
                                                    )
                                                }
                                            >
                                                <Text
                                                    style={[
                                                        styles.goalChipText,
                                                        active && styles.goalChipTextActive,
                                                    ]}
                                                >
                                                    {seconds}s
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>

                        <View style={styles.settingsSectionCard}>
                            <Text style={styles.settingsSectionTitle}>Profile Tab</Text>
                            <SettingRow
                                label="Show badge shelf"
                                description="Keep the badge cards visible inside your profile deck."
                                value={settings?.profileShowBadgeShelf ?? true}
                                onChange={(value) =>
                                    void updateSetting('profileShowBadgeShelf', value)
                                }
                            />
                            <SettingRow
                                label="Show leaderboard"
                                description="Keep the leaderboard section visible inside your profile deck."
                                value={settings?.profileShowLeaderboard ?? true}
                                onChange={(value) =>
                                    void updateSetting('profileShowLeaderboard', value)
                                }
                            />
                        </View>
                    </View>
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
        paddingHorizontal: 14,
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
        letterSpacing: 0.4,
    },
    subTitle: {
        color: COLORS.textDim,
        marginTop: 3,
        marginBottom: 14,
        fontSize: 12,
        lineHeight: 18,
    },
    heroCard: {
        borderRadius: 28,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        padding: 18,
        marginBottom: 12,
        ...SHADOWS.card,
    },
    heroTopRow: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        marginBottom: 14,
    },
    heroMain: {
        flex: 1,
    },
    heroKicker: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    nameInput: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: COLORS.textStrong,
        fontSize: 16,
        fontWeight: '800',
    },
    saveButton: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.primary,
        paddingHorizontal: 16,
        paddingVertical: 12,
        ...SHADOWS.soft,
    },
    saveButtonText: {
        color: COLORS.panelAlt,
        fontSize: 12,
        fontWeight: '900',
    },
    heroStatsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    heroMetric: {
        flex: 1,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        padding: 12,
    },
    heroMetricLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    heroMetricValue: {
        color: COLORS.textStrong,
        fontSize: 15,
        fontWeight: '900',
    },
    statGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 12,
    },
    statCard: {
        width: '47%',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        padding: 14,
        ...SHADOWS.soft,
    },
    statLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginBottom: 6,
    },
    statValue: {
        color: COLORS.textStrong,
        fontSize: 18,
        fontWeight: '900',
    },
    libraryCard: {
        borderRadius: 28,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        padding: 18,
        marginBottom: 12,
        ...SHADOWS.card,
    },
    libraryTitle: {
        color: COLORS.textStrong,
        fontSize: 18,
        fontWeight: '900',
    },
    librarySubtitle: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 4,
        marginBottom: 12,
    },
    libraryButtonColumn: {
        gap: 10,
    },
    libraryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        paddingHorizontal: 14,
        paddingVertical: 14,
        ...SHADOWS.soft,
    },
    libraryButtonActive: {
        borderColor: COLORS.primary,
        backgroundColor: withOpacity(COLORS.primary, 0.09),
    },
    libraryIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.panelAlt,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
    },
    libraryIconWrapActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    libraryButtonTextWrap: {
        flex: 1,
    },
    libraryButtonLabel: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 3,
    },
    libraryButtonMeta: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 17,
    },
    libraryButtonCount: {
        color: COLORS.textStrong,
        fontSize: 16,
        fontWeight: '900',
    },
    libraryButtonCountActive: {
        color: COLORS.primary,
    },
    shelfCard: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        padding: 12,
        marginTop: 14,
        ...SHADOWS.soft,
    },
    shelfHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    shelfTitle: {
        color: COLORS.textStrong,
        fontSize: 16,
        fontWeight: '900',
    },
    shelfSubtitle: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 3,
        marginBottom: 10,
    },
    listColumn: {
        gap: 8,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    listItemActive: {
        borderColor: COLORS.primary,
        backgroundColor: withOpacity(COLORS.primary, 0.08),
    },
    listIconWrap: {
        width: 38,
        height: 38,
        borderRadius: 13,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.panel,
    },
    listItemBody: {
        flex: 1,
    },
    listItemTitle: {
        color: COLORS.textStrong,
        fontSize: 13,
        fontWeight: '900',
        marginBottom: 3,
    },
    listItemMeta: {
        color: COLORS.textDim,
        fontSize: 11,
        lineHeight: 16,
    },
    detailCard: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        padding: 14,
        marginTop: 12,
        ...SHADOWS.soft,
    },
    detailHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },
    detailTitleWrap: {
        flex: 1,
    },
    detailKicker: {
        color: COLORS.primary,
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    detailTitle: {
        color: COLORS.textStrong,
        fontSize: 18,
        fontWeight: '900',
    },
    detailSubtitle: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 4,
    },
    detailPillRow: {
        alignItems: 'flex-end',
        gap: 8,
    },
    detailPill: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    detailPillText: {
        color: COLORS.textStrong,
        fontSize: 11,
        fontWeight: '800',
    },
    detailMetricRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10,
    },
    detailMetricCard: {
        flex: 1,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        padding: 10,
    },
    detailMetricLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    detailMetricValue: {
        color: COLORS.textStrong,
        fontSize: 13,
        fontWeight: '900',
    },
    detailBlockTitle: {
        color: COLORS.textStrong,
        fontSize: 13,
        fontWeight: '900',
        marginTop: 8,
        marginBottom: 4,
    },
    detailBody: {
        color: COLORS.text,
        fontSize: 12,
        lineHeight: 18,
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    tagChip: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    tagChipText: {
        color: COLORS.textStrong,
        fontSize: 11,
        fontWeight: '800',
    },
    detailHint: {
        color: COLORS.textDim,
        fontSize: 11,
        marginTop: 8,
    },
    detailActionButton: {
        marginTop: 14,
        borderRadius: 16,
        backgroundColor: COLORS.primary,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    detailActionButtonText: {
        color: COLORS.panelAlt,
        fontSize: 13,
        fontWeight: '900',
    },
    songModeRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    songModeChip: {
        flex: 1,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        paddingVertical: 10,
        alignItems: 'center',
    },
    songModeChipActive: {
        borderColor: COLORS.primary,
        backgroundColor: withOpacity(COLORS.primary, 0.1),
    },
    songModeChipText: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '800',
    },
    songModeChipTextActive: {
        color: COLORS.primary,
    },
    emptyState: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        padding: 16,
    },
    emptyStateTitle: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 6,
    },
    emptyStateBody: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
    },
    badgeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    badgeTileOuter: {
        width: '47%',
        borderRadius: 20,
    },
    badgeTileOuterActive: {
        shadowColor: COLORS.shadowDark,
        shadowOpacity: 0.16,
        shadowRadius: 12,
        shadowOffset: { width: 6, height: 6 },
        elevation: 7,
    },
    badgeTile: {
        minHeight: 124,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        padding: 14,
        justifyContent: 'space-between',
    },
    badgeTileLocked: {
        backgroundColor: '#EFF2F5',
        borderColor: '#DCE3EA',
    },
    badgeTileTitleUnlocked: {
        color: COLORS.panelAlt,
        fontSize: 13,
        fontWeight: '900',
    },
    badgeTileStatusUnlocked: {
        color: withOpacity(COLORS.panelAlt, 0.88),
        fontSize: 11,
        fontWeight: '700',
    },
    badgeTileTitleLocked: {
        color: '#677585',
        fontSize: 13,
        fontWeight: '900',
    },
    badgeTileStatusLocked: {
        color: '#8B97A4',
        fontSize: 11,
        fontWeight: '700',
    },
    badgeDetailHero: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        marginBottom: 8,
    },
    badgeDetailIconWrap: {
        width: 62,
        height: 62,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
    },
    badgeDetailTextWrap: {
        flex: 1,
    },
    settingsCard: {
        borderRadius: 24,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        padding: 16,
        marginBottom: 12,
        ...SHADOWS.card,
    },
    settingsSectionCard: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        padding: 12,
        marginTop: 12,
        ...SHADOWS.soft,
    },
    settingsTitle: {
        color: COLORS.textStrong,
        fontSize: 18,
        fontWeight: '900',
    },
    settingsSubtitle: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 4,
        marginBottom: 12,
    },
    settingsSectionTitle: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 10,
    },
    diagnosticsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },
    diagnosticsTitleWrap: {
        flex: 1,
    },
    diagnosticsSubtitle: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
    },
    diagnosticsButton: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.primary,
        backgroundColor: withOpacity(COLORS.primary, 0.12),
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    diagnosticsButtonDisabled: {
        opacity: 0.6,
    },
    diagnosticsButtonText: {
        color: COLORS.primary,
        fontSize: 12,
        fontWeight: '900',
    },
    diagnosticsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    diagnosticsMetric: {
        width: '48%',
        minWidth: 130,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        padding: 10,
    },
    diagnosticsLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        marginBottom: 5,
        textTransform: 'uppercase',
    },
    diagnosticsValue: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '800',
    },
    diagnosticsOk: {
        color: COLORS.success,
    },
    diagnosticsError: {
        color: COLORS.danger,
    },
    diagnosticsMessage: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 12,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        paddingHorizontal: 12,
        paddingVertical: 10,
        ...SHADOWS.soft,
    },
    signOutButtonText: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '800',
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        paddingHorizontal: 14,
        paddingVertical: 14,
        marginBottom: 10,
    },
    settingTextWrap: {
        flex: 1,
        paddingRight: 14,
    },
    settingLabel: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 4,
    },
    settingBody: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
    },
    goalWrap: {
        marginTop: 4,
    },
    goalTitle: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 10,
    },
    goalRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    goalChip: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    goalChipActive: {
        borderColor: COLORS.primary,
        backgroundColor: withOpacity(COLORS.primary, 0.1),
    },
    goalChipText: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '800',
    },
    goalChipTextActive: {
        color: COLORS.primary,
    },
});
