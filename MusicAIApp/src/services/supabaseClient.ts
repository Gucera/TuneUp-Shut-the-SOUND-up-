import { AppState, AppStateStatus, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, User } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your Expo environment.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock,
    },
});

function readMetadataString(user: User, key: string) {
    const value = user.user_metadata?.[key];
    return typeof value === 'string' ? value.trim() : '';
}

export function getSupabaseDisplayName(user: User | null, fallback = 'Player') {
    if (!user) {
        return fallback;
    }

    const emailName = user.email ? user.email.split('@')[0]?.trim() ?? '' : '';
    const candidates = [
        readMetadataString(user, 'display_name'),
        readMetadataString(user, 'full_name'),
        emailName,
        fallback,
    ];

    return candidates.find((value) => value.length > 0) ?? fallback;
}

export async function getAuthenticatedIdentity() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;

        if (!user) {
            return null;
        }

        return {
            userId: user.id,
            displayName: getSupabaseDisplayName(user, 'Player'),
            email: user.email ?? null,
        };
    } catch {
        return null;
    }
}

type TuneUpGlobal = typeof globalThis & {
    __tuneupSupabaseAppStateListener__?: boolean;
    __tuneupSupabaseLastAppState__?: AppStateStatus;
};

const tuneUpGlobal = globalThis as TuneUpGlobal;

if (Platform.OS !== 'web' && !tuneUpGlobal.__tuneupSupabaseAppStateListener__) {
    tuneUpGlobal.__tuneupSupabaseAppStateListener__ = true;
    tuneUpGlobal.__tuneupSupabaseLastAppState__ = AppState.currentState;

    if (AppState.currentState === 'active') {
        supabase.auth.startAutoRefresh();
    }

    AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === tuneUpGlobal.__tuneupSupabaseLastAppState__) {
            return;
        }

        tuneUpGlobal.__tuneupSupabaseLastAppState__ = nextAppState;

        if (nextAppState === 'active') {
            supabase.auth.startAutoRefresh();
            return;
        }

        supabase.auth.stopAutoRefresh();
    });
}
