import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface PremiumBackdropProps {
    variant?: 'light' | 'studio' | 'song';
}

const PALETTES = {
    light: {
        beam: ['rgba(255,255,255,0.78)', 'rgba(255,255,255,0)'] as const,
        orbA: 'rgba(86, 104, 255, 0.14)',
        orbB: 'rgba(35, 194, 255, 0.16)',
        orbC: 'rgba(243, 199, 121, 0.12)',
        line: 'rgba(122, 142, 165, 0.08)',
    },
    studio: {
        beam: ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)'] as const,
        orbA: 'rgba(86, 104, 255, 0.15)',
        orbB: 'rgba(161, 119, 255, 0.13)',
        orbC: 'rgba(35, 194, 255, 0.15)',
        line: 'rgba(122, 142, 165, 0.08)',
    },
    song: {
        beam: ['rgba(114, 242, 190, 0.18)', 'rgba(114, 242, 190, 0)'] as const,
        orbA: 'rgba(114, 242, 190, 0.14)',
        orbB: 'rgba(246, 193, 119, 0.11)',
        orbC: 'rgba(57, 217, 138, 0.1)',
        line: 'rgba(214, 235, 225, 0.06)',
    },
};

export default function PremiumBackdrop({ variant = 'light' }: PremiumBackdropProps) {
    const palette = PALETTES[variant];

    return (
        <View pointerEvents="none" style={styles.root}>
            <LinearGradient
                colors={palette.beam}
                start={{ x: 0.18, y: 0 }}
                end={{ x: 0.7, y: 1 }}
                style={styles.beam}
            />
            <View style={[styles.orb, styles.orbA, { backgroundColor: palette.orbA }]} />
            <View style={[styles.orb, styles.orbB, { backgroundColor: palette.orbB }]} />
            <View style={[styles.orb, styles.orbC, { backgroundColor: palette.orbC }]} />
            <View style={[styles.gridLine, styles.gridLineOne, { backgroundColor: palette.line }]} />
            <View style={[styles.gridLine, styles.gridLineTwo, { backgroundColor: palette.line }]} />
            <View style={[styles.gridLine, styles.gridLineThree, { backgroundColor: palette.line }]} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
    },
    beam: {
        position: 'absolute',
        top: -60,
        left: -20,
        right: -20,
        height: 260,
        transform: [{ rotate: '-8deg' }],
    },
    orb: {
        position: 'absolute',
        borderRadius: 999,
    },
    orbA: {
        top: 78,
        left: -42,
        width: 180,
        height: 180,
    },
    orbB: {
        top: 196,
        right: -54,
        width: 224,
        height: 224,
    },
    orbC: {
        top: 424,
        left: 70,
        width: 132,
        height: 132,
    },
    gridLine: {
        position: 'absolute',
        left: 24,
        right: 24,
        height: 1,
        borderRadius: 1,
    },
    gridLineOne: {
        top: 164,
    },
    gridLineTwo: {
        top: 392,
    },
    gridLineThree: {
        top: 648,
    },
});
