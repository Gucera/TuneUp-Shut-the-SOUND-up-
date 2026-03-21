import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SHADOWS } from '../theme';

export default function ScreenSettingsButton({
    onPress,
}: {
    onPress?: () => void;
}) {
    const navigation = useNavigation<any>();

    const handlePress = () => {
        if (onPress) {
            onPress();
            return;
        }

        navigation.navigate('Profile', { focusSettings: true });
    };

    return (
        <TouchableOpacity style={styles.button} onPress={handlePress}>
            <LinearGradient
                colors={[COLORS.primary, COLORS.accent, COLORS.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            >
                <Ionicons name="settings-outline" size={18} color={COLORS.panelAlt} />
            </LinearGradient>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: COLORS.pixelLine,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...SHADOWS.soft,
        shadowColor: COLORS.primary,
        shadowOpacity: 0.22,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
    },
    gradient: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
