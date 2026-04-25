process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8000';

jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');
    Reanimated.default.call = () => undefined;
    return Reanimated;
});

jest.mock('@shopify/react-native-skia', () => {
    const React = require('react');
    const { View } = require('react-native');
    const Mock = ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children);
    return {
        Canvas: Mock,
        Circle: Mock,
        Line: Mock,
        Path: Mock,
        Rect: Mock,
        Skia: {
            Path: {
                Make: () => ({
                    moveTo: () => undefined,
                    lineTo: () => undefined,
                    close: () => undefined,
                }),
            },
        },
    };
});

jest.mock('expo-linear-gradient', () => ({
    LinearGradient: ({ children }: { children?: React.ReactNode }) => {
        const React = require('react');
        const { View } = require('react-native');
        return React.createElement(View, null, children);
    },
}));

jest.mock('expo-blur', () => ({
    BlurView: ({ children }: { children?: React.ReactNode }) => {
        const React = require('react');
        const { View } = require('react-native');
        return React.createElement(View, null, children);
    },
}));

jest.mock('expo-asset', () => ({
    Asset: {
        fromModule: jest.fn(() => ({
            downloadAsync: jest.fn(() => Promise.resolve()),
            localUri: null,
            uri: 'mock-asset://asset',
        })),
        loadAsync: jest.fn(() => Promise.resolve([])),
    },
}), { virtual: true });

jest.mock('@expo/vector-icons', () => {
    const React = require('react');
    const { Text } = require('react-native');

    const createIcon = (displayName: string) => {
        const Icon = ({ name }: { name?: string }) => React.createElement(Text, null, name ?? displayName);
        Icon.displayName = displayName;
        return Icon;
    };

    return {
        Ionicons: createIcon('Ionicons'),
        MaterialIcons: createIcon('MaterialIcons'),
        FontAwesome: createIcon('FontAwesome'),
    };
});

jest.mock('lottie-react-native', () => 'LottieView');

jest.mock('expo-haptics', () => ({
    selectionAsync: jest.fn(() => Promise.resolve()),
    notificationAsync: jest.fn(() => Promise.resolve()),
    impactAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
}));

jest.mock('expo-av', () => ({
    Audio: {
        usePermissions: () => [{ status: 'granted', canAskAgain: true }, jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true }))],
        setAudioModeAsync: jest.fn(() => Promise.resolve()),
        Sound: {
            createAsync: jest.fn(() => Promise.resolve({
                sound: {
                    unloadAsync: jest.fn(() => Promise.resolve()),
                    playAsync: jest.fn(() => Promise.resolve()),
                    pauseAsync: jest.fn(() => Promise.resolve()),
                    setOnPlaybackStatusUpdate: jest.fn(),
                    setPositionAsync: jest.fn(() => Promise.resolve()),
                },
                status: { isLoaded: true, durationMillis: 120000 },
            })),
        },
    },
    Video: ({ children }: { children?: React.ReactNode }) => {
        const React = require('react');
        const { View } = require('react-native');
        return React.createElement(View, null, children);
    },
}));

jest.mock('@react-navigation/bottom-tabs', () => {
    const actual = jest.requireActual('@react-navigation/bottom-tabs');
    return {
        ...actual,
        useBottomTabBarHeight: () => 0,
    };
});
