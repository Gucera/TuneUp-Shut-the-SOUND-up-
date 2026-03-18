import { useCallback, useEffect, useRef, useState } from 'react';
import { CelebrationPayload } from '../components/PremiumCelebrationOverlay';

type CelebrationState = CelebrationPayload;

const EMPTY_STATE: CelebrationState = {
    visible: false,
    title: '',
    subtitle: '',
    variant: 'success',
};

export function useCelebration() {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [celebration, setCelebration] = useState<CelebrationState>(EMPTY_STATE);

    const hideCelebration = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        setCelebration((prev) => ({ ...prev, visible: false }));
    }, []);

    const showCelebration = useCallback((payload: Omit<CelebrationPayload, 'visible'>, durationMs = 1800) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        setCelebration({
            visible: true,
            title: payload.title,
            subtitle: payload.subtitle,
            variant: payload.variant ?? 'success',
        });

        timeoutRef.current = setTimeout(() => {
            setCelebration((prev) => ({ ...prev, visible: false }));
            timeoutRef.current = null;
        }, durationMs);
    }, []);

    useEffect(() => () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    }, []);

    return {
        celebration,
        showCelebration,
        hideCelebration,
    };
}
