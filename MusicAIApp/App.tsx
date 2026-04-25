import 'expo-dev-client';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Session } from '@supabase/supabase-js';

import HomeScreen from './src/screens/HomeScreen';
import TheoryScreen from './src/screens/TheoryScreen';
import LessonDetailScreen from './src/screens/LessonDetailScreen';
import TunerScreen from './src/screens/TunerScreen';
import SongScreen from './src/screens/SongScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TrafficScreen from './src/screens/TrafficScreen';
import AuthScreen from './src/screens/AuthScreen';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import { AppToastProvider, useAppToast } from './src/components/AppToastProvider';
import { COLORS, SHADOWS } from './src/theme';
import type { LessonsStackParamList } from './src/navigation/lessonStack';
import { restoreSupabaseSession, supabase } from './src/services/supabaseClient';

const Tab = createBottomTabNavigator();
const LessonsStack = createNativeStackNavigator<LessonsStackParamList>();
const RootStack = createNativeStackNavigator();

const navTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        background: COLORS.deepBackground,
        card: COLORS.deepSurface,
        text: '#F7FAFF',
        border: COLORS.accent,
        primary: COLORS.mint,
    },
};

function PixelIcon({
    routeName,
    focused,
    color,
    size,
}: {
    routeName: string;
    focused: boolean;
    color: string;
    size: number;
}) {
    let iconName: keyof typeof Ionicons.glyphMap = 'musical-notes';
    const isHome = routeName === 'Home';

    if (routeName === 'Home') iconName = focused ? 'home' : 'home-outline';
    else if (routeName === 'Lessons') iconName = focused ? 'library' : 'library-outline';
    else if (routeName === 'Tuner') iconName = focused ? 'radio' : 'radio-outline';
    else if (routeName === 'Songs') iconName = focused ? 'disc' : 'disc-outline';
    else if (routeName === 'Profile') iconName = focused ? 'person-circle' : 'person-circle-outline';

    return (
        <View style={[styles.iconWrap, isHome && styles.iconWrapHome]}>
            <View
                style={[
                    styles.iconFrame,
                    isHome && styles.iconFrameHome,
                    focused && styles.iconFrameActive,
                    focused && isHome && styles.iconFrameHomeActive,
                ]}
            >
                <Ionicons name={iconName} size={isHome ? size : size - 2} color={color} />
            </View>
            <View style={[styles.activePip, isHome && styles.activePipHome, focused && styles.activePipVisible]} />
        </View>
    );
}

function LessonsNavigator() {
    return (
        <LessonsStack.Navigator
            initialRouteName="LessonLibrary"
            screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
                contentStyle: { backgroundColor: COLORS.deepBackground },
            }}
        >
            <LessonsStack.Screen name="LessonLibrary" component={TheoryScreen} />
            <LessonsStack.Screen name="LessonDetail" component={LessonDetailScreen} />
        </LessonsStack.Navigator>
    );
}

function MainTabsNavigator() {
    return (
        <Tab.Navigator
            initialRouteName="Home"
            backBehavior="history"
            screenOptions={({ route }) => ({
                headerShown: false,
                animation: 'fade',
                tabBarActiveTintColor: COLORS.mint,
                tabBarInactiveTintColor: 'rgba(223,237,255,0.62)',
                tabBarShowLabel: true,
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '900',
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    marginBottom: 6,
                },
                tabBarStyle: styles.tabBar,
                tabBarItemStyle: styles.tabItem,
                tabBarIcon: ({ focused, color, size }) => (
                    <PixelIcon routeName={route.name} focused={focused} color={color} size={size} />
                ),
                tabBarBackground: () => (
                    <LinearGradient
                        colors={['rgba(116,0,184,0.96)', 'rgba(105,48,195,0.94)', 'rgba(94,96,206,0.92)']}
                        end={{ x: 1, y: 1 }}
                        start={{ x: 0, y: 0 }}
                        style={styles.tabBarBackground}
                    >
                        <View style={styles.tabBarGlow} />
                    </LinearGradient>
                ),
            })}
        >
            <Tab.Screen
                name="Lessons"
                component={LessonsNavigator}
                options={{
                    popToTopOnBlur: true,
                    freezeOnBlur: false,
                }}
            />
            <Tab.Screen name="Tuner" component={TunerScreen} />
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Songs" component={SongScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}

function LoadingScreen() {
    return (
        <LinearGradient
            colors={['#08101F', '#0C1942', '#12265A']}
            end={{ x: 0.92, y: 1 }}
            start={{ x: 0.08, y: 0 }}
            style={styles.loadingScreen}
        >
            <View style={styles.loadingGlowA} />
            <View style={styles.loadingGlowB} />

            <View style={styles.loadingCard}>
                <Text style={styles.loadingEyebrow}>TuneUp Studio</Text>
                <Text style={styles.loadingTitle}>Restoring your session</Text>
                <Text style={styles.loadingBody}>
                    Pulling the saved Supabase auth session from AsyncStorage and warming up the premium shell.
                </Text>
                <ActivityIndicator color="#6EF8CC" size="large" style={styles.loadingSpinner} />
            </View>
        </LinearGradient>
    );
}

function AppShell() {
    const { showToast } = useAppToast();
    const [session, setSession] = useState<Session | null>(null);
    const [isBooting, setIsBooting] = useState(true);
    const previousSessionRef = useRef<Session | null>(null);

    useEffect(() => {
        let isMounted = true;

        void restoreSupabaseSession()
            .then((nextSession) => {
                if (!isMounted) {
                    return;
                }

                previousSessionRef.current = nextSession;
                setSession(nextSession);
                setIsBooting(false);
            })
            .catch((error) => {
                if (!isMounted) {
                    return;
                }

                showToast({
                    title: 'Session expired',
                    message: 'Your saved login could not be restored cleanly. Please sign in again.',
                    variant: 'warning',
                });
                previousSessionRef.current = null;
                setSession(null);
                setIsBooting(false);
                void supabase.auth.signOut().catch(() => undefined);
                console.error('Failed to restore session:', error);
            });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, nextSession) => {
            if (!isMounted) {
                return;
            }

            if (event === 'SIGNED_OUT' && previousSessionRef.current) {
                showToast({
                    title: 'Signed out',
                    message: 'Your session ended safely. Sign back in whenever you are ready.',
                    variant: 'info',
                });
            }

            if (event === 'TOKEN_REFRESHED' && nextSession) {
                console.info('Supabase session refreshed successfully.');
            }

            previousSessionRef.current = nextSession;
            setSession(nextSession);
            setIsBooting(false);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [showToast]);

    if (isBooting) {
        return <LoadingScreen />;
    }

    if (!session) {
        return <AuthScreen />;
    }

    return (
        <NavigationContainer theme={navTheme}>
            <RootStack.Navigator
                initialRouteName="MainTabs"
                screenOptions={{
                    headerShown: false,
                    animation: 'fade',
                    contentStyle: { backgroundColor: COLORS.deepBackground },
                }}
            >
                <RootStack.Screen name="MainTabs" component={MainTabsNavigator} />
                <RootStack.Screen
                    name="Studio"
                    component={TrafficScreen}
                    options={{
                        animation: 'slide_from_right',
                    }}
                />
            </RootStack.Navigator>
        </NavigationContainer>
    );
}

export default function App() {
    const [resetKey, setResetKey] = useState(0);

    return (
        <GestureHandlerRootView style={styles.root}>
            <StatusBar style="light" />
            <AppErrorBoundary onReset={() => setResetKey((value) => value + 1)}>
                <AppToastProvider>
                    <View key={resetKey} style={styles.root}>
                        <AppShell />
                    </View>
                </AppToastProvider>
            </AppErrorBoundary>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    loadingScreen: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    loadingGlowA: {
        position: 'absolute',
        top: 74,
        right: -10,
        width: 240,
        height: 240,
        borderRadius: 120,
        backgroundColor: 'rgba(110,248,204,0.16)',
    },
    loadingGlowB: {
        position: 'absolute',
        bottom: 120,
        left: -40,
        width: 280,
        height: 280,
        borderRadius: 140,
        backgroundColor: 'rgba(174,146,255,0.14)',
    },
    loadingCard: {
        width: '100%',
        maxWidth: 360,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(7,14,31,0.72)',
        paddingHorizontal: 22,
        paddingVertical: 24,
        ...SHADOWS.card,
    },
    loadingEyebrow: {
        color: '#9FE4FF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    loadingTitle: {
        color: '#F6FBFF',
        fontSize: 28,
        lineHeight: 32,
        fontWeight: '900',
    },
    loadingBody: {
        color: 'rgba(223,239,255,0.78)',
        fontSize: 14,
        lineHeight: 21,
        marginTop: 10,
    },
    loadingSpinner: {
        marginTop: 22,
    },
    tabBar: {
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 10,
        height: 88,
        paddingTop: 7,
        borderTopWidth: 0,
        elevation: 0,
        backgroundColor: 'transparent',
    },
    tabItem: {
        marginHorizontal: 4,
        borderRadius: 18,
    },
    tabBarBackground: {
        flex: 1,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(128,255,219,0.26)',
        overflow: 'hidden',
        ...SHADOWS.card,
    },
    tabBarGlow: {
        position: 'absolute',
        top: 8,
        left: 20,
        right: 20,
        height: 28,
        borderRadius: 16,
        backgroundColor: 'rgba(128,255,219,0.16)',
    },
    iconWrap: {
        alignItems: 'center',
    },
    iconWrapHome: {
        transform: [{ translateY: -2 }],
    },
    iconFrame: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(25,7,47,0.44)',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 5,
        marginBottom: 2,
        ...SHADOWS.soft,
    },
    iconFrameHome: {
        width: 46,
        height: 46,
        borderRadius: 23,
    },
    iconFrameActive: {
        borderColor: COLORS.mint,
        backgroundColor: 'rgba(37,17,74,0.82)',
        shadowColor: COLORS.mint,
        shadowOpacity: 0.28,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
    },
    iconFrameHomeActive: {
        shadowRadius: 24,
        elevation: 14,
    },
    activePip: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginTop: 3,
        backgroundColor: 'transparent',
    },
    activePipHome: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    activePipVisible: {
        backgroundColor: COLORS.mint,
    },
});
