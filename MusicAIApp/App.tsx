import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

import TheoryScreen from './src/screens/TheoryScreen';
import TrafficScreen from './src/screens/TrafficScreen';
import PracticalScreen from './src/screens/PracticalScreen';
import SongScreen from './src/screens/SongScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { COLORS, SHADOWS } from './src/theme';

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

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
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
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
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
