import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { PREMIUM_CONFETTI_LOTTIE, PREMIUM_SUCCESS_LOTTIE } from '../animations/premiumLottie';
import { COLORS, SHADOWS } from '../theme';

export interface CelebrationPayload {
    visible: boolean;
    title: string;
    subtitle?: string;
    variant?: 'success' | 'confetti';
}

export default function PremiumCelebrationOverlay({
    visible,
    title,
    subtitle,
    variant = 'success',
}: CelebrationPayload) {
    if (!visible) {
        return null;
    }

    return (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(240)} pointerEvents="none" style={styles.overlay}>
            {variant === 'confetti' && (
                <View style={styles.confettiWrap}>
                    <LottieView
                        autoPlay
                        loop={false}
                        source={PREMIUM_CONFETTI_LOTTIE as any}
                        style={styles.confetti}
                    />
                </View>
            )}

            <Animated.View entering={ZoomIn.springify().damping(18).stiffness(220)} style={styles.cardWrap}>
                <BlurView intensity={22} tint="light" style={styles.blurCard}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.76)', 'rgba(248,251,254,0.92)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cardInner}
                    >
                        <View style={styles.lottieRing}>
                            <LottieView
                                autoPlay
                                loop={false}
                                source={PREMIUM_SUCCESS_LOTTIE as any}
                                style={styles.successLottie}
                            />
                        </View>
                        <Text style={styles.title}>{title}</Text>
                        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                    </LinearGradient>
                </BlurView>
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 96,
        zIndex: 40,
    },
    confettiWrap: {
        position: 'absolute',
        top: 26,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    confetti: {
        width: 260,
        height: 260,
    },
    cardWrap: {
        width: '86%',
        maxWidth: 360,
    },
    blurCard: {
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.55)',
        ...SHADOWS.card,
    },
    cardInner: {
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    lottieRing: {
        width: 96,
        height: 96,
        marginBottom: 6,
    },
    successLottie: {
        width: '100%',
        height: '100%',
    },
    title: {
        color: COLORS.textStrong,
        fontSize: 17,
        fontWeight: '900',
        textAlign: 'center',
    },
    subtitle: {
        color: COLORS.text,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
        marginTop: 6,
    },
});
