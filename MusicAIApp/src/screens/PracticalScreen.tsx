import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Canvas, Path, Skia, Group, Circle, Paint, Rect } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, withSequence } from 'react-native-reanimated';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system/legacy';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { autoCorrelate, decodeAudioData, getNoteInfo, medianFrequency } from '../utils/pitchDetection';
import { getClosestString, instrumentPitchRange, InstrumentType, TUNINGS } from '../utils/tuningData';
import { detectPitchFromClip } from '../services/api';
import { AppSettings, getAppSettings } from '../services/appSettings';
import PageTransitionView from '../components/PageTransitionView';
import PremiumBackdrop from '../components/PremiumBackdrop';
import PremiumHeroStrip from '../components/PremiumHeroStrip';
import ScreenSettingsButton from '../components/ScreenSettingsButton';
import SkeletonBlock from '../components/SkeletonBlock';
import { COLORS, SHADOWS } from '../theme';

const { width } = Dimensions.get('window');
const CX = width / 2;
const CY = 258;
const RADIUS = 124;

const RECORDING_OPTIONS: any = {
    isMeteringEnabled: true,
    android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
    },
    ios: {
        extension: '.wav',
        outputFormat: Audio.IOSOutputFormat.LINEARPCM,
        audioQuality: Audio.IOSAudioQuality.MAX,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
    },
    web: {
        mimeType: 'audio/webm',
        bitsPerSecond: 128000,
    },
};

export default function PracticalScreen() {
    const tabBarHeight = useBottomTabBarHeight();
    const [permissionResponse, requestPermission] = Audio.usePermissions();
    const [isListening, setIsListening] = useState(false);
    const [selectedInstrument, setSelectedInstrument] = useState<InstrumentType>('Guitar');
    const [targetNote, setTargetNote] = useState('--');
    const [detectedNote, setDetectedNote] = useState('--');
    const [detectedHz, setDetectedHz] = useState<number | null>(null);
    const [statusText, setStatusText] = useState('Ready');
    const [cents, setCents] = useState(0);
    const [activeString, setActiveString] = useState('--');
    const [usingBackendPitch, setUsingBackendPitch] = useState(false);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

    const recordingRef = useRef<Audio.Recording | null>(null);
    const isLoopingRef = useRef(false);
    const pitchHistoryRef = useRef<number[]>([]);
    const tickCountRef = useRef(0);

    const pitchValue = useSharedValue(0);
    const drumHitValue = useSharedValue(0);

    const loadSettings = useCallback(async () => {
        const settings = await getAppSettings();
        setAppSettings(settings);
    }, []);

    useEffect(() => {
        void (async () => {
            if (permissionResponse?.status !== 'granted') {
                await requestPermission();
            }
        })();
        void loadSettings();

        return () => {
            void stopListening();
        };
    }, [loadSettings, permissionResponse?.status, requestPermission]);

    useFocusEffect(
        useCallback(() => {
            void loadSettings();
        }, [loadSettings]),
    );

    const tunerStrings = useMemo(() => {
        if (selectedInstrument === 'Drums') {
            return [];
        }
        return TUNINGS[selectedInstrument];
    }, [selectedInstrument]);

    const analyzeLocalClip = async (uri: string): Promise<number | null> => {
        if (Platform.OS !== 'ios') {
            return null;
        }

        try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            let float32Data = decodeAudioData(base64);
            if (float32Data.length > 8192) {
                float32Data = float32Data.slice(0, 8192);
            }

            const range = instrumentPitchRange(selectedInstrument);
            const frequency = autoCorrelate(float32Data, 44100, range.min, range.max);
            if (frequency > 0) {
                return frequency;
            }
        } catch (error) {
            return null;
        }

        return null;
    };

    const analyzeBackendClip = async (uri: string) => {
        const extension = Platform.OS === 'ios' ? '.wav' : '.m4a';
        const result = await detectPitchFromClip(uri, `tuner-${Date.now()}${extension}`, selectedInstrument);
        if (result.status === 'success' && typeof result.frequency === 'number') {
            return result.frequency as number;
        }
        return null;
    };

    const applyPitchResult = (frequency: number) => {
        pitchHistoryRef.current = [...pitchHistoryRef.current.slice(-5), frequency];
        const stableFrequency = medianFrequency(pitchHistoryRef.current) ?? frequency;
        const noteInfo = getNoteInfo(stableFrequency);
        const closest = getClosestString(stableFrequency, selectedInstrument);

        setDetectedHz(stableFrequency);
        setDetectedNote(noteInfo.name);
        setTargetNote(closest.stringName);
        setActiveString(closest.stringName);
        setCents(closest.cents);

        const clampedNeedle = Math.max(-50, Math.min(50, closest.cents));
        pitchValue.value = withTiming(clampedNeedle, { duration: 120 });

        if (closest.isPerfect) {
            setStatusText('Perfect tune');
        } else if (closest.isClose) {
            setStatusText(closest.cents > 0 ? 'Slightly sharp' : 'Slightly flat');
        } else {
            setStatusText(closest.cents > 0 ? 'Too sharp' : 'Too flat');
        }
    };

    const applyDrumResult = async (uri: string) => {
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            let float32Data = decodeAudioData(base64);
            if (float32Data.length > 4096) {
                float32Data = float32Data.slice(0, 4096);
            }

            let sum = 0;
            for (let i = 0; i < float32Data.length; i += 1) {
                sum += float32Data[i] * float32Data[i];
            }

            const rms = Math.sqrt(sum / Math.max(float32Data.length, 1));
            if (rms > 0.05) {
                setStatusText('Pocket locked');
                drumHitValue.value = withSequence(
                    withTiming(1.5, { duration: 50 }),
                    withTiming(0, { duration: 260 }),
                );
            } else {
                setStatusText('Waiting for a hit');
            }
        } catch (error) {
            setStatusText('Waiting for a hit');
        }
    };

    const tick = async () => {
        if (!isLoopingRef.current) {
            return;
        }

        try {
            const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
            recordingRef.current = recording;

            await new Promise((resolve) => setTimeout(resolve, 220));

            if (!isLoopingRef.current) {
                try {
                    await recording.stopAndUnloadAsync();
                } catch (error) {
                    // Ignore stop races.
                }
                return;
            }

            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            if (!uri) {
                return;
            }

            if (selectedInstrument === 'Drums') {
                await applyDrumResult(uri);
                return;
            }

            tickCountRef.current += 1;

            let frequency = await analyzeLocalClip(uri);
            let usedBackend = false;

            const preferBackendPitch = appSettings?.practicePreferBackendPitchAssist ?? true;

            if (preferBackendPitch) {
                const backendFrequency = await analyzeBackendClip(uri);
                if (backendFrequency) {
                    frequency = backendFrequency;
                    usedBackend = true;
                } else if (!frequency) {
                    frequency = await analyzeLocalClip(uri);
                }
            } else if (!frequency || tickCountRef.current % 2 === 0) {
                // Backend fallback keeps Android and compressed clips usable.
                const backendFrequency = await analyzeBackendClip(uri);
                if (backendFrequency) {
                    frequency = backendFrequency;
                    usedBackend = true;
                }
            }

            setUsingBackendPitch(usedBackend);

            if (frequency) {
                applyPitchResult(frequency);
            } else {
                pitchHistoryRef.current = [];
                setDetectedHz(null);
                setDetectedNote('--');
                setTargetNote('--');
                setActiveString('--');
                setCents(0);
                setStatusText('Listening...');
                pitchValue.value = withTiming(0, { duration: 120 });
            }
        } catch (error) {
            setUsingBackendPitch(false);
            setStatusText(selectedInstrument === 'Drums' ? 'Waiting for a hit' : 'Listening...');
        } finally {
            recordingRef.current = null;
            if (isLoopingRef.current) {
                setTimeout(() => {
                    void tick();
                }, 70);
            }
        }
    };

    const startListening = async () => {
        if (isLoopingRef.current) {
            return;
        }

        const permission = permissionResponse?.status === 'granted'
            ? permissionResponse
            : await requestPermission();

        if (permission.status !== 'granted') {
            setStatusText('Microphone permission needed');
            return;
        }

        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });

        pitchHistoryRef.current = [];
        tickCountRef.current = 0;
        setIsListening(true);
        isLoopingRef.current = true;
        setStatusText(selectedInstrument === 'Drums' ? 'Waiting for a hit' : 'Listening...');
        void tick();
    };

    const stopListening = async () => {
        isLoopingRef.current = false;
        setIsListening(false);

        if (recordingRef.current) {
            try {
                await recordingRef.current.stopAndUnloadAsync();
            } catch (error) {
                // Ignore stop races.
            }
            recordingRef.current = null;
        }

        pitchHistoryRef.current = [];
        setDetectedHz(null);
        setDetectedNote('--');
        setTargetNote('--');
        setActiveString('--');
        setCents(0);
        setUsingBackendPitch(false);
        setStatusText('Ready');
        pitchValue.value = withTiming(0, { duration: 200 });
        drumHitValue.value = withTiming(0, { duration: 160 });

        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });
    };

    const arcPath = Skia.Path.Make();
    arcPath.addArc({ x: CX - RADIUS, y: CY - RADIUS, width: RADIUS * 2, height: RADIUS * 2 }, 180, 180);

    const needlePath = useDerivedValue(() => {
        const path = Skia.Path.Make();
        const angle = (Math.max(-50, Math.min(50, pitchValue.value)) / 50) * 90;
        const radian = (angle * Math.PI) / 180;
        const tipX = CX + RADIUS * Math.cos(radian - Math.PI / 2);
        const tipY = CY + RADIUS * Math.sin(radian - Math.PI / 2);
        path.moveTo(CX, CY);
        path.lineTo(tipX, tipY);
        return path;
    }, [pitchValue]);

    const needleColor = useDerivedValue(
        () => (Math.abs(pitchValue.value) < 5 ? COLORS.success : COLORS.primary),
        [pitchValue],
    );

    const drumRadius = useDerivedValue(() => 56 + (drumHitValue.value * 58), [drumHitValue]);
    const drumOpacity = useDerivedValue(() => 0.25 + (drumHitValue.value * 0.6), [drumHitValue]);
    const isBootLoading = !appSettings;

    return (
        <LinearGradient
            colors={[COLORS.panelAlt, COLORS.background, COLORS.backgroundAlt]}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.92, y: 1 }}
            style={styles.screen}
        >
            <PremiumBackdrop variant="light" />
            <PageTransitionView style={styles.screen}>
            <ScrollView
                contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + 28 }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.pixelGlowA} />
                <View style={styles.pixelGlowB} />

                <View style={styles.headerRow}>
                    <View style={styles.headerTextWrap}>
                        <Text style={styles.header}>Practice Deck</Text>
                        <Text style={styles.subHeader}>Blackroom tuner with live pitch tracking and cleaner instrument feedback</Text>
                    </View>
                    <ScreenSettingsButton />
                </View>

                <PremiumHeroStrip
                    icon="radio-outline"
                    eyebrow="Live Practice"
                    title="A cleaner tuner that feels alive the second you open it."
                    body="Fast instrument switching, steadier pitch reading, and a clearer tuning lane without changing the workflow you already know."
                    metrics={[
                        { label: 'Mode', value: selectedInstrument },
                        { label: 'Engine', value: usingBackendPitch ? 'AI Assist' : 'On Device' },
                        { label: 'Mic', value: isListening ? 'Live' : 'Ready' },
                    ]}
                />

                {isBootLoading ? (
                    <>
                        <View style={styles.selectorContainer}>
                            {[0, 1, 2, 3].map((index) => (
                                <SkeletonBlock key={`practice-selector-${index}`} style={{ flex: 1, height: 48 }} />
                            ))}
                        </View>

                        <View style={styles.heroCard}>
                            <View style={styles.infoRow}>
                                {[0, 1, 2].map((index) => (
                                    <SkeletonBlock key={`practice-info-${index}`} style={{ flex: 1, height: 52 }} />
                                ))}
                            </View>
                            <SkeletonBlock style={{ width: '100%', height: 320, marginTop: 14, marginBottom: 14 }} />
                            <View style={styles.readoutRow}>
                                {[0, 1, 2].map((index) => (
                                    <SkeletonBlock key={`practice-readout-${index}`} style={{ flex: 1, height: 58 }} />
                                ))}
                            </View>
                        </View>

                        <View style={styles.footerCard}>
                            <SkeletonBlock style={{ width: 132, height: 16, marginBottom: 12 }} />
                            <SkeletonBlock style={{ width: '92%', height: 12, marginBottom: 8 }} />
                            <SkeletonBlock style={{ width: '76%', height: 12, marginBottom: 18 }} />
                            <SkeletonBlock style={{ width: '100%', height: 54 }} />
                        </View>
                    </>
                ) : (
                <>
                <View style={styles.selectorContainer}>
                    {(['Guitar', 'Bass', 'Ukulele', 'Drums'] as InstrumentType[]).map((inst) => (
                        <TouchableOpacity
                            key={inst}
                            style={[styles.selectorBtn, selectedInstrument === inst && styles.selectorBtnActive]}
                            onPress={() => {
                                void stopListening();
                                setSelectedInstrument(inst);
                            }}
                        >
                            <Text style={[styles.selectorText, selectedInstrument === inst && styles.selectorTextActive]}>
                                {inst}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={styles.heroCard}>
                    <View style={styles.infoRow}>
                        <View style={styles.infoBox}>
                            <Text style={styles.infoLabel}>TARGET</Text>
                            <Text style={styles.infoValue}>{targetNote}</Text>
                        </View>
                        <View style={styles.infoBox}>
                            <Text style={styles.infoLabel}>NOTE</Text>
                            <Text style={styles.infoValue}>{detectedNote}</Text>
                        </View>
                        <View style={styles.infoBox}>
                            <Text style={styles.infoLabel}>INPUT</Text>
                            <Text style={styles.infoValue}>
                                {appSettings?.practiceShowFrequencyReadout === false
                                    ? 'Hidden'
                                    : detectedHz ? `${detectedHz.toFixed(1)} Hz` : '--'}
                            </Text>
                        </View>
                    </View>

                    <Canvas style={{ width, height: 320 }}>
                        <Rect x={18} y={44} width={width - 36} height={218} color={COLORS.backgroundAlt} />
                        <Rect x={30} y={56} width={width - 60} height={194} color={COLORS.panel} />

                        {selectedInstrument === 'Drums' ? (
                            <Group>
                                <Circle cx={CX} cy={CY} r={drumRadius} color={COLORS.primary}>
                                    <Paint opacity={drumOpacity} />
                                </Circle>
                                <Circle cx={CX} cy={CY} r={76} color={COLORS.pixelLine} style="stroke" strokeWidth={10} />
                                <Circle cx={CX} cy={CY} r={40} color={COLORS.panelAlt} style="stroke" strokeWidth={4} />
                            </Group>
                        ) : (
                            <Group>
                                <Path path={arcPath} color={COLORS.pixelLine} style="stroke" strokeWidth={18} strokeCap="round" />
                                <Path path={needlePath} color={needleColor} style="stroke" strokeWidth={8} strokeCap="square" />
                                <Circle cx={CX} cy={CY} r={12} color={COLORS.panelAlt} />
                            </Group>
                        )}
                    </Canvas>

                    <View style={styles.readoutRow}>
                        <View style={styles.readoutCard}>
                            <Text style={styles.readoutLabel}>CENTS</Text>
                            <Text style={styles.readoutValue}>{selectedInstrument === 'Drums' ? '--' : Math.round(cents)}</Text>
                        </View>
                        <View style={styles.readoutCard}>
                            <Text style={styles.readoutLabel}>STRING</Text>
                            <Text style={styles.readoutValue}>{activeString}</Text>
                        </View>
                        <View style={styles.readoutCard}>
                            <Text style={styles.readoutLabel}>ENGINE</Text>
                            <Text style={styles.readoutValue}>{usingBackendPitch ? 'AI' : 'LOCAL'}</Text>
                        </View>
                    </View>

                    <Text
                        style={[
                            styles.status,
                            { color: statusText.includes('Perfect') ? COLORS.success : COLORS.textStrong },
                        ]}
                    >
                        {statusText}
                    </Text>
                </View>

                {selectedInstrument !== 'Drums' && appSettings?.practiceShowStringHelper !== false && (
                    <View style={styles.stringsPanel}>
                        <Text style={styles.panelTitle}>Strings</Text>
                        <View style={styles.stringsRow}>
                            {tunerStrings.map((stringData) => {
                                const isActive = stringData.name === activeString;
                                return (
                                    <View key={stringData.name} style={[styles.stringChip, isActive && styles.stringChipActive]}>
                                        <Text style={[styles.stringChipText, isActive && styles.stringChipTextActive]}>
                                            {stringData.name}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                <View style={styles.footerCard}>
                    <Text style={styles.footerTitle}>Session Control</Text>
                    <Text style={styles.footerText}>
                        For the strongest read, pluck one string at a time and keep the phone close to the guitar, bass, or amp.
                    </Text>

                    <TouchableOpacity
                        style={[styles.button, isListening ? styles.stopButton : styles.startButton]}
                        onPress={() => void (isListening ? stopListening() : startListening())}
                    >
                        <Text style={styles.buttonText}>{isListening ? 'Stop Listening' : 'Start Listening'}</Text>
                    </TouchableOpacity>
                </View>
                </>
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
    container: {
        paddingTop: 56,
        paddingHorizontal: 12,
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
    pixelGlowA: {
        position: 'absolute',
        top: 74,
        left: -40,
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(116, 0, 184, 0.12)',
    },
    pixelGlowB: {
        position: 'absolute',
        top: 180,
        right: -40,
        width: 170,
        height: 170,
        borderRadius: 85,
        backgroundColor: 'rgba(78, 168, 222, 0.12)',
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
    selectorContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    selectorBtn: {
        flex: 1,
        paddingVertical: 11,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        alignItems: 'center',
        borderRadius: 20,
        ...SHADOWS.soft,
    },
    selectorBtnActive: {
        backgroundColor: COLORS.panel,
        borderColor: COLORS.primary,
        shadowColor: COLORS.primary,
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },
    selectorText: {
        color: COLORS.textDim,
        fontWeight: '800',
        fontSize: 12,
    },
    selectorTextActive: {
        color: COLORS.textStrong,
    },
    heroCard: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 28,
        paddingVertical: 14,
        marginBottom: 12,
        ...SHADOWS.card,
    },
    infoRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 12,
    },
    infoBox: {
        flex: 1,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        borderRadius: 16,
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    infoLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '700',
    },
    infoValue: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '800',
        marginTop: 2,
    },
    readoutRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 12,
        marginTop: -10,
    },
    readoutCard: {
        flex: 1,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        borderRadius: 16,
        paddingVertical: 8,
        alignItems: 'center',
    },
    readoutLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '700',
    },
    readoutValue: {
        color: COLORS.textStrong,
        fontSize: 16,
        fontWeight: '900',
        marginTop: 2,
    },
    status: {
        textAlign: 'center',
        fontSize: 18,
        fontWeight: '800',
        marginTop: 10,
        marginBottom: 2,
    },
    stringsPanel: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 24,
        padding: 14,
        marginBottom: 12,
        ...SHADOWS.soft,
    },
    panelTitle: {
        color: COLORS.textStrong,
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 10,
    },
    stringsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    stringChip: {
        minWidth: 52,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 10,
        alignItems: 'center',
    },
    stringChipActive: {
        borderColor: COLORS.secondary,
        backgroundColor: COLORS.panel,
    },
    stringChipText: {
        color: COLORS.textDim,
        fontSize: 12,
        fontWeight: '800',
    },
    stringChipTextActive: {
        color: COLORS.textStrong,
    },
    footerCard: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 24,
        padding: 14,
        ...SHADOWS.soft,
    },
    footerTitle: {
        color: COLORS.textStrong,
        fontSize: 15,
        fontWeight: '800',
    },
    footerText: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginTop: 6,
        marginBottom: 14,
    },
    button: {
        borderRadius: 18,
        alignItems: 'center',
        paddingVertical: 13,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        ...SHADOWS.soft,
    },
    startButton: {
        backgroundColor: COLORS.primary,
    },
    stopButton: {
        backgroundColor: COLORS.warning,
    },
    buttonText: {
        color: COLORS.panelAlt,
        fontSize: 14,
        fontWeight: '900',
    },
});
