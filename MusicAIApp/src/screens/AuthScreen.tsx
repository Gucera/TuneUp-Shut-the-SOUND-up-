import React, { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    Easing,
    FadeIn,
    FadeInDown,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { useAppToast } from '../components/AppToastProvider';
import PremiumBackdrop from '../components/PremiumBackdrop';
import { SHADOWS } from '../theme';
import { supabase } from '../services/supabaseClient';

const DISPLAY_FONT = Platform.select({
    ios: 'AvenirNextCondensed-Heavy',
    android: 'sans-serif-condensed',
    default: undefined,
});

const MONO_FONT = Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
});

type AuthMode = 'sign-in' | 'sign-up';

function FloatingNote({
    icon,
    left,
    top,
    size,
    tint,
    delay,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    left: number;
    top: number;
    size: number;
    tint: string;
    delay: number;
}) {
    const driftX = useSharedValue(0);
    const liftY = useSharedValue(0);
    const rotation = useSharedValue(-10);

    useEffect(() => {
        driftX.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(12, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
                    withTiming(-14, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
                ),
                -1,
                true,
            ),
        );

        liftY.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(-88, { duration: 3600, easing: Easing.out(Easing.sin) }),
                    withTiming(0, { duration: 0 }),
                ),
                -1,
                false,
            ),
        );

        rotation.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(10, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
                    withTiming(-10, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
                ),
                -1,
                true,
            ),
        );
    }, [delay, driftX, liftY, rotation]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(liftY.value, [0, -88], [0.28, 0.94]),
        transform: [
            { translateX: driftX.value },
            { translateY: liftY.value },
            { rotate: `${rotation.value}deg` },
        ],
    }));

    return (
        <Animated.View entering={FadeIn.delay(delay).duration(500)} pointerEvents="none" style={[styles.noteWrap, { left, top }, animatedStyle]}>
            <Ionicons name={icon} size={size} color={tint} />
        </Animated.View>
    );
}

function EqualizerBar({
    delay,
    tint,
}: {
    delay: number;
    tint: string;
}) {
    const heightScale = useSharedValue(0.35);

    useEffect(() => {
        heightScale.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
                    withTiming(0.42, { duration: 620, easing: Easing.inOut(Easing.cubic) }),
                ),
                -1,
                true,
            ),
        );
    }, [delay, heightScale]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scaleY: heightScale.value }],
    }));

    return <Animated.View style={[styles.eqBar, { backgroundColor: tint }, animatedStyle]} />;
}

function RecordHero() {
    const spin = useSharedValue(0);
    const pulse = useSharedValue(0.94);
    const needle = useSharedValue(-6);

    useEffect(() => {
        spin.value = withRepeat(withTiming(360, { duration: 12000, easing: Easing.linear }), -1, false);
        pulse.value = withRepeat(
            withSequence(
                withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
                withTiming(0.94, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
            true,
        );
        needle.value = withRepeat(
            withSequence(
                withTiming(2, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
                withTiming(-6, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
            true,
        );
    }, [needle, pulse, spin]);

    const discStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${spin.value}deg` }],
    }));

    const glowStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulse.value }],
        opacity: interpolate(pulse.value, [0.94, 1.08], [0.45, 0.88]),
    }));

    const needleStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${needle.value}deg` }],
    }));

    return (
        <View style={styles.heroStage}>
            <View style={styles.heroGlowA} />
            <View style={styles.heroGlowB} />
            <FloatingNote icon="musical-note" left={18} top={42} size={28} tint="#7CE6FF" delay={0} />
            <FloatingNote icon="musical-notes" left={262} top={54} size={30} tint="#F7BB6A" delay={280} />
            <FloatingNote icon="radio" left={248} top={178} size={26} tint="#8D6CFF" delay={520} />
            <FloatingNote icon="headset" left={42} top={198} size={26} tint="#6EF8CC" delay={760} />

            <View style={styles.heroStageContent}>
                <View style={styles.recordColumn}>
                    <Animated.View style={[styles.recordGlow, glowStyle]} />
                    <Animated.View style={[styles.recordShell, discStyle]}>
                        <LinearGradient
                            colors={['#0A1638', '#1A2355', '#050813']}
                            start={{ x: 0.2, y: 0 }}
                            end={{ x: 0.85, y: 1 }}
                            style={styles.recordFace}
                        >
                            <View style={styles.recordRingOuter} />
                            <View style={styles.recordRingMid} />
                            <View style={styles.recordRingInner} />
                            <View style={styles.recordLabel}>
                                <Text style={styles.recordLabelText}>33 RPM</Text>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    <Animated.View style={[styles.needleArm, needleStyle]}>
                        <View style={styles.needleHead} />
                    </Animated.View>
                </View>

                <View style={styles.stringColumn}>
                    <Text style={styles.stageEyebrow}>Studio Session</Text>
                    <Text style={styles.stageTitle}>Vinyl motion. String tension. Quiet luxury.</Text>
                    <Text style={styles.stageBody}>
                        Sign in to sync lessons, save scans, and route every audio upload through your Supabase-backed TuneUp stack.
                    </Text>

                    <View style={styles.stringBoard}>
                        {['E', 'A', 'D', 'G', 'B', 'E'].map((note, index) => (
                            <View key={`${note}-${index}`} style={styles.stringRow}>
                                <Text style={styles.stringNote}>{note}</Text>
                                <View style={styles.stringLine} />
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            <View style={styles.eqCard}>
                <Text style={styles.eqLabel}>Live Meter</Text>
                <View style={styles.eqBars}>
                    {['#6EF8CC', '#7CE6FF', '#AE92FF', '#F7BB6A', '#FF88A8'].map((tint, index) => (
                        <EqualizerBar key={tint} delay={index * 120} tint={tint} />
                    ))}
                </View>
            </View>
        </View>
    );
}

export default function AuthScreen() {
    const { showToast } = useAppToast();
    const [mode, setMode] = useState<AuthMode>('sign-in');
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAuth = async () => {
        const normalizedEmail = email.trim().toLowerCase();
        const trimmedPassword = password.trim();

        if (!normalizedEmail || !trimmedPassword) {
            setStatusMessage('Email and password are required.');
            return;
        }

        if (mode === 'sign-up' && trimmedPassword.length < 6) {
            setStatusMessage('Use at least 6 characters for the password.');
            return;
        }

        setIsSubmitting(true);
        setStatusMessage(mode === 'sign-in' ? 'Opening your studio...' : 'Building your TuneUp account...');

        try {
            if (mode === 'sign-in') {
                const { error } = await supabase.auth.signInWithPassword({
                    email: normalizedEmail,
                    password: trimmedPassword,
                });

                if (error) {
                    throw error;
                }
            } else {
                const nextDisplayName = displayName.trim() || normalizedEmail.split('@')[0] || 'Player';
                const {
                    data: { session },
                    error,
                } = await supabase.auth.signUp({
                    email: normalizedEmail,
                    password: trimmedPassword,
                    options: {
                        data: {
                            display_name: nextDisplayName,
                        },
                    },
                });

                if (error) {
                    throw error;
                }

                if (!session) {
                    setMode('sign-in');
                    setPassword('');
                    setStatusMessage('Account created. Check your email to verify the address, then sign in.');
                    showToast({
                        title: 'Verify email',
                        message: 'Your account was created. Check your inbox and verify the email address before signing in.',
                        variant: 'info',
                    });
                    return;
                }
            }

            setStatusMessage(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Authentication failed.';
            setStatusMessage(message);
            showToast({
                title: mode === 'sign-in' ? 'Sign in failed' : 'Sign up failed',
                message,
                variant: 'error',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <LinearGradient
            colors={['#050814', '#0A1638', '#111F4E', '#08101F']}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.screen}
        >
            <StatusBar style="light" />
            <PremiumBackdrop variant="song" />
            <View style={styles.authGlowTop} />
            <View style={styles.authGlowBottom} />

            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.flex}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(180)} style={styles.heroBlock}>
                            <Text style={styles.kicker}>TuneUp Premium</Text>
                            <Text style={styles.title}>Walk on stage already in sync.</Text>
                            <Text style={styles.subtitle}>
                                A richer login for the new Supabase + FastAPI stack, designed to feel like a private studio instead of a utility screen.
                            </Text>
                            <RecordHero />
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(120).springify().damping(18).stiffness(180)} style={styles.formWrap}>
                            <BlurView intensity={36} tint="dark" style={styles.formBlur}>
                                <LinearGradient
                                    colors={['rgba(12,18,38,0.92)', 'rgba(16,26,56,0.88)', 'rgba(11,16,32,0.94)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.formCard}
                                >
                                    <View style={styles.modeRow}>
                                        <Pressable
                                            onPress={() => setMode('sign-in')}
                                            style={[styles.modeChip, mode === 'sign-in' && styles.modeChipActive]}
                                        >
                                            <Text style={[styles.modeChipText, mode === 'sign-in' && styles.modeChipTextActive]}>Sign In</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => setMode('sign-up')}
                                            style={[styles.modeChip, mode === 'sign-up' && styles.modeChipActive]}
                                        >
                                            <Text style={[styles.modeChipText, mode === 'sign-up' && styles.modeChipTextActive]}>Create Account</Text>
                                        </Pressable>
                                    </View>

                                    {mode === 'sign-up' ? (
                                        <View style={styles.inputGroup}>
                                            <Text style={styles.inputLabel}>Display name</Text>
                                            <TextInput
                                                autoCapitalize="words"
                                                autoCorrect={false}
                                                onChangeText={setDisplayName}
                                                placeholder="Player name"
                                                placeholderTextColor="rgba(214,230,255,0.42)"
                                                style={styles.input}
                                                textContentType="name"
                                                value={displayName}
                                            />
                                        </View>
                                    ) : null}

                                    <View style={styles.inputGroup}>
                                        <Text style={styles.inputLabel}>Email</Text>
                                        <TextInput
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            keyboardType="email-address"
                                            onChangeText={setEmail}
                                            placeholder="tuneup@studio.io"
                                            placeholderTextColor="rgba(214,230,255,0.42)"
                                            style={styles.input}
                                            textContentType="emailAddress"
                                            value={email}
                                        />
                                    </View>

                                    <View style={styles.inputGroup}>
                                        <Text style={styles.inputLabel}>Password</Text>
                                        <TextInput
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            onChangeText={setPassword}
                                            placeholder="Your secure password"
                                            placeholderTextColor="rgba(214,230,255,0.42)"
                                            secureTextEntry
                                            style={styles.input}
                                            textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
                                            value={password}
                                        />
                                    </View>

                                    <Pressable
                                        disabled={isSubmitting}
                                        onPress={() => void handleAuth()}
                                        style={({ pressed }) => [
                                            styles.primaryButton,
                                            pressed && !isSubmitting && styles.primaryButtonPressed,
                                            isSubmitting && styles.primaryButtonDisabled,
                                        ]}
                                    >
                                        <LinearGradient
                                            colors={['#6EF8CC', '#7CE6FF', '#AE92FF']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.primaryButtonFill}
                                        >
                                            <Ionicons
                                                color="#05111F"
                                                name={mode === 'sign-in' ? 'sparkles' : 'add-circle'}
                                                size={18}
                                            />
                                            <Text style={styles.primaryButtonText}>
                                                {isSubmitting
                                                    ? (mode === 'sign-in' ? 'Signing In...' : 'Creating Account...')
                                                    : (mode === 'sign-in' ? 'Enter TuneUp' : 'Start My Studio')}
                                            </Text>
                                        </LinearGradient>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => {
                                            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
                                            setStatusMessage(null);
                                        }}
                                        style={styles.secondaryButton}
                                    >
                                        <Text style={styles.secondaryButtonText}>
                                            {mode === 'sign-in'
                                                ? 'Need an account? Create one'
                                                : 'Already have an account? Sign in'}
                                        </Text>
                                    </Pressable>

                                    {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}

                                    <View style={styles.helperPanel}>
                                        <View style={styles.helperBadge}>
                                            <Ionicons name="disc" size={14} color="#6EF8CC" />
                                            <Text style={styles.helperBadgeText}>Supabase Auth</Text>
                                        </View>
                                        <Text style={styles.helperText}>
                                            {mode === 'sign-in'
                                                ? 'Your authenticated session persists in AsyncStorage, so reopening the app drops you back into the studio.'
                                                : 'New accounts write display_name into Supabase metadata so the profile and leaderboard flows can reuse it.'}
                                        </Text>
                                    </View>
                                </LinearGradient>
                            </BlurView>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    flex: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 28,
    },
    authGlowTop: {
        position: 'absolute',
        top: -80,
        right: -30,
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: 'rgba(110,248,204,0.18)',
    },
    authGlowBottom: {
        position: 'absolute',
        bottom: 140,
        left: -50,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(124,230,255,0.12)',
    },
    heroBlock: {
        marginTop: 8,
    },
    kicker: {
        color: '#9FE4FF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 2.6,
        textTransform: 'uppercase',
        marginBottom: 8,
        fontFamily: DISPLAY_FONT,
    },
    title: {
        color: '#F6FBFF',
        fontSize: 34,
        lineHeight: 38,
        fontWeight: '900',
        fontFamily: DISPLAY_FONT,
        maxWidth: 360,
    },
    subtitle: {
        color: 'rgba(223,239,255,0.82)',
        fontSize: 14,
        lineHeight: 22,
        marginTop: 10,
        maxWidth: 360,
    },
    heroStage: {
        marginTop: 22,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(5,10,24,0.55)',
        overflow: 'hidden',
        minHeight: 310,
        padding: 22,
        ...SHADOWS.card,
    },
    heroGlowA: {
        position: 'absolute',
        top: -24,
        left: -8,
        width: 170,
        height: 170,
        borderRadius: 85,
        backgroundColor: 'rgba(174,146,255,0.22)',
    },
    heroGlowB: {
        position: 'absolute',
        right: -28,
        bottom: -40,
        width: 196,
        height: 196,
        borderRadius: 98,
        backgroundColor: 'rgba(124,230,255,0.16)',
    },
    heroStageContent: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 18,
        alignItems: 'center',
    },
    recordColumn: {
        minWidth: 170,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
    },
    recordGlow: {
        position: 'absolute',
        width: 212,
        height: 212,
        borderRadius: 106,
        backgroundColor: 'rgba(110,248,204,0.22)',
    },
    recordShell: {
        width: 188,
        height: 188,
        borderRadius: 94,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#040814',
        shadowColor: '#6EF8CC',
        shadowOpacity: 0.26,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
    },
    recordFace: {
        width: '100%',
        height: '100%',
        borderRadius: 94,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recordRingOuter: {
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: 80,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    recordRingMid: {
        position: 'absolute',
        width: 126,
        height: 126,
        borderRadius: 63,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    recordRingInner: {
        position: 'absolute',
        width: 88,
        height: 88,
        borderRadius: 44,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    recordLabel: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: '#F7BB6A',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: '#FFF3D6',
    },
    recordLabelText: {
        color: '#342100',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.9,
        fontFamily: MONO_FONT,
    },
    needleArm: {
        position: 'absolute',
        top: 30,
        right: -8,
        width: 104,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#C3D4EE',
    },
    needleHead: {
        position: 'absolute',
        right: -6,
        top: -3,
        width: 18,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#6EF8CC',
    },
    stringColumn: {
        flex: 1,
        minWidth: 180,
    },
    stageEyebrow: {
        color: '#6EF8CC',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.8,
        textTransform: 'uppercase',
        fontFamily: DISPLAY_FONT,
    },
    stageTitle: {
        color: '#F6FBFF',
        fontSize: 24,
        lineHeight: 28,
        marginTop: 10,
        fontWeight: '900',
        fontFamily: DISPLAY_FONT,
    },
    stageBody: {
        color: 'rgba(223,239,255,0.8)',
        fontSize: 13,
        lineHeight: 20,
        marginTop: 10,
    },
    stringBoard: {
        marginTop: 18,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(10,16,36,0.54)',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    stringRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 6,
    },
    stringNote: {
        width: 18,
        color: '#7CE6FF',
        fontSize: 12,
        fontWeight: '800',
        fontFamily: MONO_FONT,
    },
    stringLine: {
        flex: 1,
        height: 1,
        borderRadius: 1,
        backgroundColor: 'rgba(247,187,106,0.45)',
        marginLeft: 12,
    },
    eqCard: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(8,14,30,0.8)',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    eqLabel: {
        color: 'rgba(223,239,255,0.68)',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    eqBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 5,
        height: 38,
    },
    eqBar: {
        width: 8,
        height: 32,
        borderRadius: 4,
    },
    noteWrap: {
        position: 'absolute',
    },
    formWrap: {
        marginTop: 20,
    },
    formBlur: {
        borderRadius: 30,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        ...SHADOWS.card,
    },
    formCard: {
        paddingHorizontal: 18,
        paddingVertical: 18,
    },
    modeRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 16,
    },
    modeChip: {
        flex: 1,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingVertical: 12,
        alignItems: 'center',
    },
    modeChipActive: {
        borderColor: 'rgba(110,248,204,0.44)',
        backgroundColor: 'rgba(110,248,204,0.16)',
    },
    modeChipText: {
        color: 'rgba(223,239,255,0.68)',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.4,
    },
    modeChipTextActive: {
        color: '#F6FBFF',
    },
    inputGroup: {
        marginBottom: 14,
    },
    inputLabel: {
        color: '#DDECFF',
        fontSize: 12,
        fontWeight: '800',
        marginBottom: 8,
        letterSpacing: 0.4,
    },
    input: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        color: '#F6FBFF',
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
    },
    primaryButton: {
        borderRadius: 20,
        overflow: 'hidden',
        marginTop: 6,
    },
    primaryButtonPressed: {
        opacity: 0.92,
    },
    primaryButtonDisabled: {
        opacity: 0.68,
    },
    primaryButtonFill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 15,
        paddingHorizontal: 18,
    },
    primaryButtonText: {
        color: '#05111F',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
    secondaryButton: {
        alignSelf: 'center',
        paddingVertical: 14,
    },
    secondaryButtonText: {
        color: '#A8C3FF',
        fontSize: 13,
        fontWeight: '700',
    },
    statusMessage: {
        color: '#F7BB6A',
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: 4,
    },
    helperPanel: {
        marginTop: 4,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        padding: 14,
    },
    helperBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(110,248,204,0.08)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginBottom: 10,
    },
    helperBadgeText: {
        color: '#DDECFF',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    helperText: {
        color: 'rgba(223,239,255,0.72)',
        fontSize: 12,
        lineHeight: 18,
    },
});
