const originalSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const originalBackendSupabaseKey = process.env.SUPABASE_KEY;

jest.mock('@react-native-async-storage/async-storage', () => ({}));

describe('supabaseClient environment safety', () => {
    afterEach(() => {
        jest.resetModules();
        process.env.EXPO_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;

        if (originalBackendSupabaseKey === undefined) {
            delete process.env.SUPABASE_KEY;
        } else {
            process.env.SUPABASE_KEY = originalBackendSupabaseKey;
        }
    });

    it('fails safely when public Supabase config is missing', () => {
        delete process.env.EXPO_PUBLIC_SUPABASE_URL;
        delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

        jest.isolateModules(() => {
            expect(() => require('./supabaseClient')).toThrow(
                'Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY',
            );
        });
    });

    it('does not fall back to backend Supabase key names', () => {
        delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
        process.env.SUPABASE_KEY = 'backend-service-role-key';

        jest.isolateModules(() => {
            expect(() => require('./supabaseClient')).toThrow(
                'Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY',
            );
        });
    });
});
