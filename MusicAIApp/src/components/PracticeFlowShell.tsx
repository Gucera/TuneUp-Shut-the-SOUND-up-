import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SHADOWS } from '../theme';

interface PracticeFlowShellProps {
    headerContent: React.ReactNode;
    laneContent: React.ReactNode;
    bottomContent: React.ReactNode;
}

export default function PracticeFlowShell({
    headerContent,
    laneContent,
    bottomContent,
}: PracticeFlowShellProps) {
    return (
        <View style={styles.root}>
            <LinearGradient
                colors={['rgba(116,0,184,0.22)', 'rgba(33,16,73,0.92)', 'rgba(10,12,26,0.98)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.stageCard}
            >
                <View style={styles.headerBlock}>{headerContent}</View>

                <View style={styles.laneViewport}>
                    {laneContent}
                    <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(18,7,42,0.96)', 'rgba(18,7,42,0)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={[styles.fadeGradient, styles.fadeTop]}
                    />
                    <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(18,7,42,0)', 'rgba(18,7,42,0.96)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={[styles.fadeGradient, styles.fadeBottom]}
                    />
                </View>
            </LinearGradient>

            <LinearGradient
                colors={['rgba(17,12,36,0.92)', 'rgba(13,18,30,0.96)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.bottomDeck}
            >
                {bottomContent}
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        gap: 16,
    },
    stageCard: {
        borderRadius: 30,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
        ...SHADOWS.card,
        shadowColor: COLORS.primary,
    },
    headerBlock: {
        gap: 14,
    },
    laneViewport: {
        marginTop: 18,
        borderRadius: 26,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(128,255,219,0.14)',
        backgroundColor: COLORS.deepBackground,
    },
    fadeGradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 52,
    },
    fadeTop: {
        top: 0,
    },
    fadeBottom: {
        bottom: 0,
    },
    bottomDeck: {
        borderRadius: 28,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: 16,
        ...SHADOWS.soft,
        shadowColor: COLORS.mint,
    },
});
