import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { Canvas, Path, Skia, Rect } from '@shopify/react-native-skia';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NavigatorScreenParams, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { saveTrafficData, TrafficMarkerPayload } from '../services/api';
import { AppSettings, getAppSettings } from '../services/appSettings';
import PageTransitionView from '../components/PageTransitionView';
import PremiumBackdrop from '../components/PremiumBackdrop';
import PremiumCelebrationOverlay from '../components/PremiumCelebrationOverlay';
import PremiumHeroStrip from '../components/PremiumHeroStrip';
import ScreenSettingsButton from '../components/ScreenSettingsButton';
import SkeletonBlock from '../components/SkeletonBlock';
import { useAppToast } from '../components/AppToastProvider';
import { COLORS, SHADOWS } from '../theme';
import { TRAFFIC_ANALYSIS_LIBRARY, TrafficAnalysisPreset } from '../data/trafficAnalysisLibrary';
import { getGamificationSnapshot } from '../services/gamification';
import { useAudioAnalysisJob } from '../hooks/useAudioAnalysisJob';
import { useCelebration } from '../hooks/useCelebration';

const { width } = Dimensions.get('window');
const WAVE_HEIGHT = 220;
const CENTER_Y = WAVE_HEIGHT / 2;
const PIXELS_PER_SECOND = 40;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const TOTAL_BAR_WIDTH = BAR_WIDTH + BAR_GAP;
const POINTS_PER_CHUNK = 100;
const CHUNK_WIDTH = POINTS_PER_CHUNK * TOTAL_BAR_WIDTH;

interface MarkerItem {
    id: number;
    label: string;
    color: string;
    x: number;
}

interface TrafficRouteParams {
    savedAnalysis?: {
        songName: string;
        duration: number;
        markers: TrafficMarkerPayload[];
        createdAt?: string | null;
    };
}

type MainTabsParamList = {
    Lessons: undefined;
    Tuner: undefined;
    Home: undefined;
    Songs: undefined;
    Profile: { focusSettings?: boolean } | undefined;
};

type RootStackParamList = {
    MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined;
    Studio: TrafficRouteParams | undefined;
};

export default function TrafficScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Studio'>>();
    const route = useRoute<RouteProp<RootStackParamList, 'Studio'>>();
    const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
    const { showToast } = useAppToast();
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [songName, setSongName] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [fileUri, setFileUri] = useState<string | null>(null);
    const [bpm, setBpm] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [markers, setMarkers] = useState<MarkerItem[]>([]);
    const [activePresetId, setActivePresetId] = useState<string | null>(null);
    const [presetFocus, setPresetFocus] = useState<string | null>(null);
    const [presetNote, setPresetNote] = useState<string | null>(null);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [chunks, setChunks] = useState<number[][]>(
        new Array(10).fill(0).map(() => new Array(POINTS_PER_CHUNK).fill(0).map(() => Math.random() * 40)),
    );
    const { celebration, showCelebration } = useCelebration();
    const {
        isScanning: isAnalyzing,
        progressText: analysisProgressText,
        result: analysisResult,
        error: analysisError,
        startScan,
        clearResult,
        clearError,
        resetJob,
    } = useAudioAnalysisJob({ pollIntervalMs: 4000 });

    const flatListRef = useRef<FlatList<number[]>>(null);
    const scrollX = useRef(0);
    const isUserScrolling = useRef(false);
    const restoredAnalysisKeyRef = useRef<string | null>(null);
    const contentBottomPadding = (tabBarHeight || 0) + 28;

    const handleBackPress = useCallback(() => {
        if (typeof navigation.canGoBack === 'function' && navigation.canGoBack() && typeof navigation.goBack === 'function') {
            navigation.goBack();
            return;
        }

        navigation.navigate('MainTabs', { screen: 'Home' });
    }, [navigation]);

    const handleOpenSettings = useCallback(() => {
        navigation.navigate('MainTabs', {
            screen: 'Profile',
            params: { focusSettings: true },
        });
    }, [navigation]);

    const loadSettings = useCallback(async () => {
        const [settings, snapshot] = await Promise.all([
            getAppSettings(),
            getGamificationSnapshot(),
        ]);
        setAppSettings(settings);
        setCurrentUserId(snapshot.userId);
    }, []);

    useEffect(() => () => {
        if (sound) {
            void sound.unloadAsync();
        }
    }, [sound]);

    useFocusEffect(
        useCallback(() => {
            void loadSettings();
        }, [loadSettings]),
    );

    useEffect(() => {
        if (!analysisResult) {
            return;
        }

        setBpm(analysisResult.bpm);
        const nextMarkers = analysisResult.markers.map((marker) => ({
            id: marker.id || Date.now() + Math.random(),
            label: marker.label,
            color: marker.color,
            x: marker.time * PIXELS_PER_SECOND,
        }));
        setMarkers(nextMarkers);

        showToast({
            title: 'Analysis complete',
            message: analysisResult.message,
            variant: 'success',
        });
        showCelebration({
            title: 'Analysis ready',
            subtitle: analysisResult.message,
            variant: 'success',
        });
        clearResult();
    }, [analysisResult, clearResult, showCelebration, showToast]);

    useEffect(() => {
        if (!analysisError) {
            return;
        }

        showToast({
            title: 'Analysis failed',
            message: analysisError,
            variant: 'error',
        });
        clearError();
    }, [analysisError, clearError, showToast]);

    useEffect(() => {
        const params = (route.params ?? {}) as TrafficRouteParams;
        const savedAnalysis = params.savedAnalysis;
        if (!savedAnalysis) {
            return;
        }

        const routeKey = `${savedAnalysis.songName}-${savedAnalysis.createdAt ?? 'saved'}`;
        if (restoredAnalysisKeyRef.current === routeKey) {
            return;
        }

        restoredAnalysisKeyRef.current = routeKey;
        resetJob();
        setSongName(savedAnalysis.songName);
        setDuration(savedAnalysis.duration);
        setBpm(null);
        setFileUri(null);
        setIsPlaying(false);
        setActivePresetId(null);
        setPresetFocus('Loaded from your saved Studio shelf.');
        setPresetNote('You can edit, replay, and save this structure again from here.');
        setMarkers(savedAnalysis.markers.map((marker, index) => ({
            id: marker.id || (index + 1),
            label: marker.label,
            color: marker.color,
            x: marker.x,
        })));
        generateWaveformData(savedAnalysis.duration);
        showToast({
            title: 'Studio save opened',
            message: `${savedAnalysis.songName} is loaded back into Studio.`,
            variant: 'info',
        });

        if (sound) {
            void sound.unloadAsync();
            setSound(null);
        }
    }, [resetJob, route.params, showToast, sound]);

    const totalWaveWidth = useMemo(() => chunks.length * CHUNK_WIDTH, [chunks.length]);

    const pickSong = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'audio/*',
                copyToCacheDirectory: true,
            });

            if (result.canceled) {
                return;
            }

            resetJob();
            const file = result.assets[0];
            setSongName(file.name);
            setFileUri(file.uri);
            setMarkers([]);
            setBpm(null);
            setActivePresetId(null);
            setPresetFocus(null);
            setPresetNote(null);

            if (sound) {
                await sound.unloadAsync();
            }

            const { sound: newSound, status } = await Audio.Sound.createAsync(
                { uri: file.uri },
                { shouldPlay: false },
            );
            setSound(newSound);

            if (status.isLoaded) {
                const nextDuration = status.durationMillis ? status.durationMillis / 1000 : 180;
                setDuration(nextDuration);
                generateWaveformData(nextDuration);
            }
        } catch {
            showToast({
                title: 'Load failed',
                message: 'Failed to load that audio file.',
                variant: 'error',
            });
        }
    };

    const generateWaveformData = (seconds: number) => {
        const totalWidth = seconds * PIXELS_PER_SECOND;
        const totalBars = Math.floor(totalWidth / TOTAL_BAR_WIDTH);
        const totalChunks = Math.ceil(totalBars / POINTS_PER_CHUNK);

        const nextChunks = [];
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
            const chunkData = [];
            for (let i = 0; i < POINTS_PER_CHUNK; i += 1) {
                chunkData.push(12 + Math.random() * 72);
            }
            nextChunks.push(chunkData);
        }
        setChunks(nextChunks);
    };

    const WaveChunk = React.memo(({
        points,
        chunkMarkers,
    }: {
        points: number[];
        chunkMarkers: (MarkerItem & { localX: number })[];
    }) => {
        const path = useMemo(() => {
            const p = Skia.Path.Make();
            p.moveTo(0, CENTER_Y);
            points.forEach((val, i) => {
                const x = i * TOTAL_BAR_WIDTH;
                p.lineTo(x, CENTER_Y - val);
                p.lineTo(x, CENTER_Y + val);
            });
            return p;
        }, [points]);

        return (
            <View style={{ width: CHUNK_WIDTH, height: WAVE_HEIGHT }}>
                <Canvas style={{ flex: 1 }}>
                    <Rect x={0} y={0} width={CHUNK_WIDTH} height={WAVE_HEIGHT} color={COLORS.panelAlt} />
                    <Path path={path} color={COLORS.primary} style="stroke" strokeWidth={BAR_WIDTH} strokeCap="round" />
                </Canvas>

                {chunkMarkers.map((marker) => (
                    <View key={marker.id} style={[styles.markerTag, { left: marker.localX }]}>
                        <View style={[styles.markerLine, { backgroundColor: marker.color }]} />
                        <Text style={[styles.markerLabel, { backgroundColor: marker.color }]}>{marker.label}</Text>
                    </View>
                ))}
            </View>
        );
    });
    WaveChunk.displayName = 'WaveChunk';

    useEffect(() => {
        if (!sound) {
            return;
        }

        sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) {
                return;
            }

            if (status.isPlaying) {
                const currentSeconds = status.positionMillis / 1000;
                const targetX = currentSeconds * PIXELS_PER_SECOND;

                if (!isUserScrolling.current && flatListRef.current) {
                    flatListRef.current.scrollToOffset({ offset: targetX, animated: false });
                }
                scrollX.current = targetX;
            }

            if (status.didJustFinish) {
                setIsPlaying(false);
            }
        });
    }, [sound]);

    const togglePlay = async () => {
        if (!sound) {
            if (activePresetId) {
                showToast({
                    title: 'Study map only',
                    message: 'This built-in map is for structure study. Load an audio file if you want playback too.',
                    variant: 'info',
                });
            }
            return;
        }

        if (isPlaying) {
            await sound.pauseAsync();
            setIsPlaying(false);
        } else {
            await sound.playAsync();
            setIsPlaying(true);
        }
    };

    const addMarker = (label: string, color: string) => {
        const currentPos = scrollX.current;
        setMarkers((prev) => [...prev, { id: Date.now(), label, color, x: currentPos }]);
    };

    const loadPreset = async (preset: TrafficAnalysisPreset) => {
        resetJob();
        if (sound) {
            await sound.unloadAsync();
            setSound(null);
        }

        setIsPlaying(false);
        setSongName(`${preset.songTitle} - ${preset.artist}`);
        setDuration(preset.durationSec);
        setBpm(preset.bpm);
        setFileUri(null);
        setActivePresetId(preset.id);
        setPresetFocus(preset.focus);
        setPresetNote(preset.note);
        setMarkers(
            preset.markers.map((marker, index) => ({
                id: (index + 1),
                label: marker.label,
                color: marker.color,
                x: marker.timeSec * PIXELS_PER_SECOND,
            })),
        );
        generateWaveformData(preset.durationSec);
    };

    const handleAnalyze = async () => {
        if (!fileUri || !songName) {
            showToast({
                title: 'Track needed',
                message: 'Load a song before starting a scan.',
                variant: 'warning',
            });
            return;
        }

        setMarkers([]);
        setBpm(null);
        await startScan({
            fileUri,
            fileName: songName,
            userId: currentUserId ?? undefined,
        });
    };

    const handleSave = async () => {
        if (!songName) {
            showToast({
                title: 'Track needed',
                message: 'Load a song before saving a Studio map.',
                variant: 'warning',
            });
            return;
        }

        setIsSaving(true);
        const result = await saveTrafficData(songName, duration, markers, currentUserId ?? undefined);
        setIsSaving(false);

        if (result && result.status === 'success') {
            showToast({
                title: 'Saved',
                message: result.message,
                variant: 'success',
            });
            showCelebration({
                title: 'Studio save complete',
                subtitle: songName ? `${songName} was added to your Studio shelf.` : 'Your arrangement was saved.',
                variant: 'confetti',
            }, 2100);
        } else {
            const message = result && typeof result.message === 'string'
                ? result.message
                : 'Something went wrong while saving.';
            showToast({
                title: 'Save failed',
                message,
                variant: 'error',
            });
        }
    };

    return (
        <LinearGradient
            colors={[COLORS.panelAlt, COLORS.background, COLORS.backgroundAlt]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.container}
        >
            <PremiumBackdrop variant="studio" />
            <PageTransitionView style={styles.container}>
            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.glowA} />
                <View style={styles.glowB} />

                <View style={styles.headerRow}>
                    <TouchableOpacity
                        accessibilityLabel="Back"
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        onPress={handleBackPress}
                        style={styles.backButton}
                    >
                        <Ionicons name="arrow-back" size={18} color={COLORS.textStrong} />
                    </TouchableOpacity>
                    <View style={styles.headerTextWrap}>
                        <Text style={styles.header}>Studio Grid</Text>
                        <Text style={styles.subHeader}>Map sections, inspect motion, and save your arrangement data</Text>
                    </View>
                    <ScreenSettingsButton onPress={handleOpenSettings} />
                </View>

                <PremiumHeroStrip
                    icon="pulse-outline"
                    eyebrow="Arrangement View"
                    title="A more premium studio shell without changing how the analyzer works."
                    body="Preset studies, waveform structure, and save actions now sit inside a clearer visual system that feels more intentional."
                    metrics={[
                        { label: 'Studies', value: `${TRAFFIC_ANALYSIS_LIBRARY.length}` },
                        { label: 'Track', value: songName ? 'Loaded' : 'Waiting' },
                        { label: 'Markers', value: `${markers.length}` },
                    ]}
                />

                <Text style={styles.sectionTitle}>Built-In Traffic Studies</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
                    {TRAFFIC_ANALYSIS_LIBRARY.map((preset) => {
                        const isActive = preset.id === activePresetId;
                        return (
                            <TouchableOpacity
                                key={preset.id}
                                style={[styles.presetChip, isActive && styles.presetChipActive]}
                                onPress={() => void loadPreset(preset)}
                            >
                                <Text style={styles.presetTitle}>{preset.songTitle}</Text>
                                <Text style={styles.presetMeta}>{preset.artist}</Text>
                                <Text style={styles.presetTag}>{preset.difficulty} • {preset.bpm} BPM</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View style={styles.topPanel}>
                    <View style={styles.trackBlock}>
                        <Text style={styles.panelLabel}>TRACK</Text>
                        <Text numberOfLines={1} style={styles.trackTitle}>{songName || 'No file loaded yet'}</Text>
                        <Text style={styles.trackMeta}>
                            {bpm ? `${bpm} BPM` : 'Waiting for analysis'} • {duration ? `${duration.toFixed(1)}s` : '--'}
                        </Text>
                        {presetFocus && appSettings?.studioShowFocusNotes !== false && <Text style={styles.focusText}>{presetFocus}</Text>}
                    </View>

                    <View style={styles.topActions}>
                        <TouchableOpacity style={styles.pixelButton} onPress={pickSong}>
                            <Text style={styles.pixelButtonText}>Load</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.pixelButton} onPress={handleAnalyze}>
                            <Text style={styles.pixelButtonText}>{isAnalyzing ? 'Scan...' : 'Scan'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.pixelButton} onPress={handleSave}>
                            <Text style={styles.pixelButtonText}>{isSaving ? 'Save...' : 'Save'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {presetNote && appSettings?.studioShowPresetNotes !== false && (
                    <View style={styles.noteCard}>
                        <Text style={styles.noteLabel}>COACH NOTE</Text>
                        <Text style={styles.noteText}>{presetNote}</Text>
                    </View>
                )}

                <View style={styles.editorContainer}>
                    <View style={styles.playhead} />

                    <FlatList
                        ref={flatListRef}
                        data={chunks}
                        horizontal
                        keyExtractor={(_, index) => index.toString()}
                        renderItem={({ item, index }) => {
                            const chunkStart = index * CHUNK_WIDTH;
                            const chunkEnd = (index + 1) * CHUNK_WIDTH;

                            const localMarkers = markers
                                .filter((marker) => marker.x >= chunkStart && marker.x < chunkEnd)
                                .map((marker) => ({
                                    ...marker,
                                    localX: marker.x - chunkStart,
                                }));

                            return <WaveChunk points={item} chunkMarkers={localMarkers} />;
                        }}
                        windowSize={5}
                        initialNumToRender={3}
                        maxToRenderPerBatch={3}
                        removeClippedSubviews
                        contentContainerStyle={{ paddingHorizontal: width / 2 }}
                        onScroll={(event) => {
                            scrollX.current = event.nativeEvent.contentOffset.x;
                        }}
                        onScrollBeginDrag={() => {
                            isUserScrolling.current = true;
                        }}
                        onScrollEndDrag={() => {
                            isUserScrolling.current = false;
                        }}
                        onMomentumScrollEnd={() => {
                            isUserScrolling.current = false;
                        }}
                        scrollEventThrottle={16}
                        showsHorizontalScrollIndicator={false}
                    />

                    {isAnalyzing && (
                        <View style={styles.analysisOverlay}>
                            <Text style={styles.analysisKicker}>BACKGROUND SCAN</Text>
                            <Text style={styles.analysisTitle}>{analysisProgressText}</Text>
                            <Text style={styles.analysisCaption}>
                                You can switch apps while the backend works. Polling resumes automatically when TuneUp is active again.
                            </Text>
                            <SkeletonBlock style={{ width: '62%', height: 16, marginBottom: 12 }} />
                            <SkeletonBlock style={{ width: '88%', height: 12, marginBottom: 8 }} />
                            <SkeletonBlock style={{ width: '76%', height: 12, marginBottom: 18 }} />
                            <View style={styles.analysisBarRow}>
                                {[0, 1, 2, 3, 4, 5].map((index) => (
                                    <SkeletonBlock key={`analysis-bar-${index}`} style={{ flex: 1, height: 96 }} />
                                ))}
                            </View>
                        </View>
                    )}
                </View>

                <View style={styles.transportRow}>
                    <TouchableOpacity style={styles.transportButton} onPress={togglePlay}>
                        <Text style={styles.transportText}>{isPlaying ? 'Pause' : 'Play'}</Text>
                    </TouchableOpacity>

                    {appSettings?.studioShowQuickMarkers !== false && (
                        <View style={styles.markerGroup}>
                            <TouchableOpacity
                                style={[styles.markerButton, { borderColor: COLORS.warning }]}
                                onPress={() => addMarker('INTRO', COLORS.warning)}
                            >
                                <Text style={[styles.markerButtonText, { color: COLORS.warning }]}>INTRO</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.markerButton, { borderColor: COLORS.primary }]}
                                onPress={() => addMarker('CHORUS', COLORS.primary)}
                            >
                                <Text style={[styles.markerButtonText, { color: COLORS.primary }]}>CHORUS</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.markerButton, { borderColor: COLORS.accent }]}
                                onPress={() => addMarker('BRIDGE', COLORS.accent)}
                            >
                                <Text style={[styles.markerButtonText, { color: COLORS.accent }]}>BRIDGE</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <View style={styles.footerBar}>
                    <Text style={styles.footerLabel}>WAVE WIDTH</Text>
                    <Text style={styles.footerValue}>{Math.round(totalWaveWidth)} px</Text>
                    <Text style={styles.footerLabel}>MARKERS</Text>
                    <Text style={styles.footerValue}>{markers.length}</Text>
                </View>
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
    scrollContent: {
        paddingTop: 56,
        paddingHorizontal: 12,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
    },
    backButton: {
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        alignItems: 'center',
        justifyContent: 'center',
        ...SHADOWS.soft,
    },
    headerTextWrap: {
        flex: 1,
    },
    glowA: {
        position: 'absolute',
        top: 70,
        left: -40,
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: 'rgba(116, 0, 184, 0.12)',
    },
    glowB: {
        position: 'absolute',
        top: 160,
        right: -40,
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: 'rgba(78, 168, 222, 0.11)',
    },
    header: {
        color: COLORS.textStrong,
        fontSize: 32,
        fontWeight: '900',
    },
    subHeader: {
        color: COLORS.textDim,
        marginTop: 3,
        marginBottom: 12,
        fontSize: 12,
        fontWeight: '600',
    },
    sectionTitle: {
        color: COLORS.textStrong,
        fontSize: 13,
        fontWeight: '800',
        marginBottom: 8,
    },
    presetRow: {
        gap: 10,
        paddingBottom: 12,
    },
    presetChip: {
        minWidth: 164,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 12,
        ...SHADOWS.soft,
    },
    presetChipActive: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.panel,
    },
    presetTitle: {
        color: COLORS.textStrong,
        fontSize: 13,
        fontWeight: '900',
    },
    presetMeta: {
        color: COLORS.textDim,
        fontSize: 11,
        marginTop: 2,
    },
    presetTag: {
        color: COLORS.primary,
        fontSize: 10,
        fontWeight: '800',
        marginTop: 8,
        textTransform: 'uppercase',
    },
    topPanel: {
        flexDirection: 'row',
        gap: 10,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 26,
        padding: 14,
        marginBottom: 12,
        ...SHADOWS.card,
    },
    trackBlock: {
        flex: 1,
    },
    panelLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '700',
    },
    trackTitle: {
        color: COLORS.textStrong,
        fontSize: 16,
        fontWeight: '900',
        marginTop: 4,
    },
    trackMeta: {
        color: COLORS.primary,
        fontSize: 12,
        fontWeight: '700',
        marginTop: 6,
    },
    focusText: {
        color: COLORS.text,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 8,
    },
    topActions: {
        justifyContent: 'space-between',
        gap: 8,
    },
    pixelButton: {
        minWidth: 76,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        borderRadius: 18,
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 10,
        ...SHADOWS.soft,
    },
    pixelButtonText: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '900',
    },
    editorContainer: {
        height: WAVE_HEIGHT,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        borderRadius: 28,
        overflow: 'hidden',
        backgroundColor: COLORS.panelAlt,
        ...SHADOWS.card,
    },
    analysisOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(248, 251, 254, 0.84)',
        paddingHorizontal: 18,
        paddingVertical: 20,
        justifyContent: 'center',
    },
    analysisKicker: {
        color: COLORS.primary,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1,
        marginBottom: 8,
    },
    analysisTitle: {
        color: COLORS.textStrong,
        fontSize: 17,
        fontWeight: '900',
        lineHeight: 24,
        marginBottom: 8,
    },
    analysisCaption: {
        color: COLORS.text,
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 18,
    },
    analysisBarRow: {
        flexDirection: 'row',
        gap: 8,
    },
    playhead: {
        position: 'absolute',
        left: width / 2,
        top: 0,
        bottom: 0,
        width: 3,
        backgroundColor: COLORS.primary,
        zIndex: 10,
    },
    markerTag: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        alignItems: 'center',
        width: 2,
        zIndex: 20,
    },
    markerLine: {
        width: 2,
        height: '100%',
        opacity: 0.95,
    },
    markerLabel: {
        color: COLORS.panelAlt,
        fontSize: 9,
        fontWeight: '900',
        paddingHorizontal: 4,
        paddingVertical: 2,
        marginTop: 6,
        borderRadius: 4,
        overflow: 'hidden',
    },
    transportRow: {
        marginTop: 12,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
    },
    transportButton: {
        width: 92,
        borderWidth: 1,
        borderColor: COLORS.primary,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 18,
        alignItems: 'center',
        paddingVertical: 14,
        ...SHADOWS.soft,
    },
    transportText: {
        color: COLORS.textStrong,
        fontWeight: '900',
        fontSize: 13,
    },
    markerGroup: {
        flex: 1,
        flexDirection: 'row',
        gap: 8,
    },
    markerButton: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 18,
        backgroundColor: COLORS.panelAlt,
        alignItems: 'center',
        paddingVertical: 14,
        ...SHADOWS.soft,
    },
    markerButtonText: {
        fontSize: 11,
        fontWeight: '900',
    },
    footerBar: {
        marginTop: 12,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        borderRadius: 18,
        paddingVertical: 12,
        paddingHorizontal: 14,
        ...SHADOWS.soft,
    },
    noteCard: {
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        borderRadius: 18,
        padding: 12,
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
    footerLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '700',
    },
    footerValue: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '900',
    },
});
