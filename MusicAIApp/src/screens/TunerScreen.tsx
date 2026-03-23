import React, { memo, useEffect, useMemo, useState } from 'react';
import {
    Dimensions,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    FadeInDown,
    interpolateColor,
    useAnimatedStyle,
} from 'react-native-reanimated';
import PageTransitionView from '../components/PageTransitionView';
import PremiumBackdrop from '../components/PremiumBackdrop';
import ScreenSettingsButton from '../components/ScreenSettingsButton';
import {
    GUITAR_STANDARD_STRINGS,
    TUNER_A4_HZ,
    TUNER_BUFFER_SIZE,
    TUNER_CONFIDENCE_THRESHOLD,
    TUNER_IN_TUNE_CENTS,
    TUNER_NATIVE_MODULE_MESSAGE,
    TUNER_VISUAL_REFRESH_MS,
    useTuner,
} from '../hooks/useTuner';

const { width } = Dimensions.get('window');
const GAUGE_SIZE = Math.min(width - 48, 330);
const GAUGE_RADIUS = GAUGE_SIZE / 2;
const NEEDLE_HEIGHT = GAUGE_RADIUS - 26;
const TICK_MAJOR_HEIGHT = GAUGE_RADIUS - 4;
const TICK_MINOR_HEIGHT = GAUGE_RADIUS - 16;
const TICK_ANGLES = Array.from({ length: 13 }, (_, index) => -90 + (index * 15));
const FLAT_COLOR = '#FF9E57';
const SHARP_COLOR = '#FF5C69';
const IN_TUNE_COLOR = '#52F7A0';
const SCREEN_COLORS = ['#04070D', '#0A1321', '#121E32'] as const;
const MODE_OPTIONS = [
    { id: 'guided', label: 'Guided' },
    { id: 'manual', label: 'Manual' },
] as const;

type TunerMode = (typeof MODE_OPTIONS)[number]['id'];

const GaugeTick = memo(function GaugeTick({
    angle,
    major = false,
}: {
    angle: number;
    major?: boolean;
}) {
    const tickHeight = major ? TICK_MAJOR_HEIGHT : TICK_MINOR_HEIGHT;

    return (
        <View
            pointerEvents="none"
            style={[
                styles.tick,
                {
                    height: tickHeight,
                    transform: [
                        { translateY: tickHeight / 2 },
                        { rotate: `${angle}deg` },
                        { translateY: -(tickHeight / 2) },
                    ],
                },
            ]}
        >
            <View style={[styles.tickLine, !major && styles.tickLineMinor]} />
        </View>
    );
});

const TunerGauge = memo(function TunerGauge({
    needleRotation,
    needleCents,
    confidenceValue,
    inTuneValue,
}: {
    needleRotation: ReturnType<typeof useTuner>['needleRotation'];
    needleCents: ReturnType<typeof useTuner>['needleCents'];
    confidenceValue: ReturnType<typeof useTuner>['confidenceValue'];
    inTuneValue: ReturnType<typeof useTuner>['inTuneValue'];
}) {
    const glowStyle = useAnimatedStyle(() => ({
        opacity: 0.14 + (confidenceValue.value * 0.46),
        transform: [{ scale: 0.9 + (confidenceValue.value * 0.12) }],
        backgroundColor: interpolateColor(
            needleCents.value,
            [-50, -5, 0, 5, 50],
            [
                'rgba(255,158,87,0.38)',
                'rgba(255,158,87,0.22)',
                'rgba(82,247,160,0.34)',
                'rgba(255,92,105,0.22)',
                'rgba(255,92,105,0.38)',
            ],
        ),
    }));

    const ringStyle = useAnimatedStyle(() => ({
        borderColor: interpolateColor(
            needleCents.value,
            [-50, -5, 0, 5, 50],
            [
                'rgba(255,158,87,0.52)',
                'rgba(255,158,87,0.32)',
                'rgba(82,247,160,0.54)',
                'rgba(255,92,105,0.32)',
                'rgba(255,92,105,0.52)',
            ],
        ),
        opacity: 0.5 + (confidenceValue.value * 0.4),
    }));

    const needleStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            needleCents.value,
            [-50, -5, 0, 5, 50],
            [FLAT_COLOR, FLAT_COLOR, IN_TUNE_COLOR, SHARP_COLOR, SHARP_COLOR],
        ),
        transform: [
            { translateY: NEEDLE_HEIGHT / 2 },
            { rotate: `${needleRotation.value}deg` },
            { translateY: -(NEEDLE_HEIGHT / 2) },
        ],
    }));

    const hubStyle = useAnimatedStyle(() => ({
        borderColor: interpolateColor(inTuneValue.value, [0, 1], ['rgba(255,255,255,0.12)', IN_TUNE_COLOR]),
        backgroundColor: interpolateColor(
            needleCents.value,
            [-50, -5, 0, 5, 50],
            ['rgba(255,158,87,0.14)', 'rgba(255,158,87,0.12)', 'rgba(82,247,160,0.18)', 'rgba(255,92,105,0.12)', 'rgba(255,92,105,0.14)'],
        ),
    }));

    return (
        <View style={styles.gaugeWrap}>
            <Animated.View style={[styles.gaugeGlow, glowStyle]} />
            <Animated.View style={[styles.gaugeRing, ringStyle]} />

            {TICK_ANGLES.map((angle, index) => (
                <GaugeTick
                    key={`tuner-tick-${angle}`}
                    angle={angle}
                    major={index % 3 === 0}
                />
            ))}

            <View style={styles.gaugeLabelRow}>
                <Text style={styles.gaugeEdgeLabel}>-50</Text>
                <Text style={styles.gaugeCenterLabel}>IN TUNE</Text>
                <Text style={styles.gaugeEdgeLabel}>+50</Text>
            </View>

            <Animated.View style={[styles.needle, needleStyle]}>
                <View style={styles.needleTip} />
            </Animated.View>
            <Animated.View style={[styles.needleHub, hubStyle]} />
        </View>
    );
});

function formatFrequency(value: number | null) {
    if (!value) {
        return '--';
    }

    return `${value.toFixed(2)} Hz`;
}

function getTuningTone(targetCents: number, hasSignal: boolean) {
    if (!hasSignal) {
        return {
            label: 'Waiting for signal',
            detail: 'Play a clean single string close to the mic.',
            color: 'rgba(255,255,255,0.72)',
        };
    }

    if (Math.abs(targetCents) <= TUNER_IN_TUNE_CENTS) {
        return {
            label: 'In tune',
            detail: 'That string is centered and ready.',
            color: IN_TUNE_COLOR,
        };
    }

    if (targetCents < 0) {
        return {
            label: 'Flat',
            detail: 'Tighten the string slightly.',
            color: FLAT_COLOR,
        };
    }

    return {
        label: 'Sharp',
        detail: 'Loosen the string slightly.',
        color: SHARP_COLOR,
    };
}

function getActiveString(
    mode: TunerMode,
    manualStringId: string,
    guidedIndex: number,
) {
    if (mode === 'guided') {
        return GUITAR_STANDARD_STRINGS[guidedIndex] ?? GUITAR_STANDARD_STRINGS[0];
    }

    return GUITAR_STANDARD_STRINGS.find((string) => string.id === manualStringId) ?? GUITAR_STANDARD_STRINGS[0];
}

export default function TunerScreen() {
    const tabBarHeight = useBottomTabBarHeight();
    const isFocused = useIsFocused();
    const [mode, setMode] = useState<TunerMode>('guided');
    const [manualStringId, setManualStringId] = useState(GUITAR_STANDARD_STRINGS[0].id);
    const [guidedIndex, setGuidedIndex] = useState(0);
    const [wantsListening, setWantsListening] = useState(true);

    useEffect(() => {
        if (isFocused) {
            setWantsListening(true);
        }
    }, [isFocused]);

    const activeString = useMemo(
        () => getActiveString(mode, manualStringId, guidedIndex),
        [guidedIndex, manualStringId, mode],
    );

    const tuner = useTuner({
        instrument: 'Chromatic',
        targetFrequency: activeString.frequency,
        confidenceThreshold: TUNER_CONFIDENCE_THRESHOLD,
        uiSnapshotIntervalMs: TUNER_VISUAL_REFRESH_MS,
        enabled: isFocused && wantsListening,
    });

    const isSystemBlocked = !tuner.isNativeModuleAvailable || tuner.status === 'permission-denied';
    const shouldShowContinue = mode === 'guided' && tuner.hasSignal && Math.abs(tuner.targetCents) <= TUNER_IN_TUNE_CENTS;
    const tuningTone = getTuningTone(tuner.targetCents, tuner.hasSignal);
    const centsLabel = tuner.hasSignal ? `${tuner.targetCents > 0 ? '+' : ''}${tuner.targetCents.toFixed(1)} cents` : '-- cents';
    const confidenceLabel = `${Math.round(tuner.confidence * 100)}%`;
    const liveHzLabel = formatFrequency(tuner.frequency);
    const targetHzLabel = formatFrequency(activeString.frequency);

    const handleModeChange = (nextMode: TunerMode) => {
        setMode(nextMode);
    };

    const handleContinue = () => {
        setGuidedIndex((currentIndex) => (
            currentIndex >= GUITAR_STANDARD_STRINGS.length - 1
                ? 0
                : currentIndex + 1
        ));
    };

    const handleListeningAction = async () => {
        if (!tuner.isNativeModuleAvailable) {
            return;
        }

        if (tuner.status === 'permission-denied' && !tuner.canAskPermissionAgain) {
            await Linking.openSettings();
            return;
        }

        setWantsListening(true);
        await tuner.start();
    };

    const helpCardTitle = !tuner.isNativeModuleAvailable
        ? 'Native build required'
        : tuner.status === 'permission-denied'
            ? 'Microphone access needed'
            : null;
    const helpCardBody = !tuner.isNativeModuleAvailable
        ? TUNER_NATIVE_MODULE_MESSAGE
        : tuner.status === 'permission-denied'
            ? 'Turn on microphone access so the tuner can lock onto a live string.'
            : null;
    const helpCardButton = !tuner.isNativeModuleAvailable
        ? null
        : tuner.status === 'permission-denied'
            ? tuner.canAskPermissionAgain ? 'Allow Microphone' : 'Open Settings'
            : null;

    return (
        <LinearGradient
            colors={SCREEN_COLORS}
            start={{ x: 0.16, y: 0 }}
            end={{ x: 0.94, y: 1 }}
            style={styles.screen}
        >
            <PremiumBackdrop variant="song" />
            <PageTransitionView style={styles.screen}>
                <ScrollView
                    contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + 28 }]}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View entering={FadeInDown.duration(420)} style={styles.headerRow}>
                        <View style={styles.headerCopy}>
                            <Text style={styles.eyebrow}>Professional Guitar Tuner</Text>
                            <Text style={styles.header}>Tune by string, not by luck.</Text>
                            <Text style={styles.subHeader}>
                                Native pitch frames, exact cents math, and a fluid gauge built for real guitar strings.
                            </Text>
                        </View>
                        <ScreenSettingsButton />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(70).duration(440)} style={styles.heroCard}>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.04)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroFill}
                        >
                            <View style={styles.heroRow}>
                                <View style={styles.liveBadge}>
                                    <View style={[styles.liveDot, tuner.hasSignal && styles.liveDotActive]} />
                                    <Text style={styles.liveBadgeText}>{tuner.isListening ? 'Listening' : 'Idle'}</Text>
                                </View>
                                <View style={styles.specRow}>
                                    <View style={styles.specChip}>
                                        <Text style={styles.specChipLabel}>A4</Text>
                                        <Text style={styles.specChipValue}>{TUNER_A4_HZ} Hz</Text>
                                    </View>
                                    <View style={styles.specChip}>
                                        <Text style={styles.specChipLabel}>Buffer</Text>
                                        <Text style={styles.specChipValue}>{TUNER_BUFFER_SIZE}</Text>
                                    </View>
                                    <View style={styles.specChip}>
                                        <Text style={styles.specChipLabel}>Confidence</Text>
                                        <Text style={styles.specChipValue}>{Math.round(TUNER_CONFIDENCE_THRESHOLD * 100)}%</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={styles.modeRail}>
                                {MODE_OPTIONS.map((option) => {
                                    const active = option.id === mode;
                                    return (
                                        <Pressable
                                            key={option.id}
                                            onPress={() => handleModeChange(option.id)}
                                            style={({ pressed }) => [
                                                styles.modeButton,
                                                active && styles.modeButtonActive,
                                                pressed && styles.modeButtonPressed,
                                            ]}
                                        >
                                            <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <View style={styles.targetRow}>
                                <View>
                                    <Text style={styles.targetLabel}>Current target</Text>
                                    <Text style={styles.targetValue}>{activeString.noteName}</Text>
                                </View>
                                <View style={styles.targetMeta}>
                                    <Text style={styles.targetMetaText}>{targetHzLabel}</Text>
                                    <Text style={styles.targetMetaSubText}>{mode === 'guided' ? `String ${guidedIndex + 1} of 6` : 'Manual selection'}</Text>
                                </View>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(110).duration(460)} style={styles.gaugeCard}>
                        <LinearGradient
                            colors={['rgba(11,18,30,0.92)', 'rgba(17,25,43,0.92)', 'rgba(10,14,24,0.96)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.gaugeCardFill}
                        >
                            <Text style={styles.gaugeInstruction}>
                                {mode === 'guided'
                                    ? `Play the ${activeString.instructionLabel} string`
                                    : `Tune the ${activeString.noteName} string`}
                            </Text>
                            <Text style={[styles.tuningLabel, { color: tuningTone.color }]}>
                                {tuningTone.label}
                            </Text>
                            <Text style={styles.tuningDetail}>{tuningTone.detail}</Text>

                            <TunerGauge
                                needleRotation={tuner.needleRotation}
                                needleCents={tuner.needleCents}
                                confidenceValue={tuner.confidenceValue}
                                inTuneValue={tuner.inTuneValue}
                            />

                            <View style={styles.readoutRow}>
                                <View style={styles.readoutCard}>
                                    <Text style={styles.readoutLabel}>Live pitch</Text>
                                    <Text style={styles.readoutValue}>{liveHzLabel}</Text>
                                </View>
                                <View style={styles.readoutCard}>
                                    <Text style={styles.readoutLabel}>Deviation</Text>
                                    <Text style={[styles.readoutValue, { color: tuningTone.color }]}>{centsLabel}</Text>
                                </View>
                            </View>

                            <View style={styles.secondaryReadoutRow}>
                                <View style={styles.secondaryReadout}>
                                    <Text style={styles.secondaryReadoutLabel}>Detected</Text>
                                    <Text style={styles.secondaryReadoutValue}>{tuner.noteName}</Text>
                                </View>
                                <View style={styles.secondaryReadout}>
                                    <Text style={styles.secondaryReadoutLabel}>Target</Text>
                                    <Text style={styles.secondaryReadoutValue}>{activeString.noteName}</Text>
                                </View>
                                <View style={styles.secondaryReadout}>
                                    <Text style={styles.secondaryReadoutLabel}>Confidence</Text>
                                    <Text style={styles.secondaryReadoutValue}>{confidenceLabel}</Text>
                                </View>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(150).duration(480)} style={styles.selectionCard}>
                        <Text style={styles.sectionTitle}>
                            {mode === 'guided' ? 'Guided sequence' : 'String selector'}
                        </Text>
                        <Text style={styles.sectionBody}>
                            {mode === 'guided'
                                ? 'Work through the standard E-A-D-G-B-e order. When a string is centered, continue to the next one.'
                                : 'Jump straight to the string you want to tune and keep the target locked there.'}
                        </Text>

                        <View style={styles.stringGrid}>
                            {GUITAR_STANDARD_STRINGS.map((stringTarget) => {
                                const active = stringTarget.id === activeString.id;

                                return (
                                    <Pressable
                                        key={stringTarget.id}
                                        disabled={mode === 'guided'}
                                        onPress={() => setManualStringId(stringTarget.id)}
                                        style={({ pressed }) => [
                                            styles.stringButton,
                                            active && styles.stringButtonActive,
                                            pressed && mode === 'manual' && styles.stringButtonPressed,
                                            mode === 'guided' && styles.stringButtonGuided,
                                        ]}
                                    >
                                        <Text style={[styles.stringButtonNote, active && styles.stringButtonNoteActive]}>
                                            {stringTarget.shortLabel}
                                        </Text>
                                        <Text style={[styles.stringButtonName, active && styles.stringButtonNameActive]}>
                                            {stringTarget.noteName}
                                        </Text>
                                        <Text style={[styles.stringButtonFreq, active && styles.stringButtonFreqActive]}>
                                            {formatFrequency(stringTarget.frequency)}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {mode === 'guided' && shouldShowContinue ? (
                            <Animated.View entering={FadeInDown.delay(30).duration(320)}>
                                <Pressable
                                    onPress={handleContinue}
                                    style={({ pressed }) => [
                                        styles.continueButton,
                                        pressed && styles.continueButtonPressed,
                                    ]}
                                >
                                    <LinearGradient
                                        colors={['#59F8A5', '#39DA91', '#1BCB7F']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.continueButtonFill}
                                    >
                                        <Text style={styles.continueButtonText}>
                                            {guidedIndex === GUITAR_STANDARD_STRINGS.length - 1 ? 'Start Over' : 'Continue'}
                                        </Text>
                                        <Ionicons name="arrow-forward" size={18} color="#04110A" />
                                    </LinearGradient>
                                </Pressable>
                            </Animated.View>
                        ) : null}
                    </Animated.View>

                    {helpCardTitle && helpCardBody ? (
                        <Animated.View entering={FadeInDown.delay(190).duration(420)} style={styles.helpCard}>
                            <View style={styles.helpIconWrap}>
                                <Ionicons
                                    name={tuner.isNativeModuleAvailable ? 'mic-off-outline' : 'construct-outline'}
                                    size={22}
                                    color="#F7F8FC"
                                />
                            </View>
                            <View style={styles.helpCopy}>
                                <Text style={styles.helpTitle}>{helpCardTitle}</Text>
                                <Text style={styles.helpBody}>{helpCardBody}</Text>
                            </View>

                            {helpCardButton ? (
                                <Pressable onPress={handleListeningAction} style={({ pressed }) => [styles.helpButton, pressed && styles.helpButtonPressed]}>
                                    <Text style={styles.helpButtonText}>{helpCardButton}</Text>
                                </Pressable>
                            ) : null}
                        </Animated.View>
                    ) : null}

                    {!isSystemBlocked ? (
                        <Animated.View entering={FadeInDown.delay(210).duration(420)} style={styles.footerCard}>
                            <Text style={styles.footerLine}>
                                {tuner.displayStatus}
                            </Text>
                        </Animated.View>
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
    container: {
        paddingHorizontal: 20,
        paddingTop: 28,
        gap: 18,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
    },
    headerCopy: {
        flex: 1,
        gap: 8,
    },
    eyebrow: {
        color: 'rgba(163, 178, 204, 0.9)',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1.4,
        textTransform: 'uppercase',
    },
    header: {
        color: '#F7FAFF',
        fontSize: 30,
        fontWeight: '800',
        letterSpacing: -0.6,
    },
    subHeader: {
        color: 'rgba(216, 223, 237, 0.82)',
        fontSize: 15,
        lineHeight: 22,
    },
    heroCard: {
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(15,22,35,0.72)',
    },
    heroFill: {
        padding: 20,
        gap: 18,
    },
    heroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.38)',
    },
    liveDotActive: {
        backgroundColor: IN_TUNE_COLOR,
    },
    liveBadgeText: {
        color: '#F3F8FF',
        fontSize: 13,
        fontWeight: '700',
    },
    specRow: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
    },
    specChip: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    specChipLabel: {
        color: 'rgba(187, 198, 219, 0.76)',
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    specChipValue: {
        marginTop: 3,
        color: '#F7FAFF',
        fontSize: 13,
        fontWeight: '700',
    },
    modeRail: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 18,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: 6,
    },
    modeButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modeButtonActive: {
        backgroundColor: 'rgba(255,255,255,0.13)',
    },
    modeButtonPressed: {
        transform: [{ scale: 0.98 }],
    },
    modeButtonText: {
        color: 'rgba(196, 206, 224, 0.84)',
        fontSize: 15,
        fontWeight: '700',
    },
    modeButtonTextActive: {
        color: '#FFFFFF',
    },
    targetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
    },
    targetLabel: {
        color: 'rgba(169, 182, 203, 0.82)',
        fontSize: 13,
        fontWeight: '600',
    },
    targetValue: {
        marginTop: 4,
        color: '#FFFFFF',
        fontSize: 32,
        fontWeight: '800',
        letterSpacing: -0.6,
    },
    targetMeta: {
        alignItems: 'flex-end',
        gap: 4,
    },
    targetMetaText: {
        color: '#E9F5FF',
        fontSize: 16,
        fontWeight: '700',
    },
    targetMetaSubText: {
        color: 'rgba(178, 194, 216, 0.8)',
        fontSize: 13,
    },
    gaugeCard: {
        borderRadius: 30,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(11,18,30,0.82)',
    },
    gaugeCardFill: {
        paddingVertical: 22,
        paddingHorizontal: 18,
        alignItems: 'center',
    },
    gaugeInstruction: {
        color: 'rgba(194, 206, 225, 0.82)',
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
    },
    tuningLabel: {
        marginTop: 10,
        fontSize: 30,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    tuningDetail: {
        marginTop: 6,
        color: 'rgba(223, 229, 239, 0.82)',
        fontSize: 14,
        textAlign: 'center',
    },
    gaugeWrap: {
        width: GAUGE_SIZE,
        height: GAUGE_RADIUS + 56,
        marginTop: 16,
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    gaugeGlow: {
        position: 'absolute',
        width: GAUGE_SIZE * 0.68,
        height: GAUGE_SIZE * 0.68,
        borderRadius: 999,
        bottom: 28,
    },
    gaugeRing: {
        position: 'absolute',
        width: GAUGE_SIZE,
        height: GAUGE_SIZE,
        borderRadius: GAUGE_SIZE / 2,
        borderWidth: 1,
        bottom: -GAUGE_RADIUS + 24,
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    tick: {
        position: 'absolute',
        width: 14,
        bottom: 24,
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    tickLine: {
        width: 2,
        flex: 1,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.38)',
    },
    tickLineMinor: {
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    gaugeLabelRow: {
        position: 'absolute',
        left: 6,
        right: 6,
        bottom: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    gaugeEdgeLabel: {
        color: 'rgba(188, 198, 217, 0.72)',
        fontSize: 13,
        fontWeight: '700',
    },
    gaugeCenterLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1.2,
    },
    needle: {
        position: 'absolute',
        width: 3,
        height: NEEDLE_HEIGHT,
        borderRadius: 999,
        bottom: 24,
        overflow: 'visible',
    },
    needleTip: {
        position: 'absolute',
        top: -8,
        left: -5,
        width: 13,
        height: 13,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.95)',
    },
    needleHub: {
        position: 'absolute',
        bottom: 18,
        width: 28,
        height: 28,
        borderRadius: 999,
        borderWidth: 3,
    },
    readoutRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
        marginTop: 18,
    },
    readoutCard: {
        flex: 1,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    readoutLabel: {
        color: 'rgba(182, 195, 214, 0.8)',
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.9,
    },
    readoutValue: {
        marginTop: 8,
        color: '#FFFFFF',
        fontSize: 23,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    secondaryReadoutRow: {
        width: '100%',
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    secondaryReadout: {
        flex: 1,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    secondaryReadoutLabel: {
        color: 'rgba(177, 191, 214, 0.76)',
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    secondaryReadoutValue: {
        marginTop: 5,
        color: '#F7FAFF',
        fontSize: 17,
        fontWeight: '700',
    },
    selectionCard: {
        padding: 20,
        borderRadius: 28,
        backgroundColor: 'rgba(10,15,25,0.78)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        gap: 10,
    },
    sectionTitle: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    sectionBody: {
        color: 'rgba(204, 214, 231, 0.8)',
        fontSize: 14,
        lineHeight: 21,
    },
    stringGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 10,
    },
    stringButton: {
        width: '31%',
        minWidth: 96,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'flex-start',
        gap: 4,
    },
    stringButtonActive: {
        backgroundColor: 'rgba(82,247,160,0.14)',
        borderColor: 'rgba(82,247,160,0.38)',
    },
    stringButtonPressed: {
        transform: [{ scale: 0.97 }],
    },
    stringButtonGuided: {
        opacity: 0.92,
    },
    stringButtonNote: {
        color: '#F7FAFF',
        fontSize: 26,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    stringButtonNoteActive: {
        color: IN_TUNE_COLOR,
    },
    stringButtonName: {
        color: 'rgba(215, 222, 236, 0.86)',
        fontSize: 14,
        fontWeight: '700',
    },
    stringButtonNameActive: {
        color: '#FFFFFF',
    },
    stringButtonFreq: {
        color: 'rgba(181, 193, 214, 0.74)',
        fontSize: 12,
        fontWeight: '600',
    },
    stringButtonFreqActive: {
        color: 'rgba(206, 255, 226, 0.92)',
    },
    continueButton: {
        marginTop: 14,
        borderRadius: 18,
        overflow: 'hidden',
    },
    continueButtonPressed: {
        transform: [{ scale: 0.985 }],
    },
    continueButtonFill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
    },
    continueButtonText: {
        color: '#04110A',
        fontSize: 17,
        fontWeight: '800',
    },
    helpCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 18,
        borderRadius: 24,
        backgroundColor: 'rgba(19, 26, 38, 0.86)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    helpIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    helpCopy: {
        flex: 1,
        gap: 5,
    },
    helpTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },
    helpBody: {
        color: 'rgba(207, 216, 230, 0.8)',
        fontSize: 13,
        lineHeight: 19,
    },
    helpButton: {
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    helpButtonPressed: {
        transform: [{ scale: 0.98 }],
    },
    helpButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    footerCard: {
        paddingHorizontal: 18,
        paddingVertical: 16,
        borderRadius: 20,
        backgroundColor: 'rgba(10, 14, 24, 0.66)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    footerLine: {
        color: 'rgba(205, 214, 229, 0.78)',
        fontSize: 14,
        textAlign: 'center',
    },
});
