import 'expo-dev-client';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Session } from '@supabase/supabase-js';

import TheoryScreen from './src/screens/TheoryScreen';
import TrafficScreen from './src/screens/TrafficScreen';
import PracticalScreen from './src/screens/PracticalScreen';
import SongScreen from './src/screens/SongScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AuthScreen from './src/screens/AuthScreen';
import { COLORS, SHADOWS } from './src/theme';
import { supabase } from './src/services/supabaseClient';

const Tab = createBottomTabNavigator();

const navTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        background: COLORS.background,
        card: COLORS.panel,
        text: COLORS.text,
        border: COLORS.pixelLine,
        primary: COLORS.primary,
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

    if (routeName === 'Theory') iconName = focused ? 'library' : 'library-outline';
    else if (routeName === 'Practice') iconName = focused ? 'radio' : 'radio-outline';
    else if (routeName === 'Studio') iconName = focused ? 'pulse' : 'pulse-outline';
    else if (routeName === 'Songs') iconName = focused ? 'disc' : 'disc-outline';
    else if (routeName === 'Profile') iconName = focused ? 'person-circle' : 'person-circle-outline';

    return (
        <View style={styles.iconWrap}>
            <View style={[styles.iconFrame, focused && styles.iconFrameActive]}>
                <Ionicons name={iconName} size={size - 2} color={color} />
            </View>
            <View style={[styles.activePip, focused && styles.activePipVisible]} />
        </View>
    );
}

function AuthenticatedTabs() {
    return (
        <NavigationContainer theme={navTheme}>
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    headerShown: false,
                    animation: 'fade',
                    tabBarActiveTintColor: COLORS.primary,
                    tabBarInactiveTintColor: COLORS.textDim,
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
                            colors={[COLORS.secondary, COLORS.panel, COLORS.backgroundAlt]}
                            end={{ x: 1, y: 1 }}
                            start={{ x: 0, y: 0 }}
                            style={styles.tabBarBackground}
                        >
                            <View style={styles.tabBarGlow} />
                        </LinearGradient>
                    ),
                })}
            >
                <Tab.Screen name="Theory" component={TheoryScreen} />
                <Tab.Screen name="Practice" component={PracticalScreen} />
                <Tab.Screen name="Studio" component={TrafficScreen} />
                <Tab.Screen name="Songs" component={SongScreen} />
                <Tab.Screen name="Profile" component={ProfileScreen} />
            </Tab.Navigator>
        </NavigationContainer>
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

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [isBooting, setIsBooting] = useState(true);

    useEffect(() => {
        let isMounted = true;

        void supabase.auth.getSession().then(({ data, error }) => {
            if (!isMounted) {
                return;
            }

            if (error) {
                console.error('Failed to restore session:', error.message);
            }

            setSession(data.session);
            setIsBooting(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            if (!isMounted) {
                return;
            }

            setSession(nextSession);
            setIsBooting(false);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    return (
        <GestureHandlerRootView style={styles.root}>
            <StatusBar style={session ? 'dark' : 'light'} />
            {isBooting ? <LoadingScreen /> : session ? <AuthenticatedTabs /> : <AuthScreen />}
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
        borderColor: COLORS.pixelLine,
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
        backgroundColor: 'rgba(116,0,184,0.16)',
    },
    iconWrap: {
        alignItems: 'center',
    },
    iconFrame: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        backgroundColor: COLORS.panel,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 5,
        marginBottom: 2,
        ...SHADOWS.soft,
    },
    iconFrameActive: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.backgroundAlt,
        shadowColor: COLORS.primary,
        shadowOpacity: 0.28,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
    },
    activePip: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginTop: 3,
        backgroundColor: 'transparent',
    },
    activePipVisible: {
        backgroundColor: COLORS.primary,
    },
});
