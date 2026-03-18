function hexToLottieColor(hex: string) {
    const value = hex.replace('#', '');
    const normalized = value.length === 3
        ? value.split('').map((char) => `${char}${char}`).join('')
        : value;

    const parsed = parseInt(normalized, 16);
    return [
        ((parsed >> 16) & 255) / 255,
        ((parsed >> 8) & 255) / 255,
        (parsed & 255) / 255,
        1,
    ];
}

function easeOutKeyframes(start: number[], end: number[], endFrame: number) {
    return [
        {
            t: 0,
            s: start,
            e: end,
            i: { x: [0.667, 0.667, 0.667], y: [1, 1, 1] },
            o: { x: [0.333, 0.333, 0.333], y: [0, 0, 0] },
        },
        { t: endFrame, s: end },
    ];
}

function makeOpacityKeyframes(holdFrame: number, endFrame: number) {
    return [
        {
            t: 0,
            s: [0],
            e: [100],
            i: { x: [0.667], y: [1] },
            o: { x: [0.333], y: [0] },
        },
        { t: 10, s: [100], e: [100], h: 1 },
        {
            t: holdFrame,
            s: [100],
            e: [0],
            i: { x: [0.667], y: [1] },
            o: { x: [0.333], y: [0] },
        },
        { t: endFrame, s: [0] },
    ];
}

function makeCircleBurstLayer({
    index,
    color,
    start,
    end,
    size,
    rotation,
}: {
    index: number;
    color: string;
    start: [number, number, number];
    end: [number, number, number];
    size: number;
    rotation: number;
}) {
    return {
        ddd: 0,
        ind: index,
        ty: 4,
        nm: `Confetti ${index}`,
        sr: 1,
        ks: {
            o: { a: 1, k: makeOpacityKeyframes(26, 58) },
            r: { a: 1, k: easeOutKeyframes([0], [rotation], 54) },
            p: { a: 1, k: easeOutKeyframes(start, end, 56) },
            a: { a: 0, k: [0, 0, 0] },
            s: {
                a: 1,
                k: [
                    {
                        t: 0,
                        s: [10, 10, 100],
                        e: [100, 100, 100],
                        i: { x: [0.667, 0.667, 0.667], y: [1, 1, 1] },
                        o: { x: [0.333, 0.333, 0.333], y: [0, 0, 0] },
                    },
                    {
                        t: 18,
                        s: [100, 100, 100],
                        e: [78, 78, 100],
                        i: { x: [0.667, 0.667, 0.667], y: [1, 1, 1] },
                        o: { x: [0.333, 0.333, 0.333], y: [0, 0, 0] },
                    },
                    { t: 58, s: [78, 78, 100] },
                ],
            },
        },
        ao: 0,
        shapes: [
            {
                ty: 'gr',
                it: [
                    {
                        d: 1,
                        ty: 'el',
                        s: { a: 0, k: [size, size] },
                        p: { a: 0, k: [0, 0] },
                        nm: 'Ellipse Path 1',
                        mn: 'ADBE Vector Shape - Ellipse',
                    },
                    {
                        ty: 'fl',
                        c: { a: 0, k: hexToLottieColor(color) },
                        o: { a: 0, k: 100 },
                        r: 1,
                        nm: 'Fill 1',
                        mn: 'ADBE Vector Graphic - Fill',
                    },
                    {
                        ty: 'tr',
                        p: { a: 0, k: [0, 0] },
                        a: { a: 0, k: [0, 0] },
                        s: { a: 0, k: [100, 100] },
                        r: { a: 0, k: 0 },
                        o: { a: 0, k: 100 },
                        sk: { a: 0, k: 0 },
                        sa: { a: 0, k: 0 },
                    },
                ],
                nm: 'Ellipse 1',
                np: 2,
                cix: 2,
                bm: 0,
                ix: 1,
                mn: 'ADBE Vector Group',
            },
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0,
    };
}

function makeRoundedRectLayer({
    index,
    color,
    size,
    position,
    rotation,
    delay = 0,
}: {
    index: number;
    color: string;
    size: [number, number];
    position: [number, number, number];
    rotation: number;
    delay?: number;
}) {
    return {
        ddd: 0,
        ind: index,
        ty: 4,
        nm: `Check ${index}`,
        sr: 1,
        ks: {
            o: {
                a: 1,
                k: [
                    { t: 0, s: [0], e: [0], h: 1 },
                    {
                        t: delay,
                        s: [0],
                        e: [100],
                        i: { x: [0.667], y: [1] },
                        o: { x: [0.333], y: [0] },
                    },
                    { t: delay + 14, s: [100] },
                ],
            },
            r: { a: 0, k: rotation },
            p: { a: 0, k: position },
            a: { a: 0, k: [0, 0, 0] },
            s: {
                a: 1,
                k: [
                    { t: 0, s: [0, 0, 100], e: [0, 0, 100], h: 1 },
                    {
                        t: delay,
                        s: [0, 0, 100],
                        e: [100, 100, 100],
                        i: { x: [0.667, 0.667, 0.667], y: [1, 1, 1] },
                        o: { x: [0.333, 0.333, 0.333], y: [0, 0, 0] },
                    },
                    { t: delay + 18, s: [100, 100, 100] },
                ],
            },
        },
        ao: 0,
        shapes: [
            {
                ty: 'gr',
                it: [
                    {
                        ty: 'rc',
                        d: 1,
                        s: { a: 0, k: size },
                        p: { a: 0, k: [0, 0] },
                        r: { a: 0, k: 9 },
                        nm: 'Rectangle Path 1',
                        mn: 'ADBE Vector Shape - Rect',
                    },
                    {
                        ty: 'fl',
                        c: { a: 0, k: hexToLottieColor(color) },
                        o: { a: 0, k: 100 },
                        r: 1,
                        nm: 'Fill 1',
                        mn: 'ADBE Vector Graphic - Fill',
                    },
                    {
                        ty: 'tr',
                        p: { a: 0, k: [0, 0] },
                        a: { a: 0, k: [0, 0] },
                        s: { a: 0, k: [100, 100] },
                        r: { a: 0, k: 0 },
                        o: { a: 0, k: 100 },
                        sk: { a: 0, k: 0 },
                        sa: { a: 0, k: 0 },
                    },
                ],
                nm: 'Rectangle 1',
                np: 2,
                cix: 2,
                bm: 0,
                ix: 1,
                mn: 'ADBE Vector Group',
            },
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0,
    };
}

const confettiColors = ['#6E7CFF', '#42C2FF', '#56CFA8', '#F4B76C', '#A07CFF', '#FF7D96'];

export const PREMIUM_CONFETTI_LOTTIE = {
    v: '5.7.4',
    fr: 60,
    ip: 0,
    op: 90,
    w: 220,
    h: 220,
    nm: 'TuneUp Confetti',
    ddd: 0,
    assets: [],
    layers: [
        makeCircleBurstLayer({
            index: 1,
            color: confettiColors[0],
            start: [110, 112, 0],
            end: [38, 42, 0],
            size: 18,
            rotation: -160,
        }),
        makeCircleBurstLayer({
            index: 2,
            color: confettiColors[1],
            start: [110, 112, 0],
            end: [182, 44, 0],
            size: 16,
            rotation: 150,
        }),
        makeCircleBurstLayer({
            index: 3,
            color: confettiColors[2],
            start: [110, 112, 0],
            end: [54, 104, 0],
            size: 14,
            rotation: -90,
        }),
        makeCircleBurstLayer({
            index: 4,
            color: confettiColors[3],
            start: [110, 112, 0],
            end: [166, 100, 0],
            size: 18,
            rotation: 120,
        }),
        makeCircleBurstLayer({
            index: 5,
            color: confettiColors[4],
            start: [110, 112, 0],
            end: [70, 176, 0],
            size: 17,
            rotation: -170,
        }),
        makeCircleBurstLayer({
            index: 6,
            color: confettiColors[5],
            start: [110, 112, 0],
            end: [150, 178, 0],
            size: 15,
            rotation: 180,
        }),
    ],
};

export const PREMIUM_SUCCESS_LOTTIE = {
    v: '5.7.4',
    fr: 60,
    ip: 0,
    op: 90,
    w: 220,
    h: 220,
    nm: 'TuneUp Success',
    ddd: 0,
    assets: [],
    layers: [
        {
            ddd: 0,
            ind: 1,
            ty: 4,
            nm: 'Halo Ring',
            sr: 1,
            ks: {
                o: {
                    a: 1,
                    k: [
                        {
                            t: 0,
                            s: [0],
                            e: [80],
                            i: { x: [0.667], y: [1] },
                            o: { x: [0.333], y: [0] },
                        },
                        {
                            t: 20,
                            s: [80],
                            e: [0],
                            i: { x: [0.667], y: [1] },
                            o: { x: [0.333], y: [0] },
                        },
                        { t: 56, s: [0] },
                    ],
                },
                r: { a: 0, k: 0 },
                p: { a: 0, k: [110, 110, 0] },
                a: { a: 0, k: [0, 0, 0] },
                s: {
                    a: 1,
                    k: [
                        {
                            t: 0,
                            s: [60, 60, 100],
                            e: [126, 126, 100],
                            i: { x: [0.667, 0.667, 0.667], y: [1, 1, 1] },
                            o: { x: [0.333, 0.333, 0.333], y: [0, 0, 0] },
                        },
                        { t: 56, s: [126, 126, 100] },
                    ],
                },
            },
            ao: 0,
            shapes: [
                {
                    ty: 'gr',
                    it: [
                        {
                            d: 1,
                            ty: 'el',
                            s: { a: 0, k: [120, 120] },
                            p: { a: 0, k: [0, 0] },
                            nm: 'Ellipse Path 1',
                            mn: 'ADBE Vector Shape - Ellipse',
                        },
                        {
                            ty: 'st',
                            c: { a: 0, k: hexToLottieColor('#6E7CFF') },
                            o: { a: 0, k: 100 },
                            w: { a: 0, k: 12 },
                            lc: 2,
                            lj: 2,
                            ml: 4,
                            nm: 'Stroke 1',
                            mn: 'ADBE Vector Graphic - Stroke',
                        },
                        {
                            ty: 'tr',
                            p: { a: 0, k: [0, 0] },
                            a: { a: 0, k: [0, 0] },
                            s: { a: 0, k: [100, 100] },
                            r: { a: 0, k: 0 },
                            o: { a: 0, k: 100 },
                            sk: { a: 0, k: 0 },
                            sa: { a: 0, k: 0 },
                        },
                    ],
                    nm: 'Ellipse 1',
                    np: 2,
                    cix: 2,
                    bm: 0,
                    ix: 1,
                    mn: 'ADBE Vector Group',
                },
            ],
            ip: 0,
            op: 90,
            st: 0,
            bm: 0,
        },
        {
            ddd: 0,
            ind: 2,
            ty: 4,
            nm: 'Success Circle',
            sr: 1,
            ks: {
                o: {
                    a: 1,
                    k: [
                        {
                            t: 0,
                            s: [0],
                            e: [100],
                            i: { x: [0.667], y: [1] },
                            o: { x: [0.333], y: [0] },
                        },
                        { t: 16, s: [100] },
                    ],
                },
                r: { a: 0, k: 0 },
                p: { a: 0, k: [110, 110, 0] },
                a: { a: 0, k: [0, 0, 0] },
                s: {
                    a: 1,
                    k: [
                        {
                            t: 0,
                            s: [45, 45, 100],
                            e: [100, 100, 100],
                            i: { x: [0.667, 0.667, 0.667], y: [1, 1, 1] },
                            o: { x: [0.333, 0.333, 0.333], y: [0, 0, 0] },
                        },
                        {
                            t: 20,
                            s: [100, 100, 100],
                            e: [94, 94, 100],
                            i: { x: [0.667, 0.667, 0.667], y: [1, 1, 1] },
                            o: { x: [0.333, 0.333, 0.333], y: [0, 0, 0] },
                        },
                        { t: 40, s: [94, 94, 100], e: [100, 100, 100] },
                        { t: 60, s: [100, 100, 100] },
                    ],
                },
            },
            ao: 0,
            shapes: [
                {
                    ty: 'gr',
                    it: [
                        {
                            d: 1,
                            ty: 'el',
                            s: { a: 0, k: [128, 128] },
                            p: { a: 0, k: [0, 0] },
                            nm: 'Ellipse Path 1',
                            mn: 'ADBE Vector Shape - Ellipse',
                        },
                        {
                            ty: 'fl',
                            c: { a: 0, k: hexToLottieColor('#56CFA8') },
                            o: { a: 0, k: 100 },
                            r: 1,
                            nm: 'Fill 1',
                            mn: 'ADBE Vector Graphic - Fill',
                        },
                        {
                            ty: 'tr',
                            p: { a: 0, k: [0, 0] },
                            a: { a: 0, k: [0, 0] },
                            s: { a: 0, k: [100, 100] },
                            r: { a: 0, k: 0 },
                            o: { a: 0, k: 100 },
                            sk: { a: 0, k: 0 },
                            sa: { a: 0, k: 0 },
                        },
                    ],
                    nm: 'Ellipse 1',
                    np: 2,
                    cix: 2,
                    bm: 0,
                    ix: 1,
                    mn: 'ADBE Vector Group',
                },
            ],
            ip: 0,
            op: 90,
            st: 0,
            bm: 0,
        },
        makeRoundedRectLayer({
            index: 3,
            color: '#FFFFFF',
            size: [18, 54],
            position: [94, 126, 0],
            rotation: 42,
            delay: 10,
        }),
        makeRoundedRectLayer({
            index: 4,
            color: '#FFFFFF',
            size: [18, 94],
            position: [127, 100, 0],
            rotation: -48,
            delay: 18,
        }),
    ],
};
