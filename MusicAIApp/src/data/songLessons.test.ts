import { SONG_LESSONS } from './songLessons';
import { validateSongManifest } from '../utils/manifestValidation';

describe('built-in demo song', () => {
    const demoSong = SONG_LESSONS[0];

    it('is a verified offline TuneUp demo chart', () => {
        expect(demoSong.id).toBe('tuneup-demo-riff');
        expect(demoSong.title).toBe('TuneUp Demo Riff');
        expect(demoSong.artist).toBe('TuneUp');
        expect(demoSong.isDemo).toBe(true);
        expect(demoSong.isVerified).toBe(true);
        expect(demoSong.aiDraft).toBeUndefined();
        expect(demoSong.source).toBe('demo');
    });

    it('has practice-friendly metadata, chords, tabs, and sections', () => {
        expect(demoSong.bpm).toBe(120);
        expect(demoSong.durationSec).toBe(32);
        expect(demoSong.instrument).toBe('guitar');
        expect(demoSong.tuning).toEqual({
            id: 'guitar_standard',
            name: 'Standard',
            stringNotes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
        });
        expect(demoSong.markers?.map((marker) => marker.label)).toEqual([
            'Intro',
            'Main Riff',
            'Chord Groove',
            'Lead Tag',
            'End',
        ]);
        expect(demoSong.chordEvents.length).toBeGreaterThanOrEqual(8);
        expect(demoSong.tabNotes.length).toBeGreaterThanOrEqual(32);
    });

    it('passes manifest validation and keeps sorted valid tab timing', () => {
        const validation = validateSongManifest({
            title: demoSong.title,
            artist: demoSong.artist,
            instrument: demoSong.instrument,
            tuning: demoSong.tuning,
            durationSec: demoSong.durationSec,
            chordEvents: demoSong.chordEvents,
            tabNotes: demoSong.tabNotes,
            markers: demoSong.markers,
        });

        expect(validation.ok).toBe(true);
        expect(demoSong.tabNotes.every((note, index, notes) => (
            note.timeSec >= 0
            && note.stringIndex >= 0
            && note.stringIndex <= 5
            && note.fret >= 0
            && (index === 0 || note.timeSec >= notes[index - 1].timeSec)
        ))).toBe(true);
    });
});
