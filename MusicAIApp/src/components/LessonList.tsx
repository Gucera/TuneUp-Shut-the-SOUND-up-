import React from 'react';
import {
    ImageBackground,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import type { LessonCatalogItem } from '../services/lessonCatalog';
import { COLORS, RADII, SHADOWS } from '../theme';
import { resolveOptionalImageAsset } from '../utils/AssetMap';

interface LessonListProps {
    lessons: LessonCatalogItem[];
    selectedLessonId: string;
    onSelectLesson: (lessonId: string) => void;
    animationsEnabled?: boolean;
    completedLessonIds?: string[];
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

export default function LessonList({
    lessons,
    selectedLessonId,
    onSelectLesson,
    animationsEnabled = true,
    completedLessonIds = [],
}: LessonListProps) {
    return (
        <View style={styles.root}>
            {lessons.map((lesson, index) => {
                const isActive = lesson.id === selectedLessonId;
                const isCompleted = completedLessonIds.includes(lesson.id);
                const imageSource = resolveOptionalImageAsset(lesson.imageUrl);
                const statusLabel = isCompleted ? 'Completed' : isActive ? 'In progress' : 'Not started';
                const actionLabel = isCompleted ? 'Review' : isActive ? 'Continue' : 'Start';

                return (
                    <Animated.View
                        key={lesson.id}
                        entering={animationsEnabled
                            ? FadeInUp.delay(index * 70).springify().damping(18).stiffness(170)
                            : undefined}
                    >
                        <Pressable
                            onPress={() => onSelectLesson(lesson.id)}
                            style={({ pressed }) => [
                                styles.pressable,
                                pressed && styles.pressablePressed,
                            ]}
                        >
                            <View style={[styles.card, isActive && styles.cardActive]}>
                                {imageSource ? (
                                    <ImageBackground
                                        source={imageSource}
                                        imageStyle={styles.textureImage}
                                        style={styles.textureLayer}
                                    />
                                ) : null}

                                {imageSource ? (
                                    <BlurView
                                        intensity={52}
                                        tint="dark"
                                        experimentalBlurMethod="dimezisBlurView"
                                        style={StyleSheet.absoluteFillObject}
                                    />
                                ) : null}

                                <LinearGradient
                                    colors={isActive
                                        ? ['rgba(24, 11, 52, 0.16)', 'rgba(38, 17, 74, 0.68)', 'rgba(13, 8, 31, 0.92)']
                                        : ['rgba(24, 11, 52, 0.1)', 'rgba(33, 15, 66, 0.58)', 'rgba(13, 8, 31, 0.92)']}
                                    locations={[0.08, 0.48, 1]}
                                    start={{ x: 0.18, y: 0 }}
                                    end={{ x: 0.84, y: 1 }}
                                    style={StyleSheet.absoluteFillObject}
                                />

                                <LinearGradient
                                    colors={isActive
                                        ? [withOpacity('#5390d9', 0.28), withOpacity('#4ea8de', 0.24), withOpacity('#64dfdf', 0.18)]
                                        : [withOpacity('#5390d9', 0.18), withOpacity('#4ea8de', 0.16), withOpacity('#64dfdf', 0.1)]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={StyleSheet.absoluteFillObject}
                                />

                                <View style={styles.cardContent}>
                                    <View style={styles.cardTopRow}>
                                        <View style={styles.indexBadge}>
                                            <Text style={styles.indexText}>{index + 1}</Text>
                                        </View>
                                        <View style={styles.metaRow}>
                                            <Text style={styles.metaText}>{lesson.categoryLabel}</Text>
                                            <Text style={styles.metaDivider}>•</Text>
                                            <Text style={styles.metaText}>{lesson.tier}</Text>
                                            <Text style={styles.metaDivider}>•</Text>
                                            <Text style={styles.metaText}>{lesson.durationMin} min</Text>
                                            <Text style={styles.metaDivider}>•</Text>
                                            <Text style={styles.metaText}>{lesson.xpReward} XP</Text>
                                            <Text style={styles.metaDivider}>•</Text>
                                            <Text style={isCompleted ? styles.completedText : styles.metaText}>
                                                {statusLabel}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.copyBlock}>
                                        <Text style={styles.title}>{lesson.title}</Text>
                                        <Text style={styles.subtitle}>{lesson.subtitle}</Text>
                                    </View>

                                    <View style={styles.footerRow}>
                                        <View style={styles.tagRow}>
                                            {lesson.focusTags.slice(0, 3).map((tag) => (
                                                <View key={tag} style={styles.tagPill}>
                                                    <Text style={styles.tagText}>{tag}</Text>
                                                </View>
                                            ))}
                                        </View>
                                        <View style={[styles.arrowOrb, isActive && styles.arrowOrbActive]}>
                                            <Text style={styles.arrowText}>{actionLabel}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </Pressable>
                    </Animated.View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        gap: 14,
    },
    pressable: {
        borderRadius: RADII.l,
    },
    pressablePressed: {
        transform: [{ scale: 0.985 }],
    },
    card: {
        minHeight: 188,
        borderRadius: RADII.l,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(16, 9, 38, 0.78)',
        ...SHADOWS.card,
    },
    cardActive: {
        borderColor: 'rgba(128,255,219,0.42)',
        shadowColor: COLORS.mint,
        shadowOpacity: 0.38,
    },
    textureLayer: {
        ...StyleSheet.absoluteFillObject,
    },
    textureImage: {
        borderRadius: RADII.l,
        opacity: 0.94,
    },
    cardContent: {
        flex: 1,
        padding: 18,
        gap: 14,
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    indexBadge: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(24, 16, 54, 0.26)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    indexText: {
        color: '#F8FCFF',
        fontSize: 15,
        fontWeight: '800',
    },
    metaRow: {
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 6,
    },
    metaText: {
        color: 'rgba(240, 248, 255, 0.88)',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    metaDivider: {
        color: 'rgba(240, 248, 255, 0.46)',
        fontSize: 12,
        fontWeight: '700',
    },
    completedText: {
        color: '#80ffdb',
        fontSize: 12,
        fontWeight: '800',
    },
    copyBlock: {
        gap: 10,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.6,
    },
    subtitle: {
        color: 'rgba(243, 247, 255, 0.88)',
        fontSize: 14,
        lineHeight: 21,
        maxWidth: '88%',
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
    },
    tagRow: {
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tagPill: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: withOpacity(COLORS.deepBackground, 0.28),
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    tagText: {
        color: '#F4FBFF',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.25,
    },
    arrowOrb: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: 'rgba(22, 17, 53, 0.24)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    arrowOrbActive: {
        backgroundColor: 'rgba(14, 37, 40, 0.32)',
        borderColor: 'rgba(128,255,219,0.42)',
    },
    arrowText: {
        color: '#F8FCFF',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
});
