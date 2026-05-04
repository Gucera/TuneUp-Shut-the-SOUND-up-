import { Audio } from 'expo-av';
import { TurboModuleRegistry } from 'react-native';
import type { PitchyAlgorithm, PitchyEvent } from 'react-native-pitchy';

export type TunerDetectorGateState =
    | 'buffering'
    | 'active'
    | 'blocked-volume'
    | 'blocked-confidence'
    | 'blocked-pitch'
    | 'holding';

export type TunerReading = {
    frequencyHz: number;
    confidence?: number;
    volumeDb?: number;
    timestamp: number;
    gateState?: TunerDetectorGateState;
    analysisDurationMs?: number | null;
    stableMidi?: number | null;
};

export type TunerDetector = {
    isAvailable: () => boolean;
    start: (onReading: (reading: TunerReading) => void) => Promise<void>;
    stop: () => Promise<void>;
};

type NativePitchyEvent = PitchyEvent & {
    gateState?: TunerDetectorGateState;
    analysisDurationMs?: number;
    stableMidi?: number;
    stabilizedPitch?: number;
};

type NativePitchyModule = {
    init: (config?: {
        algorithm?: PitchyAlgorithm;
        bufferSize?: number;
        minVolume?: number;
    }) => void;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    isRecording: () => Promise<boolean>;
    addListener: (callback: (event: PitchyEvent) => void) => { remove: () => void };
};

export const TUNER_AUDIO_MODE = {
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
} as const;

const DEFAULT_AUDIO_MODE = {
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
} as const;

let cachedPitchyModule: NativePitchyModule | null | undefined;

function getPitchyModule(): NativePitchyModule | null {
    if (cachedPitchyModule !== undefined) {
        return cachedPitchyModule;
    }

    if (!TurboModuleRegistry.get('Pitchy')) {
        cachedPitchyModule = null;
        return cachedPitchyModule;
    }

    try {
        // The native module is only safe to require once the TurboModule is registered.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const loadedModule = require('react-native-pitchy') as { default?: NativePitchyModule };
        cachedPitchyModule = loadedModule.default ?? null;
    } catch {
        cachedPitchyModule = null;
    }

    return cachedPitchyModule;
}

export function createPitchyTunerDetector({
    algorithm,
    bufferSize,
    minVolume,
}: {
    algorithm: PitchyAlgorithm;
    bufferSize: number;
    minVolume: number;
}): TunerDetector {
    const pitchyModule = getPitchyModule();
    let configured = false;
    let running = false;
    let subscription: { remove: () => void } | null = null;

    const stop = async () => {
        if (subscription) {
            subscription.remove();
            subscription = null;
        }

        try {
            const recording = pitchyModule ? await pitchyModule.isRecording() : false;
            if (recording && pitchyModule) {
                await pitchyModule.stop();
            }
        } catch {
            // The native engine can already be stopped during quick navigation.
        }

        running = false;

        try {
            await Audio.setAudioModeAsync(DEFAULT_AUDIO_MODE);
        } catch {
            // Audio mode reset should stay best-effort.
        }
    };

    return {
        isAvailable: () => !!pitchyModule,
        start: async (onReading) => {
            if (!pitchyModule) {
                throw new Error('native_tuner_unavailable');
            }

            if (running) {
                return;
            }

            try {
                await Audio.setAudioModeAsync(TUNER_AUDIO_MODE);

                if (!configured) {
                    pitchyModule.init({
                        algorithm,
                        bufferSize,
                        minVolume,
                    });
                    configured = true;
                }

                subscription = pitchyModule.addListener((event) => {
                    const nativeEvent = event as NativePitchyEvent;
                    const frequencyHz = Number.isFinite(nativeEvent.stabilizedPitch) && (nativeEvent.stabilizedPitch ?? 0) > 0
                        ? nativeEvent.stabilizedPitch ?? 0
                        : event.pitch;

                    onReading({
                        frequencyHz,
                        confidence: Number.isFinite(event.confidence) ? event.confidence : undefined,
                        volumeDb: Number.isFinite(event.volume) ? event.volume : undefined,
                        timestamp: Date.now(),
                        gateState: nativeEvent.gateState,
                        analysisDurationMs: Number.isFinite(nativeEvent.analysisDurationMs)
                            ? nativeEvent.analysisDurationMs ?? null
                            : null,
                        stableMidi: Number.isFinite(nativeEvent.stableMidi)
                            ? Math.round(nativeEvent.stableMidi ?? 0)
                            : null,
                    });
                });

                await pitchyModule.start();
                running = true;
            } catch (error) {
                await stop();
                throw error;
            }
        },
        stop,
    };
}
