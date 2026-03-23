import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { COLORS, SHADOWS } from '../theme';

export interface BreadcrumbSegment {
    key: string;
    label: string;
    onPress?: () => void;
}

interface BreadcrumbProps {
    segments: BreadcrumbSegment[];
    progress?: number;
    progressLabel?: string;
    accentColor?: string;
    animationsEnabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

interface BreadcrumbSegmentChipProps {
    label: string;
    isCurrent: boolean;
    onPress?: () => void;
    accentColor: string;
}

function BreadcrumbSegmentChip({
    label,
    isCurrent,
    onPress,
    accentColor,
}: BreadcrumbSegmentChipProps) {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        if (!onPress || isCurrent) {
            return;
        }

        scale.value = withTiming(0.96, { duration: 90 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, {
            damping: 16,
            stiffness: 220,
            mass: 0.45,
        });
    };

    return (
        <Pressable
            accessibilityRole={onPress && !isCurrent ? 'button' : 'text'}
            disabled={!onPress || isCurrent}
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
        >
            <Animated.View style={[styles.segmentChip, animatedStyle]}>
                <Text
                    numberOfLines={1}
                    style={[
                        styles.segmentText,
                        isCurrent && styles.segmentTextCurrent,
                        !isCurrent && onPress && { color: accentColor },
                    ]}
                >
                    {label}
                </Text>
            </Animated.View>
        </Pressable>
    );
}

export default function Breadcrumb({
    segments,
    progress = 0,
    progressLabel,
    accentColor = COLORS.primary,
    animationsEnabled = true,
    style,
}: BreadcrumbProps) {
    const [railWidth, setRailWidth] = useState(0);
    const progressValue = useSharedValue(Math.max(0, Math.min(1, progress)));
    const clampedProgress = Math.max(0, Math.min(1, progress));

    useEffect(() => {
        progressValue.value = withTiming(clampedProgress, {
            duration: 520,
        });
    }, [clampedProgress, progressValue]);

    const handleRailLayout = (event: LayoutChangeEvent) => {
        setRailWidth(event.nativeEvent.layout.width);
    };

    const progressFillStyle = useAnimatedStyle(() => ({
        width: railWidth * progressValue.value,
        backgroundColor: accentColor,
    }));

    return (
        <Animated.View
            entering={animationsEnabled ? FadeInDown.springify().damping(18).stiffness(190) : undefined}
            style={[styles.shell, style]}
        >
            <View style={styles.segmentRow}>
                {segments.map((segment, index) => {
                    const isCurrent = index === segments.length - 1;

                    return (
                        <React.Fragment key={segment.key}>
                            <BreadcrumbSegmentChip
                                accentColor={accentColor}
                                isCurrent={isCurrent}
                                label={segment.label}
                                onPress={segment.onPress}
                            />
                            {!isCurrent && (
                                <Ionicons
                                    color={COLORS.textDim}
                                    name="chevron-forward"
                                    size={14}
                                    style={styles.chevron}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </View>

            <View style={styles.progressHeadRow}>
                <Text style={styles.progressLabel}>Course Progress</Text>
                {progressLabel ? <Text style={styles.progressMeta}>{progressLabel}</Text> : null}
            </View>

            <View onLayout={handleRailLayout} style={styles.progressRail}>
                <Animated.View style={[styles.progressFill, progressFillStyle]} />
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    shell: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: 'rgba(255,255,255,0.72)',
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 10,
        marginBottom: 14,
        ...SHADOWS.soft,
    },
    segmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        rowGap: 6,
    },
    segmentChip: {
        maxWidth: 196,
        borderRadius: 999,
        paddingVertical: 3,
    },
    segmentText: {
        color: COLORS.textDim,
        fontSize: 11,
        fontWeight: '800',
    },
    segmentTextCurrent: {
        color: COLORS.textStrong,
    },
    chevron: {
        marginHorizontal: 2,
        marginTop: 1,
    },
    progressHeadRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        marginBottom: 8,
        gap: 10,
    },
    progressLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    progressMeta: {
        color: COLORS.text,
        fontSize: 10,
        fontWeight: '700',
    },
    progressRail: {
        height: 4,
        borderRadius: 999,
        backgroundColor: COLORS.panel,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 999,
    },
});
