import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BadgeDefinition, BADGE_DEFINITIONS, GamificationSnapshot } from '../services/gamification';
import { LeaderboardEntry } from '../services/api';
import { COLORS, SHADOWS } from '../theme';

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

function getBadge(id: string): BadgeDefinition | undefined {
    return BADGE_DEFINITIONS.find((badge) => badge.id === id);
}

export default function GamificationDeck({
    snapshot,
    leaderboard,
    isRefreshing,
    onRefresh,
    showBadges = true,
    showLeaderboard = true,
}: {
    snapshot: GamificationSnapshot | null;
    leaderboard: LeaderboardEntry[];
    isRefreshing: boolean;
    onRefresh: () => void;
    showBadges?: boolean;
    showLeaderboard?: boolean;
}) {
    if (!snapshot) {
        return null;
    }

    return (
        <View style={styles.wrap}>
            <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                    <View>
                        <Text style={styles.kicker}>Game Loop</Text>
                        <Text style={styles.heroTitle}>{snapshot.displayName}</Text>
                    </View>
                    <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
                        <Text style={styles.refreshText}>{isRefreshing ? 'Refreshing...' : 'Refresh'}</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.heroBody}>{snapshot.streakMessage}</Text>

                <View style={styles.heroStatsRow}>
                    <View style={styles.heroStat}>
                        <Text style={styles.heroStatLabel}>Streak</Text>
                        <Text style={styles.heroStatValue}>{snapshot.streakDays} days</Text>
                    </View>
                    <View style={styles.heroStat}>
                        <Text style={styles.heroStatLabel}>Longest</Text>
                        <Text style={styles.heroStatValue}>{snapshot.longestStreak} days</Text>
                    </View>
                    <View style={styles.heroStat}>
                        <Text style={styles.heroStatLabel}>Progress</Text>
                        <Text style={styles.heroStatValue}>{snapshot.xp} XP</Text>
                    </View>
                </View>
            </View>

            {showBadges && (
                <View style={styles.panelCard}>
                    <View style={styles.panelTopRow}>
                        <Text style={styles.panelTitle}>Badges</Text>
                        <Text style={styles.panelMeta}>{snapshot.unlockedBadgeIds.length}/{BADGE_DEFINITIONS.length} unlocked</Text>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
                        {BADGE_DEFINITIONS.map((badge) => {
                            const unlocked = snapshot.unlockedBadgeIds.includes(badge.id);
                            return (
                                <View
                                    key={badge.id}
                                    style={[
                                        styles.badgeCard,
                                        unlocked
                                            ? styles.badgeCardUnlocked
                                            : styles.badgeCardLocked,
                                    ]}
                                >
                                    <View
                                        style={[
                                            styles.badgeSeal,
                                            { backgroundColor: unlocked ? withOpacity(COLORS.primary, 0.16) : COLORS.panel },
                                        ]}
                                    >
                                        <Text style={[styles.badgeSealText, unlocked && styles.badgeSealTextUnlocked]}>
                                            {unlocked ? 'ON' : 'LOCK'}
                                        </Text>
                                    </View>
                                    <Text style={styles.badgeTitle}>{badge.title}</Text>
                                    <Text style={styles.badgeBody}>{badge.description}</Text>
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            {showLeaderboard && (
                <View style={styles.panelCard}>
                    <View style={styles.panelTopRow}>
                        <Text style={styles.panelTitle}>Leaderboard</Text>
                        <Text style={styles.panelMeta}>Top players by XP</Text>
                    </View>

                    {leaderboard.length === 0 ? (
                        <Text style={styles.emptyText}>No leaderboard data yet. Finish a lesson, quiz, or song and refresh.</Text>
                    ) : (
                        leaderboard.map((entry, index) => {
                            const isSelf = entry.userId === snapshot.userId;
                            const primaryBadge = entry.badges[0] ? getBadge(entry.badges[0]) : undefined;
                            return (
                                <View key={`${entry.userId}-${index}`} style={[styles.leaderRow, isSelf && styles.leaderRowSelf]}>
                                    <View style={styles.leaderRank}>
                                        <Text style={styles.leaderRankText}>{index + 1}</Text>
                                    </View>

                                    <View style={styles.leaderMain}>
                                        <Text style={styles.leaderName}>
                                            {entry.displayName}{isSelf ? ' • You' : ''}
                                        </Text>
                                        <Text style={styles.leaderMeta}>
                                            Level {entry.level} • {entry.streakDays}-day streak
                                            {primaryBadge ? ` • ${primaryBadge.title}` : ''}
                                        </Text>
                                    </View>

                                    <View style={styles.leaderScore}>
                                        <Text style={styles.leaderXp}>{entry.xp}</Text>
                                        <Text style={styles.leaderXpLabel}>XP</Text>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        gap: 12,
        marginBottom: 14,
    },
    heroCard: {
        borderRadius: 24,
        padding: 16,
        backgroundColor: COLORS.panelAlt,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        ...SHADOWS.card,
    },
    heroTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    kicker: {
        color: COLORS.textDim,
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    heroTitle: {
        color: COLORS.textStrong,
        fontSize: 20,
        fontWeight: '900',
        marginTop: 3,
    },
    refreshButton: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    refreshText: {
        color: COLORS.primary,
        fontSize: 11,
        fontWeight: '900',
    },
    heroBody: {
        color: COLORS.textStrong,
        fontSize: 14,
        lineHeight: 21,
        marginBottom: 14,
    },
    heroStatsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    heroStat: {
        flex: 1,
        borderRadius: 16,
        backgroundColor: COLORS.panel,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        padding: 12,
    },
    heroStatLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    heroStatValue: {
        color: COLORS.textStrong,
        fontSize: 16,
        fontWeight: '900',
    },
    panelCard: {
        borderRadius: 22,
        padding: 14,
        backgroundColor: COLORS.panelAlt,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        ...SHADOWS.soft,
    },
    panelTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    panelTitle: {
        color: COLORS.textStrong,
        fontSize: 16,
        fontWeight: '900',
    },
    panelMeta: {
        color: COLORS.textDim,
        fontSize: 11,
        fontWeight: '700',
    },
    badgeRow: {
        gap: 10,
        paddingRight: 8,
    },
    badgeCard: {
        width: 180,
        borderRadius: 18,
        padding: 12,
        borderWidth: 1,
    },
    badgeCardUnlocked: {
        borderColor: withOpacity(COLORS.primary, 0.26),
        backgroundColor: withOpacity(COLORS.primary, 0.08),
    },
    badgeCardLocked: {
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
    },
    badgeSeal: {
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginBottom: 10,
    },
    badgeSealText: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '900',
    },
    badgeSealTextUnlocked: {
        color: COLORS.primary,
    },
    badgeTitle: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 6,
    },
    badgeBody: {
        color: COLORS.textDim,
        fontSize: 11,
        lineHeight: 17,
    },
    emptyText: {
        color: COLORS.textDim,
        fontSize: 12,
        lineHeight: 18,
    },
    leaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        padding: 12,
        marginBottom: 8,
    },
    leaderRowSelf: {
        borderColor: withOpacity(COLORS.primary, 0.32),
        backgroundColor: withOpacity(COLORS.primary, 0.08),
    },
    leaderRank: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: COLORS.panelAlt,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    leaderRankText: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
    },
    leaderMain: {
        flex: 1,
        paddingRight: 12,
    },
    leaderName: {
        color: COLORS.textStrong,
        fontSize: 14,
        fontWeight: '900',
    },
    leaderMeta: {
        color: COLORS.textDim,
        fontSize: 11,
        fontWeight: '700',
        marginTop: 3,
    },
    leaderScore: {
        alignItems: 'flex-end',
    },
    leaderXp: {
        color: COLORS.primary,
        fontSize: 18,
        fontWeight: '900',
    },
    leaderXpLabel: {
        color: COLORS.textDim,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
});
