import React from 'react';
import {
    Animated,
    Easing,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SHADOWS } from '../theme';
import { DrumGrooveLane, GuitarChordShape, LessonVisual, PianoVisualGroup } from '../data/lessonVisuals';

const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const STRING_NAMES = ['Low E', 'A', 'D', 'G', 'B', 'High e'];
const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_KEYS = [
    { note: 'C#', left: 26 },
    { note: 'D#', left: 58 },
    { note: 'F#', left: 121 },
    { note: 'G#', left: 153 },
    { note: 'A#', left: 185 },
];
const FLAT_EQUIVALENTS: Record<string, string> = {
    Bb: 'A#',
    Db: 'C#',
    Eb: 'D#',
    Gb: 'F#',
    Ab: 'G#',
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

function normalizeNote(note: string) {
    const base = note.replace(/[0-9]/g, '');
    return FLAT_EQUIVALENTS[base] ?? base;
}

function isStickingPattern(tokens: string[]) {
    return tokens.length > 0 && tokens.every((token) => /^(R|L|K)$/i.test(token.trim()));
}

function getChordPlacements(shape: GuitarChordShape) {
    return shape.frets
        .map((fret, stringIndex) => {
            const finger = shape.fingers?.[stringIndex] ?? null;
            if (typeof fret !== 'number' || fret <= 0 || finger === null) {
                return null;
            }

            return {
                finger,
                stringIndex,
                fret,
                label: `${STRING_NAMES[stringIndex]} string, fret ${fret}`,
            };
        })
        .filter((placement): placement is {
            finger: number;
            stringIndex: number;
            fret: number;
            label: string;
        } => placement !== null)
        .sort((left, right) => left.finger - right.finger || left.stringIndex - right.stringIndex);
}

function ChordPreview({
    shape,
    accentColor,
    isActive,
    pulseValue,
    motionTick,
}: {
    shape: GuitarChordShape;
    accentColor: string;
    isActive: boolean;
    pulseValue: Animated.Value;
    motionTick: number;
}) {
    const gridWidth = 66;
    const gridHeight = 76;
    const stringGap = gridWidth / 5;
    const fretGap = gridHeight / 4;
    const startFret = shape.startFret ?? 1;
    const placements = getChordPlacements(shape);
    const activePlacement = placements.length > 0 && isActive
        ? placements[motionTick % placements.length]
        : null;
    const pulseScale = pulseValue.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.05],
    });
    const pulseOpacity = pulseValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0.2, 0.55],
    });
    const landingLift = pulseValue.interpolate({
        inputRange: [0, 1],
        outputRange: [-12, 0],
    });

    return (
        <Animated.View
            key={shape.name}
            style={[
                styles.chordCard,
                isActive
                    ? {
                        borderColor: withOpacity(accentColor, 0.3),
                        backgroundColor: withOpacity(accentColor, 0.08),
                        transform: [{ scale: pulseScale }],
                    }
                    : null,
            ]}
        >
            <Text style={styles.chordName}>{shape.name}</Text>
            <View style={styles.chordTopMarkers}>
                {shape.frets.map((fret, index) => (
                    <Text key={`${shape.name}-marker-${index}`} style={styles.chordTopMarker}>
                        {fret === 'x' ? 'x' : fret === 0 ? 'o' : ''}
                    </Text>
                ))}
            </View>

            <View style={[styles.chordGrid, { width: gridWidth, height: gridHeight }]}>
                {isActive && (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.chordGlow,
                            {
                                borderColor: withOpacity(accentColor, 0.3),
                                opacity: pulseOpacity,
                            },
                        ]}
                    />
                )}

                {[0, 1, 2, 3, 4, 5].map((stringIndex) => (
                    <View
                        key={`${shape.name}-string-${stringIndex}`}
                        style={[
                            styles.chordString,
                            { left: stringIndex * stringGap },
                        ]}
                    />
                ))}

                {[0, 1, 2, 3, 4].map((fretIndex) => (
                    <View
                        key={`${shape.name}-fret-${fretIndex}`}
                        style={[
                            styles.chordFret,
                            { top: fretIndex * fretGap },
                            fretIndex === 0 && startFret === 1 ? styles.chordNut : null,
                        ]}
                    />
                ))}

                {shape.frets.map((fret, stringIndex) => {
                    if (typeof fret !== 'number' || fret <= 0) {
                        return null;
                    }

                    const relativeFret = fret - startFret;
                    if (relativeFret < 0 || relativeFret > 4) {
                        return null;
                    }
                    const finger = shape.fingers?.[stringIndex] ?? null;
                    const isLandingFinger = activePlacement?.stringIndex === stringIndex;

                    return (
                        <Animated.View
                            key={`${shape.name}-dot-${stringIndex}`}
                            style={[
                                styles.chordDot,
                                {
                                    left: (stringIndex * stringGap) - 7,
                                    top: (relativeFret * fretGap) + 7,
                                    backgroundColor: accentColor,
                                    shadowColor: accentColor,
                                    shadowOpacity: isLandingFinger ? 0.34 : 0.16,
                                    shadowRadius: isLandingFinger ? 8 : 4,
                                },
                                isLandingFinger
                                    ? { transform: [{ translateY: landingLift }, { scale: pulseScale }] }
                                    : null,
                            ]}
                        >
                            {finger !== null && <Text style={styles.chordFingerText}>{finger}</Text>}
                        </Animated.View>
                    );
                })}
            </View>

            {startFret > 1 && <Text style={styles.chordFretLabel}>{startFret}fr</Text>}
            {activePlacement && (
                <View style={[styles.fingerHintPill, { borderColor: withOpacity(accentColor, 0.28) }]}>
                    <Text style={[styles.fingerHintStep, { color: accentColor }]}>Finger {activePlacement.finger}</Text>
                    <Text style={styles.fingerHintText}>{activePlacement.label}</Text>
                </View>
            )}
        </Animated.View>
    );
}

function TabPreview({
    lines,
    accentColor,
    playheadValue,
}: {
    lines: string[];
    accentColor: string;
    playheadValue: Animated.Value;
}) {
    const [contentWidth, setContentWidth] = React.useState(0);
    const translateX = playheadValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, Math.max(contentWidth - 28, 0)],
    });

    return (
        <View
            style={styles.tabWrap}
            onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
        >
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.tabPlayhead,
                    { transform: [{ translateX }] },
                ]}
            >
                <LinearGradient
                    colors={[
                        withOpacity(accentColor, 0),
                        withOpacity(accentColor, 0.18),
                        withOpacity(accentColor, 0.42),
                        withOpacity(accentColor, 0.18),
                        withOpacity(accentColor, 0),
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.tabPlayheadGlow}
                />
            </Animated.View>

            {lines.map((line, index) => (
                <Text key={`tab-${index}`} style={styles.tabLine}>{line}</Text>
            ))}
        </View>
    );
}

function KeyboardPreview({
    group,
    accentColor,
    isActive,
    pulseValue,
}: {
    group: PianoVisualGroup;
    accentColor: string;
    isActive: boolean;
    pulseValue: Animated.Value;
}) {
    const notes = group.notes.map(normalizeNote);
    const pulseScale = pulseValue.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.03],
    });

    return (
        <Animated.View
            key={group.label}
            style={[
                styles.keyboardCard,
                isActive
                    ? {
                        borderColor: withOpacity(accentColor, 0.24),
                        backgroundColor: withOpacity(accentColor, 0.05),
                        transform: [{ scale: pulseScale }],
                    }
                    : null,
            ]}
        >
            <Text style={styles.keyboardLabel}>{group.label}</Text>
            <View style={styles.keyboardWrap}>
                <View style={styles.whiteKeyRow}>
                    {WHITE_KEYS.map((note) => {
                        const active = notes.includes(note);
                        return (
                            <View
                                key={`${group.label}-${note}`}
                                style={[
                                    styles.whiteKeyCard,
                                    active
                                        ? {
                                            backgroundColor: withOpacity(accentColor, 0.18),
                                            borderColor: withOpacity(accentColor, 0.32),
                                            shadowColor: accentColor,
                                            shadowOpacity: isActive ? 0.18 : 0,
                                            shadowRadius: isActive ? 6 : 0,
                                        }
                                        : null,
                                ]}
                            >
                                <Text style={[styles.whiteKeyText, active ? { color: accentColor } : null]}>{note}</Text>
                            </View>
                        );
                    })}
                </View>

                {BLACK_KEYS.map((blackKey) => {
                    const active = notes.includes(blackKey.note);
                    return (
                        <View
                            key={`${group.label}-${blackKey.note}`}
                            style={[
                                styles.blackKeyCard,
                                { left: blackKey.left },
                                active
                                    ? {
                                        backgroundColor: accentColor,
                                        shadowColor: accentColor,
                                        shadowOpacity: isActive ? 0.2 : 0,
                                        shadowRadius: isActive ? 6 : 0,
                                    }
                                    : null,
                            ]}
                        >
                            <Text style={styles.blackKeyText}>{blackKey.note}</Text>
                        </View>
                    );
                })}
            </View>
        </Animated.View>
    );
}

function DrumGroovePreview({
    steps,
    lanes,
    accentColor,
    activeStep,
    pulseValue,
}: {
    steps: number;
    lanes: DrumGrooveLane[];
    accentColor: string;
    activeStep: number;
    pulseValue: Animated.Value;
}) {
    const pulseOpacity = pulseValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0.2, 0.55],
    });

    return (
        <View style={styles.grooveWrap}>
            <View style={styles.grooveHeaderRow}>
                <View style={styles.grooveLaneLabelSpacer} />
                {Array.from({ length: steps }).map((_, index) => (
                    <Text
                        key={`step-${index}`}
                        style={[
                            styles.grooveStepLabel,
                            index === activeStep ? { color: accentColor } : null,
                        ]}
                    >
                        {index + 1}
                    </Text>
                ))}
            </View>

            {lanes.map((lane) => (
                <View key={lane.label} style={styles.grooveLaneRow}>
                    <Text style={styles.grooveLaneLabel}>{lane.label}</Text>
                    {Array.from({ length: steps }).map((_, index) => {
                        const isHit = lane.hits.includes(index);
                        const isAccent = lane.accents?.includes(index);
                        const isCurrentStep = index === activeStep;

                        return (
                            <Animated.View
                                key={`${lane.label}-${index}`}
                                style={[
                                    styles.grooveCell,
                                    isCurrentStep
                                        ? {
                                            borderColor: withOpacity(accentColor, 0.44),
                                            backgroundColor: withOpacity(accentColor, 0.1),
                                            opacity: pulseOpacity,
                                        }
                                        : null,
                                    isHit
                                        ? {
                                            backgroundColor: withOpacity(
                                                accentColor,
                                                isAccent
                                                    ? (isCurrentStep ? 0.92 : 0.88)
                                                    : (isCurrentStep ? 0.42 : 0.32),
                                            ),
                                            borderColor: withOpacity(accentColor, 0.46),
                                        }
                                        : null,
                                ]}
                            >
                                {isHit && (
                                    <View
                                        style={[
                                            styles.grooveDot,
                                            {
                                                backgroundColor: isAccent ? COLORS.panelAlt : accentColor,
                                            },
                                            isCurrentStep ? { transform: [{ scale: 1.18 }] } : null,
                                        ]}
                                    />
                                )}
                            </Animated.View>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

function RudimentPreview({
    tokens,
    accentColor,
    activeIndex,
    pulseValue,
}: {
    tokens: string[];
    accentColor: string;
    activeIndex: number;
    pulseValue: Animated.Value;
}) {
    const lanes = ['R', 'L', 'K'];
    const pulseScale = pulseValue.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.08],
    });

    return (
        <View style={styles.rudimentWrap}>
            <View style={styles.rudimentHeaderRow}>
                <View style={styles.rudimentLaneSpacer} />
                {tokens.map((_, index) => (
                    <Text
                        key={`rudiment-step-${index}`}
                        style={[
                            styles.rudimentStepLabel,
                            index === activeIndex ? { color: accentColor } : null,
                        ]}
                    >
                        {index + 1}
                    </Text>
                ))}
            </View>

            {lanes
                .filter((lane) => tokens.some((token) => token.toUpperCase() === lane))
                .map((lane) => (
                    <View key={lane} style={styles.rudimentLaneRow}>
                        <Text style={styles.rudimentLaneLabel}>{lane}</Text>
                        {tokens.map((token, index) => {
                            const isHit = token.toUpperCase() === lane;
                            const isCurrent = index === activeIndex;
                            return (
                                <View
                                    key={`${lane}-${index}`}
                                    style={[
                                        styles.rudimentCell,
                                        isCurrent ? { borderColor: withOpacity(accentColor, 0.34) } : null,
                                    ]}
                                >
                                    {isHit && (
                                        <Animated.View
                                            style={[
                                                styles.rudimentHit,
                                                { backgroundColor: accentColor },
                                                isCurrent ? { transform: [{ scale: pulseScale }] } : null,
                                            ]}
                                        >
                                            <Text style={styles.rudimentHitText}>{lane}</Text>
                                        </Animated.View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                ))}
        </View>
    );
}

function PatternPreview({
    tokens,
    accentColor,
    activeIndex,
    pulseValue,
}: {
    tokens: string[];
    accentColor: string;
    activeIndex: number;
    pulseValue: Animated.Value;
}) {
    if (isStickingPattern(tokens)) {
        return (
            <RudimentPreview
                tokens={tokens}
                accentColor={accentColor}
                activeIndex={activeIndex}
                pulseValue={pulseValue}
            />
        );
    }

    const pulseScale = pulseValue.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.04],
    });

    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patternRow}>
            {tokens.map((token, index) => (
                <Animated.View
                    key={`${token}-${index}`}
                    style={[
                        styles.patternToken,
                        { borderColor: withOpacity(accentColor, 0.24) },
                        index === activeIndex
                            ? {
                                backgroundColor: withOpacity(accentColor, 0.12),
                                borderColor: withOpacity(accentColor, 0.38),
                                transform: [{ scale: pulseScale }],
                            }
                            : null,
                    ]}
                >
                    <Text
                        style={[
                            styles.patternTokenText,
                            {
                                color:
                                    index === activeIndex || index >= Math.max(tokens.length - 4, 0)
                                        ? accentColor
                                        : COLORS.textStrong,
                            },
                        ]}
                    >
                        {token}
                    </Text>
                </Animated.View>
            ))}
        </ScrollView>
    );
}

export default function LessonVisualGallery({
    visuals,
    accentColor,
    animationsEnabled = true,
}: {
    visuals: LessonVisual[];
    accentColor: string;
    animationsEnabled?: boolean;
}) {
    const playheadValue = React.useRef(new Animated.Value(0)).current;
    const pulseValue = React.useRef(new Animated.Value(0)).current;
    const [motionTick, setMotionTick] = React.useState(0);

    React.useEffect(() => {
        if (!animationsEnabled) {
            setMotionTick(0);
            playheadValue.setValue(0);
            pulseValue.setValue(0);
            return;
        }

        // This keeps the lesson cards feeling alive while the real media gets filled in later.
        const playheadLoop = Animated.loop(
            Animated.timing(playheadValue, {
                toValue: 1,
                duration: 3200,
                easing: Easing.linear,
                useNativeDriver: true,
            }),
        );
        const pulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseValue, {
                    toValue: 1,
                    duration: 850,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseValue, {
                    toValue: 0,
                    duration: 850,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ]),
        );
        const tickInterval = setInterval(() => {
            setMotionTick((current) => current + 1);
        }, 900);

        playheadLoop.start();
        pulseLoop.start();

        return () => {
            clearInterval(tickInterval);
            playheadLoop.stop();
            pulseLoop.stop();
        };
    }, [animationsEnabled, playheadValue, pulseValue]);

    if (visuals.length === 0) {
        return null;
    }

    return (
        <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Play Maps</Text>
            <Text style={styles.sectionSubtitle}>These quick visuals are here to save time while you practice.</Text>
            <View style={styles.motionBadge}>
                <View style={[styles.motionBadgeDot, { backgroundColor: accentColor }]} />
                <Text style={styles.motionBadgeText}>
                    {animationsEnabled ? 'Animated practice guides' : 'Static practice guides'}
                </Text>
            </View>

            {visuals.map((visual, index) => (
                <View key={`${visual.title}-${index}`} style={styles.visualCard}>
                    <Text style={styles.visualTitle}>{visual.title}</Text>
                    <Text style={styles.visualCaption}>{visual.caption}</Text>

                    {visual.type === 'guitar-chords' && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chordRow}>
                            {visual.shapes.map((shape, shapeIndex) => (
                                <ChordPreview
                                    key={`${shape.name}-${shapeIndex}`}
                                    shape={shape}
                                    accentColor={accentColor}
                                    isActive={shapeIndex === motionTick % Math.max(visual.shapes.length, 1)}
                                    pulseValue={pulseValue}
                                    motionTick={motionTick}
                                />
                            ))}
                        </ScrollView>
                    )}

                    {visual.type === 'guitar-tab' && (
                        <TabPreview
                            lines={visual.lines}
                            accentColor={accentColor}
                            playheadValue={playheadValue}
                        />
                    )}

                    {visual.type === 'piano-keys' && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keyboardRow}>
                            {visual.groups.map((group, groupIndex) => (
                                <KeyboardPreview
                                    key={`${group.label}-${groupIndex}`}
                                    group={group}
                                    accentColor={accentColor}
                                    isActive={groupIndex === motionTick % Math.max(visual.groups.length, 1)}
                                    pulseValue={pulseValue}
                                />
                            ))}
                        </ScrollView>
                    )}

                    {visual.type === 'drum-groove' && (
                        <DrumGroovePreview
                            steps={visual.steps}
                            lanes={visual.lanes}
                            accentColor={accentColor}
                            activeStep={motionTick % Math.max(visual.steps, 1)}
                            pulseValue={pulseValue}
                        />
                    )}

                    {visual.type === 'pattern-strip' && (
                        <PatternPreview
                            tokens={visual.tokens}
                            accentColor={accentColor}
                            activeIndex={motionTick % Math.max(visual.tokens.length, 1)}
                            pulseValue={pulseValue}
                        />
                    )}
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    sectionWrap: {
        marginBottom: 12,
    },
    sectionTitle: {
        color: COLORS.textStrong,
        fontSize: 15,
        fontWeight: '900',
        marginBottom: 4,
    },
    sectionSubtitle: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 8,
    },
    motionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginBottom: 10,
    },
    motionBadgeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    motionBadgeText: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
    },
    visualCard: {
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        borderRadius: 20,
        padding: 12,
        marginBottom: 12,
        ...SHADOWS.soft,
    },
    visualTitle: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
    },
    visualCaption: {
        color: COLORS.textDim,
        fontSize: 11,
        lineHeight: 17,
        marginTop: 4,
        marginBottom: 10,
    },
    chordRow: {
        gap: 12,
        paddingRight: 6,
    },
    chordCard: {
        width: 90,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
        borderRadius: 18,
        paddingVertical: 8,
    },
    chordName: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontWeight: '900',
        marginBottom: 4,
    },
    chordTopMarkers: {
        flexDirection: 'row',
        width: 72,
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    chordTopMarker: {
        width: 10,
        textAlign: 'center',
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
    },
    chordGrid: {
        position: 'relative',
        marginBottom: 6,
    },
    chordGlow: {
        position: 'absolute',
        left: -8,
        right: -8,
        top: -8,
        bottom: -8,
        borderWidth: 1,
        borderRadius: 20,
    },
    chordString: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: COLORS.textDim,
    },
    chordFret: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: COLORS.textDim,
    },
    chordNut: {
        height: 3,
        backgroundColor: COLORS.textStrong,
    },
    chordDot: {
        position: 'absolute',
        width: 14,
        height: 14,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chordFingerText: {
        color: COLORS.panelAlt,
        fontSize: 8,
        fontWeight: '900',
    },
    chordFretLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '700',
    },
    fingerHintPill: {
        marginTop: 4,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: COLORS.panel,
        alignItems: 'center',
        gap: 2,
    },
    fingerHintStep: {
        fontSize: 10,
        fontWeight: '900',
    },
    fingerHintText: {
        color: COLORS.textDim,
        fontSize: 9,
        fontWeight: '700',
        textAlign: 'center',
    },
    tabWrap: {
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 16,
        backgroundColor: COLORS.panel,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        padding: 10,
    },
    tabPlayhead: {
        position: 'absolute',
        top: 8,
        bottom: 8,
        width: 28,
        zIndex: 1,
    },
    tabPlayheadGlow: {
        flex: 1,
        borderRadius: 18,
    },
    tabLine: {
        color: COLORS.textStrong,
        fontSize: 12,
        fontFamily: MONO_FONT,
        lineHeight: 18,
    },
    keyboardRow: {
        gap: 10,
        paddingRight: 6,
    },
    keyboardCard: {
        width: 246,
        borderWidth: 1,
        borderColor: 'transparent',
        borderRadius: 16,
        padding: 8,
    },
    keyboardLabel: {
        color: COLORS.textStrong,
        fontSize: 11,
        fontWeight: '800',
        marginBottom: 6,
    },
    keyboardWrap: {
        position: 'relative',
        height: 96,
    },
    whiteKeyRow: {
        flexDirection: 'row',
        gap: 4,
    },
    whiteKeyCard: {
        width: 28,
        height: 88,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 8,
    },
    whiteKeyText: {
        color: COLORS.textStrong,
        fontSize: 10,
        fontWeight: '800',
    },
    blackKeyCard: {
        position: 'absolute',
        top: 0,
        width: 20,
        height: 52,
        borderRadius: 8,
        backgroundColor: COLORS.textStrong,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 6,
    },
    blackKeyText: {
        color: COLORS.panelAlt,
        fontSize: 8,
        fontWeight: '800',
    },
    grooveWrap: {
        borderRadius: 16,
        backgroundColor: COLORS.panel,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        padding: 10,
    },
    grooveHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    grooveLaneLabelSpacer: {
        width: 28,
    },
    grooveStepLabel: {
        width: 18,
        textAlign: 'center',
        color: COLORS.textDim,
        fontSize: 9,
        fontWeight: '800',
        marginHorizontal: 1,
    },
    grooveLaneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    grooveLaneLabel: {
        width: 28,
        color: COLORS.textStrong,
        fontSize: 10,
        fontWeight: '900',
    },
    grooveCell: {
        width: 18,
        height: 18,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        marginHorizontal: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    grooveDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    rudimentWrap: {
        borderRadius: 16,
        backgroundColor: COLORS.panel,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        padding: 10,
    },
    rudimentHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    rudimentLaneSpacer: {
        width: 26,
    },
    rudimentStepLabel: {
        width: 22,
        textAlign: 'center',
        color: COLORS.textDim,
        fontSize: 9,
        fontWeight: '800',
        marginHorizontal: 1,
    },
    rudimentLaneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    rudimentLaneLabel: {
        width: 26,
        color: COLORS.textStrong,
        fontSize: 10,
        fontWeight: '900',
    },
    rudimentCell: {
        width: 22,
        height: 30,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panelAlt,
        marginHorizontal: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rudimentHit: {
        width: 18,
        height: 22,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rudimentHitText: {
        color: COLORS.panelAlt,
        fontSize: 10,
        fontWeight: '900',
    },
    patternRow: {
        gap: 8,
        paddingRight: 6,
    },
    patternToken: {
        borderWidth: 1,
        backgroundColor: COLORS.panel,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 9,
    },
    patternTokenText: {
        fontSize: 11,
        fontWeight: '800',
    },
});
