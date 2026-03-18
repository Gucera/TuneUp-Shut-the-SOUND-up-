import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

interface PageTransitionViewProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

export default function PageTransitionView({ children, style }: PageTransitionViewProps) {
    const isFocused = useIsFocused();
    const progress = useSharedValue(isFocused ? 1 : 0.92);

    useEffect(() => {
        progress.value = withTiming(isFocused ? 1 : 0.96, {
            duration: isFocused ? 320 : 180,
            easing: Easing.out(Easing.cubic),
        });
    }, [isFocused, progress]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [
            { translateY: (1 - progress.value) * 20 },
            { scale: 0.985 + (progress.value * 0.015) },
        ],
    }));

    return (
        <Animated.View style={[style, animatedStyle]}>
            {children}
        </Animated.View>
    );
}
