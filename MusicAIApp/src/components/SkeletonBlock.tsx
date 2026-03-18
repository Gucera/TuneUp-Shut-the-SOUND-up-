import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../theme';

interface SkeletonBlockProps {
    style?: StyleProp<ViewStyle>;
}

export default function SkeletonBlock({ style }: SkeletonBlockProps) {
    const shimmer = useSharedValue(0);

    useEffect(() => {
        shimmer.value = withRepeat(
            withTiming(1, {
                duration: 1300,
                easing: Easing.inOut(Easing.ease),
            }),
            -1,
            false,
        );
    }, [shimmer]);

    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{
            translateX: interpolate(shimmer.value, [0, 1], [-140, 220]),
        }],
        opacity: 0.95,
    }));

    return (
        <View style={[styles.base, style]}>
            <Animated.View style={[styles.shimmerTrack, shimmerStyle]}>
                <LinearGradient
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.shimmer}
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    base: {
        overflow: 'hidden',
        borderRadius: 16,
        backgroundColor: COLORS.panelInset,
    },
    shimmerTrack: {
        ...StyleSheet.absoluteFillObject,
        width: '60%',
    },
    shimmer: {
        flex: 1,
    },
});
