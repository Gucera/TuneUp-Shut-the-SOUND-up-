import React, { memo, useEffect, useMemo, useRef } from 'react';
import {
    Dimensions,
    ImageBackground,
    ImageSourcePropType,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    Extrapolation,
    interpolate,
    interpolateColor,
    SharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
} from 'react-native-reanimated';
import { COLORS, PREMIUM_GRADIENT, SHADOWS } from '../theme';
import { resolveImageAsset } from '../utils/AssetMap';

const { width } = Dimensions.get('window');
const CARD_WIDTH = Math.min(width * 0.72, 284);
const CARD_HEIGHT = 312;
const CARD_GAP = 18;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;
const SIDE_PADDING = (width - CARD_WIDTH) / 2;

export interface InstrumentCarouselItem {
    id: string;
    title: string;
    subtitle: string;
    eyebrow: string;
    meta?: string;
    imageSource?: ImageSourcePropType;
    assetKey?: string;
    iconName: React.ComponentProps<typeof Ionicons>['name'];
}

interface InstrumentCarouselProps {
    items: InstrumentCarouselItem[];
    selectedId: string;
    onSelect: (item: InstrumentCarouselItem) => void;
}

interface InstrumentCardProps {
    index: number;
    item: InstrumentCarouselItem;
    scrollX: SharedValue<number>;
    isActive: boolean;
    onPress: () => void;
}

const InstrumentCard = memo(function InstrumentCard({
    index,
    item,
    scrollX,
    isActive,
    onPress,
}: InstrumentCardProps) {
    const inputRange = [
        (index - 1) * SNAP_INTERVAL,
        index * SNAP_INTERVAL,
        (index + 1) * SNAP_INTERVAL,
    ];
    const cardSource = item.imageSource ?? resolveImageAsset(item.assetKey);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollX.value, inputRange, [0.52, 1, 0.52], Extrapolation.CLAMP),
        transform: [
            {
                translateY: interpolate(scrollX.value, inputRange, [24, 0, 24], Extrapolation.CLAMP),
            },
            {
                scale: interpolate(scrollX.value, inputRange, [0.8, 1, 0.8], Extrapolation.CLAMP),
            },
            {
                rotateY: `${interpolate(scrollX.value, inputRange, [13, 0, -13], Extrapolation.CLAMP)}deg`,
            },
        ],
    }));

    const haloStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollX.value, inputRange, [0.12, 0.34, 0.12], Extrapolation.CLAMP),
        transform: [{ scale: interpolate(scrollX.value, inputRange, [0.9, 1.02, 0.9], Extrapolation.CLAMP) }],
    }));

    return (
        <Animated.View style={[styles.cardShell, animatedStyle]}>
            <Animated.View style={[styles.cardHalo, haloStyle]} />
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    styles.cardPressable,
                    pressed && styles.cardPressed,
                ]}
            >
                <ImageBackground
                    source={cardSource}
                    imageStyle={styles.cardImage}
                    style={styles.cardImageWrap}
                >
                    <View style={styles.maskStack} pointerEvents="none">
                        <LinearGradient
                            colors={['rgba(116, 0, 184, 0.98)', 'rgba(116, 0, 184, 0)']}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={styles.edgeFadeLeft}
                        />
                        <LinearGradient
                            colors={['rgba(116, 0, 184, 0)', 'rgba(116, 0, 184, 0.98)']}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={styles.edgeFadeRight}
                        />
                        <LinearGradient
                            colors={['rgba(116, 0, 184, 0.94)', 'rgba(116, 0, 184, 0)']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={styles.edgeFadeTop}
                        />
                        <LinearGradient
                            colors={['rgba(116, 0, 184, 0)', '#130625']}
                            locations={[0, 1]}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={styles.edgeFadeBottom}
                        />
                        <LinearGradient
                            colors={['rgba(18, 9, 43, 0.04)', 'rgba(28, 12, 61, 0.28)', 'rgba(43, 16, 82, 0.78)', '#19072f']}
                            locations={[0.1, 0.36, 0.74, 1]}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={styles.centerTint}
                        />
                    </View>

                    <View style={styles.cardContent}>
                        <View style={styles.cardTopRow}>
                            <View style={styles.eyebrowPill}>
                                <Text style={styles.eyebrowText}>{item.eyebrow}</Text>
                            </View>
                            <View style={[styles.iconOrb, isActive && styles.iconOrbActive]}>
                                <Ionicons name={item.iconName} size={22} color={isActive ? '#80ffdb' : '#F5F8FF'} />
                            </View>
                        </View>

                        <View style={styles.cardBottom}>
                            <Text style={styles.cardTitle}>{item.title}</Text>
                            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                            {item.meta ? <Text style={styles.cardMeta}>{item.meta}</Text> : null}
                        </View>
                    </View>
                </ImageBackground>
            </Pressable>
        </Animated.View>
    );
});

const PaginationDot = memo(function PaginationDot({
    index,
    scrollX,
}: {
    index: number;
    scrollX: SharedValue<number>;
}) {
    const inputRange = [
        (index - 1) * SNAP_INTERVAL,
        index * SNAP_INTERVAL,
        (index + 1) * SNAP_INTERVAL,
    ];

    const animatedStyle = useAnimatedStyle(() => ({
        width: interpolate(scrollX.value, inputRange, [10, 28, 10], Extrapolation.CLAMP),
        opacity: interpolate(scrollX.value, inputRange, [0.42, 1, 0.42], Extrapolation.CLAMP),
        backgroundColor: interpolateColor(
            scrollX.value,
            inputRange,
            ['rgba(255,255,255,0.18)', '#80ffdb', 'rgba(255,255,255,0.18)'],
        ),
    }));

    return <Animated.View style={[styles.paginationDot, animatedStyle]} />;
});

export default function InstrumentCarousel({
    items,
    selectedId,
    onSelect,
}: InstrumentCarouselProps) {
    const scrollX = useSharedValue(0);
    const scrollRef = useRef<Animated.ScrollView | null>(null);
    const selectedIndex = useMemo(
        () => Math.max(0, items.findIndex((item) => item.id === selectedId)),
        [items, selectedId],
    );

    useEffect(() => {
        scrollRef.current?.scrollTo({
            x: selectedIndex * SNAP_INTERVAL,
            y: 0,
            animated: true,
        });
    }, [selectedIndex]);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollX.value = event.contentOffset.x;
        },
    });

    return (
        <View style={styles.root}>
            <Animated.ScrollView
                ref={scrollRef}
                horizontal
                bounces={false}
                decelerationRate="fast"
                disableIntervalMomentum
                snapToInterval={SNAP_INTERVAL}
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                contentOffset={{ x: selectedIndex * SNAP_INTERVAL, y: 0 }}
                contentContainerStyle={styles.contentContainer}
                onScroll={scrollHandler}
                onMomentumScrollEnd={(event) => {
                    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SNAP_INTERVAL);
                    const nextItem = items[Math.max(0, Math.min(items.length - 1, nextIndex))];

                    if (nextItem) {
                        onSelect(nextItem);
                    }
                }}
            >
                {items.map((item, index) => (
                    <InstrumentCard
                        key={item.id}
                        index={index}
                        item={item}
                        scrollX={scrollX}
                        isActive={item.id === selectedId}
                        onPress={() => {
                            scrollRef.current?.scrollTo({
                                x: index * SNAP_INTERVAL,
                                y: 0,
                                animated: true,
                            });
                            onSelect(item);
                        }}
                    />
                ))}
            </Animated.ScrollView>

            <View style={styles.paginationRow}>
                {items.map((item, index) => (
                    <PaginationDot key={`${item.id}-dot`} index={index} scrollX={scrollX} />
                ))}
            </View>

            <View style={styles.gradientStrip}>
                <LinearGradient
                    colors={[PREMIUM_GRADIENT[0], PREMIUM_GRADIENT[3], PREMIUM_GRADIENT[8]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientStripFill}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        gap: 18,
    },
    contentContainer: {
        paddingHorizontal: SIDE_PADDING,
    },
    cardShell: {
        width: CARD_WIDTH,
        marginRight: CARD_GAP,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardHalo: {
        position: 'absolute',
        width: CARD_WIDTH - 26,
        height: CARD_HEIGHT - 44,
        borderRadius: 34,
        backgroundColor: 'rgba(114, 239, 221, 0.2)',
        shadowColor: COLORS.mint,
        shadowOpacity: 0.38,
        shadowRadius: 34,
        shadowOffset: { width: 0, height: 16 },
        elevation: 22,
    },
    cardPressable: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 34,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        backgroundColor: '#130625',
        ...SHADOWS.card,
    },
    cardPressed: {
        transform: [{ scale: 0.985 }],
    },
    cardImageWrap: {
        flex: 1,
        justifyContent: 'space-between',
        backgroundColor: '#130625',
    },
    cardImage: {
        borderRadius: 34,
    },
    maskStack: {
        ...StyleSheet.absoluteFillObject,
    },
    edgeFadeLeft: {
        ...StyleSheet.absoluteFillObject,
        right: '62%',
    },
    edgeFadeRight: {
        ...StyleSheet.absoluteFillObject,
        left: '62%',
    },
    edgeFadeTop: {
        ...StyleSheet.absoluteFillObject,
        bottom: '54%',
    },
    edgeFadeBottom: {
        ...StyleSheet.absoluteFillObject,
        top: '40%',
    },
    centerTint: {
        ...StyleSheet.absoluteFillObject,
    },
    cardContent: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 18,
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    eyebrowPill: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(16, 12, 37, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    eyebrowText: {
        color: '#F4FBFF',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.9,
        textTransform: 'uppercase',
    },
    iconOrb: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 11, 35, 0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    iconOrbActive: {
        borderColor: 'rgba(128,255,219,0.42)',
        backgroundColor: 'rgba(11, 39, 44, 0.36)',
    },
    cardBottom: {
        gap: 10,
    },
    cardTitle: {
        color: '#FFFFFF',
        fontSize: 30,
        fontWeight: '900',
        letterSpacing: -0.8,
    },
    cardSubtitle: {
        color: 'rgba(241, 247, 255, 0.9)',
        fontSize: 14,
        lineHeight: 21,
    },
    cardMeta: {
        color: '#80ffdb',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.4,
    },
    paginationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    paginationDot: {
        height: 10,
        borderRadius: 999,
    },
    gradientStrip: {
        height: 6,
        marginHorizontal: 28,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    gradientStripFill: {
        flex: 1,
    },
});
