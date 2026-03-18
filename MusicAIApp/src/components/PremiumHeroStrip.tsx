import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface MetricItem {
    label: string;
    value: string;
}

interface PremiumHeroStripProps {
    icon: IconName;
    eyebrow: string;
    title: string;
    body: string;
    metrics: MetricItem[];
    dark?: boolean;
    colors?: readonly [string, string, ...string[]];
}

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

export default function PremiumHeroStrip({
    icon,
    eyebrow,
    title,
    body,
    metrics,
    dark = false,
    colors = dark
        ? ['#1E252A', '#232C31', '#182024']
        : ['#FFFFFF', '#F4F8FC', '#EAF2FA'],
}: PremiumHeroStripProps) {
    const titleColor = dark ? '#F4F8FB' : COLORS.textStrong;
    const bodyColor = dark ? 'rgba(244,248,251,0.78)' : COLORS.text;
    const eyebrowColor = dark ? '#AEEFD6' : COLORS.primary;
    const metricCard = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)';
    const metricBorder = dark ? 'rgba(255,255,255,0.08)' : withOpacity(COLORS.primary, 0.08);
    const iconBg = dark ? 'rgba(255,255,255,0.08)' : withOpacity(COLORS.primary, 0.12);

    return (
        <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
        >
            <View style={[styles.glow, { backgroundColor: dark ? 'rgba(114,242,190,0.18)' : 'rgba(86,104,255,0.12)' }]} />
            <View style={[styles.glow, styles.glowSecondary, { backgroundColor: dark ? 'rgba(246,193,119,0.14)' : 'rgba(35,194,255,0.14)' }]} />

            <View style={styles.topRow}>
                <View style={[styles.eyebrowPill, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)' }]}>
                    <Text style={[styles.eyebrowText, { color: eyebrowColor }]}>{eyebrow}</Text>
                </View>
                <View style={[styles.iconOrb, { backgroundColor: iconBg }]}>
                    <Ionicons name={icon} size={18} color={dark ? '#F4F8FB' : COLORS.textStrong} />
                </View>
            </View>

            <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
            <Text style={[styles.body, { color: bodyColor }]}>{body}</Text>

            <View style={styles.metricRow}>
                {metrics.map((metric) => (
                    <View
                        key={`${metric.label}-${metric.value}`}
                        style={[
                            styles.metricCard,
                            { backgroundColor: metricCard, borderColor: metricBorder },
                        ]}
                    >
                        <Text style={[styles.metricLabel, { color: dark ? 'rgba(244,248,251,0.7)' : COLORS.textDim }]}>{metric.label}</Text>
                        <Text style={[styles.metricValue, { color: titleColor }]}>{metric.value}</Text>
                    </View>
                ))}
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 28,
        padding: 18,
        marginBottom: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        ...SHADOWS.card,
    },
    glow: {
        position: 'absolute',
        top: -26,
        right: 12,
        width: 148,
        height: 148,
        borderRadius: 999,
    },
    glowSecondary: {
        top: undefined,
        right: undefined,
        left: -22,
        bottom: -48,
        width: 132,
        height: 132,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    eyebrowPill: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.34)',
    },
    eyebrowText: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
    },
    iconOrb: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.28)',
    },
    title: {
        fontSize: 23,
        fontWeight: '900',
        lineHeight: 30,
        marginBottom: 6,
    },
    body: {
        fontSize: 13,
        lineHeight: 19,
        marginBottom: 14,
    },
    metricRow: {
        flexDirection: 'row',
        gap: 10,
    },
    metricCard: {
        flex: 1,
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderWidth: 1,
    },
    metricLabel: {
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    metricValue: {
        fontSize: 16,
        fontWeight: '900',
    },
});
