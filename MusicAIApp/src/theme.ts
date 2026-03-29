export const PREMIUM_GRADIENT = [
    '#7400b8',
    '#6930c3',
    '#5e60ce',
    '#5390d9',
    '#4ea8de',
    '#48bfe3',
    '#56cfe1',
    '#64dfdf',
    '#72efdd',
    '#80ffdb',
] as const;

export const COLORS = {
    background: '#d8eef7',
    backgroundAlt: '#c6eff1',
    panel: '#dff5fb',
    panelAlt: '#eefcff',
    panelInset: '#b5dff0',
    primary: '#7400b8',
    secondary: '#5390d9',
    accent: '#6930c3',
    success: '#64dfdf',
    danger: '#5e60ce',
    warning: '#4ea8de',
    gold: '#48bfe3',
    mint: '#80ffdb',
    cyan: '#72efdd',
    deepBackground: '#19072f',
    deepSurface: '#25114a',
    deepSurfaceAlt: '#34205f',
    text: '#3e5476',
    textStrong: '#1f0f39',
    textDim: '#62759c',
    pixelLine: '#9ccbeb',
    surfaceGlow: '#dffcff',
    shadowDark: '#5e60ce',
    shadowSoft: '#72efdd',
};

export const SPACING = {
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
};

export const RADII = {
    s: 8,
    m: 20,
    l: 24,
};

export const SHADOWS = {
    soft: {
        shadowColor: COLORS.shadowDark,
        shadowOpacity: 0.2,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
    },
    card: {
        shadowColor: COLORS.shadowSoft,
        shadowOpacity: 0.32,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 16 },
        elevation: 16,
    },
    pressed: {
        shadowColor: COLORS.shadowDark,
        shadowOpacity: 0.16,
        shadowRadius: 10,
        shadowOffset: { width: 3, height: 6 },
        elevation: 6,
    },
};
