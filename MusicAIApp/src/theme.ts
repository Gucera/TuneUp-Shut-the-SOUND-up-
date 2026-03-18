export const COLORS = {
    background: '#EEF4FA',
    backgroundAlt: '#E0E8F1',
    panel: '#F7FAFD',
    panelAlt: '#FFFFFF',
    panelInset: '#E4ECF4',
    primary: '#5668FF',
    secondary: '#23C2FF',
    accent: '#A177FF',
    success: '#3FC7A0',
    danger: '#FF6E94',
    warning: '#F5BA69',
    gold: '#F3C779',
    mint: '#DDF8F1',
    text: '#60748B',
    textStrong: '#20324A',
    textDim: '#8A99AD',
    pixelLine: '#D6DFE8',
    surfaceGlow: '#FFFFFF',
    shadowDark: '#AEBBCB',
    shadowSoft: '#D3DCE7',
};

export const SPACING = {
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
};

export const RADII = {
    s: 8,
    m: 14,
    l: 18,
};

export const SHADOWS = {
    soft: {
        shadowColor: COLORS.shadowDark,
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    card: {
        shadowColor: COLORS.shadowSoft,
        shadowOpacity: 0.28,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 14 },
        elevation: 14,
    },
    pressed: {
        shadowColor: COLORS.shadowDark,
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 4, height: 4 },
        elevation: 4,
    },
};
