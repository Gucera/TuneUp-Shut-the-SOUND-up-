import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface PremiumBackdropProps {
    variant?: 'light' | 'studio' | 'song';
}

const PALETTES = {
    light: {
        beam: ['rgba(116,0,184,0.24)', 'rgba(116,0,184,0)'] as const,
        orbA: 'rgba(116, 0, 184, 0.2)',
        orbB: 'rgba(94, 96, 206, 0.18)',
        orbC: 'rgba(78, 168, 222, 0.16)',
        line: 'rgba(105, 48, 195, 0.12)',
    },
    studio: {
        beam: ['rgba(116,0,184,0.22)', 'rgba(116,0,184,0)'] as const,
        orbA: 'rgba(116, 0, 184, 0.2)',
        orbB: 'rgba(105, 48, 195, 0.18)',
        orbC: 'rgba(72, 191, 227, 0.18)',
        line: 'rgba(83, 144, 217, 0.12)',
    },
    song: {
        beam: ['rgba(128,255,219,0.22)', 'rgba(128,255,219,0)'] as const,
        orbA: 'rgba(100, 223, 223, 0.2)',
        orbB: 'rgba(114, 239, 221, 0.18)',
        orbC: 'rgba(78, 168, 222, 0.16)',
        line: 'rgba(128, 255, 219, 0.1)',
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
