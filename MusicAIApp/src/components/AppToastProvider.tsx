import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastPayload {
    title: string;
    message: string;
    variant?: ToastVariant;
}

interface ToastState extends ToastPayload {
    id: number;
}

interface AppToastContextValue {
    showToast: (payload: ToastPayload) => void;
}

const AppToastContext = createContext<AppToastContextValue>({
    showToast: () => undefined,
});

const TOAST_VARIANTS: Record<ToastVariant, { icon: React.ComponentProps<typeof Ionicons>['name']; background: string; border: string; text: string }> = {
    info: {
        icon: 'information-circle-outline',
        background: 'rgba(24, 43, 79, 0.96)',
        border: 'rgba(159,228,255,0.28)',
        text: '#E9F5FF',
    },
    success: {
        icon: 'checkmark-circle-outline',
        background: 'rgba(8, 42, 29, 0.96)',
        border: 'rgba(114,242,190,0.3)',
        text: '#E9FFF6',
    },
    warning: {
        icon: 'warning-outline',
        background: 'rgba(69, 45, 11, 0.96)',
        border: 'rgba(246,193,119,0.32)',
        text: '#FFF6E8',
    },
    error: {
        icon: 'alert-circle-outline',
        background: 'rgba(68, 18, 25, 0.96)',
        border: 'rgba(255,125,150,0.34)',
        text: '#FFF0F3',
    },
};

export function AppToastProvider({ children }: { children: React.ReactNode }) {
    const [toast, setToast] = useState<ToastState | null>(null);
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(-18)).current;
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hideToast = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: -18,
                duration: 180,
                useNativeDriver: true,
            }),
        ]).start(() => {
            setToast(null);
        });
    }, [opacity, translateY]);

    const showToast = useCallback((payload: ToastPayload) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        setToast({
            ...payload,
            variant: payload.variant ?? 'info',
            id: Date.now(),
        });

        opacity.setValue(0);
        translateY.setValue(-18);

        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1,
                duration: 220,
                useNativeDriver: true,
            }),
            Animated.spring(translateY, {
                toValue: 0,
                damping: 18,
                stiffness: 180,
                useNativeDriver: true,
            }),
        ]).start();

        timeoutRef.current = setTimeout(() => {
            hideToast();
        }, 3600);
    }, [hideToast, opacity, translateY]);

    const value = useMemo(() => ({ showToast }), [showToast]);
    const toastVariant = toast ? TOAST_VARIANTS[toast.variant ?? 'info'] : null;

    return (
        <AppToastContext.Provider value={value}>
            {children}
            {toast && toastVariant ? (
                <Animated.View
                    pointerEvents="box-none"
                    style={[
                        styles.overlay,
                        {
                            opacity,
                            transform: [{ translateY }],
                        },
                    ]}
                >
                    <Pressable style={[styles.card, { backgroundColor: toastVariant.background, borderColor: toastVariant.border }]} onPress={hideToast}>
                        <View style={styles.iconWrap}>
                            <Ionicons name={toastVariant.icon} size={20} color={toastVariant.text} />
                        </View>
                        <View style={styles.copy}>
                            <Text style={[styles.title, { color: toastVariant.text }]}>{toast.title}</Text>
                            <Text style={[styles.message, { color: toastVariant.text }]}>{toast.message}</Text>
                        </View>
                    </Pressable>
                </Animated.View>
            ) : null}
        </AppToastContext.Provider>
    );
}

export function useAppToast() {
    return useContext(AppToastContext);
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 18,
        left: 14,
        right: 14,
        zIndex: 999,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        borderRadius: 18,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 14,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 18,
        elevation: 8,
    },
    iconWrap: {
        width: 28,
        alignItems: 'center',
        paddingTop: 1,
    },
    copy: {
        flex: 1,
        gap: 4,
    },
    title: {
        fontSize: 14,
        fontWeight: '800',
    },
    message: {
        fontSize: 12,
        lineHeight: 18,
        opacity: 0.92,
    },
});
