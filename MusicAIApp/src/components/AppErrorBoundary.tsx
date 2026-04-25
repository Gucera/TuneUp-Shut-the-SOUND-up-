import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface AppErrorBoundaryProps {
    children: React.ReactNode;
    onReset: () => void;
}

interface AppErrorBoundaryState {
    error: Error | null;
}

export default class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    state: AppErrorBoundaryState = {
        error: null,
    };

    static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Unhandled TuneUp app error:', error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ error: null });
        this.props.onReset();
    };

    render() {
        if (!this.state.error) {
            return this.props.children;
        }

        return (
            <LinearGradient
                colors={['#060A13', '#10192A', '#16243B']}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0 }}
                style={styles.screen}
            >
                <View style={styles.card}>
                    <View style={styles.iconWrap}>
                        <Ionicons name="warning-outline" size={28} color="#F6C177" />
                    </View>
                    <Text style={styles.eyebrow}>Recovery Mode</Text>
                    <Text style={styles.title}>TuneUp hit an unexpected problem</Text>
                    <Text style={styles.body}>
                        The app caught the crash before it turned into a blank screen. Reset the shell and jump back in.
                    </Text>
                    <Text style={styles.errorText} numberOfLines={3}>
                        {this.state.error.message}
                    </Text>
                    <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={this.handleReset}>
                        <Text style={styles.buttonText}>Restart TuneUp</Text>
                    </Pressable>
                </View>
            </LinearGradient>
        );
    }
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        borderRadius: 28,
        paddingHorizontal: 24,
        paddingVertical: 26,
        backgroundColor: 'rgba(8, 12, 20, 0.9)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    iconWrap: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(246,193,119,0.12)',
        marginBottom: 16,
    },
    eyebrow: {
        color: '#9FE4FF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1.8,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    title: {
        color: '#F7FAFF',
        fontSize: 26,
        fontWeight: '900',
        marginBottom: 10,
    },
    body: {
        color: 'rgba(223,237,255,0.76)',
        fontSize: 14,
        lineHeight: 21,
        marginBottom: 16,
    },
    errorText: {
        color: '#F6C177',
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 20,
    },
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        paddingVertical: 14,
        backgroundColor: '#72F2BE',
    },
    buttonPressed: {
        opacity: 0.84,
    },
    buttonText: {
        color: '#04110A',
        fontSize: 15,
        fontWeight: '900',
    },
});
