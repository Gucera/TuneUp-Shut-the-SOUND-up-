begin;

alter table public.lessons
    add column if not exists type text,
    add column if not exists image_url text,
    add column if not exists video_url text,
    add column if not exists difficulty text,
    add column if not exists content_json jsonb;

update public.lessons
set
    type = coalesce(type, 'practical'),
    content_json = coalesce(content_json, content, '{}'::jsonb);

alter table public.lessons
    alter column type set default 'practical',
    alter column type set not null,
    alter column content_json set default '{}'::jsonb;

do $$
begin
    if exists (
        select 1
        from pg_constraint
        where conname = 'lessons_type_valid'
          and conrelid = 'public.lessons'::regclass
    ) then
        alter table public.lessons drop constraint lessons_type_valid;
    end if;

    alter table public.lessons
        add constraint lessons_type_valid
        check (type in ('practical', 'theory', 'quiz', 'game'));
end
$$;

do $$
begin
    if exists (
        select 1
        from pg_constraint
        where conname = 'courses_instrument_type_valid'
          and conrelid = 'public.courses'::regclass
    ) then
        alter table public.courses drop constraint courses_instrument_type_valid;
    end if;

    alter table public.courses
        add constraint courses_instrument_type_valid
        check (instrument_type in ('Guitar', 'Piano', 'Drums', 'General'));
end
$$;

create table if not exists public.quizzes (
    id uuid primary key default extensions.gen_random_uuid(),
    lesson_id text not null,
    question text not null,
    options jsonb not null default '[]'::jsonb,
    correct_option_index integer not null,
    explanation text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.quizzes
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'quizzes_lesson_id_fkey'
          and conrelid = 'public.quizzes'::regclass
    ) then
        alter table public.quizzes
            add constraint quizzes_lesson_id_fkey
            foreign key (lesson_id)
            references public.lessons (id)
            on delete cascade;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'quizzes_options_is_array'
          and conrelid = 'public.quizzes'::regclass
    ) then
        alter table public.quizzes
            add constraint quizzes_options_is_array
            check (jsonb_typeof(options) = 'array');
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'quizzes_correct_option_index_non_negative'
          and conrelid = 'public.quizzes'::regclass
    ) then
        alter table public.quizzes
            add constraint quizzes_correct_option_index_non_negative
            check (correct_option_index >= 0);
    end if;
end
$$;

create index if not exists lessons_type_order_idx
    on public.lessons (type, order_index);

create index if not exists quizzes_lesson_id_idx
    on public.quizzes (lesson_id);

drop trigger if exists set_quizzes_updated_at on public.quizzes;

create trigger set_quizzes_updated_at
before update on public.quizzes
for each row
execute function public.set_updated_at();

insert into public.courses (
    id,
    title,
    description,
    difficulty_level,
    instrument_type
)
values
    (
        '10000000-0000-4000-8000-000000000001',
        'Professional Guitar Performance',
        'Advanced guitar lessons focused on speed, phrasing, fretboard fluency, and modern groove control.',
        'Upper Intermediate',
        'Guitar'
    ),
    (
        '10000000-0000-4000-8000-000000000002',
        'Professional Piano Flow',
        'Dynamic piano lessons for rhythm language, voicing, arpeggios, and expressive modern accompaniment.',
        'Upper Intermediate',
        'Piano'
    ),
    (
        '10000000-0000-4000-8000-000000000003',
        'Professional Drum Control',
        'High-level drum content covering rudiments, pocket, fills, dynamics, and time-feel refinement.',
        'Upper Intermediate',
        'Drums'
    ),
    (
        '10000000-0000-4000-8000-000000000004',
        'Music Theory Essentials',
        'Core theory modules that explain notation, intervals, sound, and key relationships in a practical way.',
        'Intermediate',
        'General'
    ),
    (
        '10000000-0000-4000-8000-000000000005',
        'Assessment Quiz Arena',
        'Standalone quiz packs for checking recall, analytical thinking, and cross-instrument musicianship.',
        'Intermediate',
        'General'
    ),
    (
        '10000000-0000-4000-8000-000000000006',
        'Interactive Music Games',
        'Timed games and puzzle content designed to sharpen ear training, note recall, and rhythmic response.',
        'Intermediate',
        'General'
    )
on conflict (id) do update
set
    title = excluded.title,
    description = excluded.description,
    difficulty_level = excluded.difficulty_level,
    instrument_type = excluded.instrument_type,
    updated_at = now();

with lesson_seed (
    id,
    course_id,
    title,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    type,
    body
) as (
    values
        (
            '20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000004',
            'How to Read Staff',
            1,
            140,
            'theory_icon_1',
            'theory_video_1',
            'Beginner',
            'theory',
            jsonb_build_object(
                'summary', 'Decode the five-line staff, clefs, note placement, and ledger lines with a rehearsal-ready reading routine.',
                'steps', jsonb_build_array(
                    'Anchor the staff as five lines and four spaces, then assign pitch names relative to the active clef before reading any rhythm.',
                    'Use treble clef landmarks such as middle C, G on the second line, and F on the top line to orient fast passages.',
                    'Read by interval shape whenever possible so melodies feel like contour and spacing rather than isolated note names.',
                    'Treat ledger lines as extensions of the staff and count outward from the nearest known line or space.',
                    'Practice with a pencil-and-sing workflow: name the note, sing the pitch direction, then confirm it on your instrument.'
                ),
                'focus_tags', jsonb_build_array('staff reading', 'treble clef', 'ledger lines'),
                'duration_min', 14
            )
        ),
        (
            '20000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000004',
            'The Circle of Fifths',
            2,
            150,
            'theory_icon_2',
            'theory_video_2',
            'Intermediate',
            'theory',
            jsonb_build_object(
                'summary', 'Use the circle of fifths to predict key signatures, relative minors, dominant motion, and practical chord movement.',
                'steps', jsonb_build_array(
                    'Move clockwise to add sharps and counterclockwise to add flats, keeping track of the order in which each accidental appears.',
                    'Pair every major key with its relative minor so the circle becomes a harmony map rather than a memorization chart.',
                    'Locate dominant and subdominant relationships instantly by stepping one position clockwise or counterclockwise.',
                    'Use the circle to plan modulations, backcycling progressions, and practice loops in musically related keys.',
                    'Test the concept at the instrument by playing one scale, then shifting to its dominant and relative minor without stopping.'
                ),
                'focus_tags', jsonb_build_array('key signatures', 'harmony map', 'relative minor'),
                'duration_min', 16
            )
        ),
        (
            '20000000-0000-4000-8000-000000000003',
            '10000000-0000-4000-8000-000000000004',
            'Understanding Intervals',
            3,
            160,
            'theory_icon_3',
            'theory_video_3',
            'Intermediate',
            'theory',
            jsonb_build_object(
                'summary', 'Build interval fluency by measuring pitch distance, hearing quality, and relating intervals to scales and chords.',
                'steps', jsonb_build_array(
                    'Count letter names first to determine the generic interval number before checking quality such as major, minor, perfect, or augmented.',
                    'Compare each interval against a major scale reference so the quality becomes predictable instead of abstract.',
                    'Link intervals to chord construction by stacking thirds and hearing how tensions color the harmony.',
                    'Practice inversion pairs such as major sixth with minor third to speed up theory recall.',
                    'Sing intervals from a root note and then locate them on the fretboard, keyboard, or pad layout to lock in ear and hand together.'
                ),
                'focus_tags', jsonb_build_array('interval quality', 'ear training', 'chord building'),
                'duration_min', 15
            )
        ),
        (
            '20000000-0000-4000-8000-000000000004',
            '10000000-0000-4000-8000-000000000004',
            'Basic Music Notation',
            4,
            145,
            'theory_icon_4',
            'theory_video_4',
            'Beginner',
            'theory',
            jsonb_build_object(
                'summary', 'Understand note values, rests, ties, dotted notes, dynamics, articulations, and repeats in one practical notation system.',
                'steps', jsonb_build_array(
                    'Start with rhythmic value families so whole, half, quarter, and eighth notes become proportional rather than memorized symbols.',
                    'Read rest symbols as active time, not silence without structure, and count them with the same precision as notes.',
                    'Use ties to combine durations across beats while treating dotted notes as one note plus half of its original value.',
                    'Interpret articulation markings such as staccato, accent, and tenuto as instructions for touch and phrasing.',
                    'Follow repeat signs, first endings, and codas so longer forms can be navigated without losing bar awareness.'
                ),
                'focus_tags', jsonb_build_array('rhythm values', 'articulation', 'form'),
                'duration_min', 13
            )
        ),
        (
            '20000000-0000-4000-8000-000000000005',
            '10000000-0000-4000-8000-000000000004',
            'The Physics of Sound',
            5,
            170,
            'theory_icon_5',
            'theory_video_5',
            'Intermediate',
            'theory',
            jsonb_build_object(
                'summary', 'Connect vibration, frequency, amplitude, waveform shape, resonance, and overtone content to the sound you actually hear.',
                'steps', jsonb_build_array(
                    'Treat sound as organized vibration moving through a medium and measure its speed, frequency, and amplitude as separate properties.',
                    'Relate higher frequency to higher perceived pitch and larger amplitude to stronger perceived loudness.',
                    'Study wave shape and harmonic content to understand why two instruments can play the same note and still sound different.',
                    'Use resonance examples from strings, drum heads, and speaker cabinets to see how systems amplify particular frequencies.',
                    'Apply the theory to EQ, tuning, and tone design by identifying whether a sonic problem is pitch, balance, sustain, or overtone driven.'
                ),
                'focus_tags', jsonb_build_array('frequency', 'timbre', 'resonance'),
                'duration_min', 18
            )
        )
)
insert into public.lessons (
    id,
    course_id,
    title,
    content,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    content_json,
    type
)
select
    id,
    course_id,
    title,
    body,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    body,
    type
from lesson_seed
on conflict (id) do update
set
    course_id = excluded.course_id,
    title = excluded.title,
    content = excluded.content,
    order_index = excluded.order_index,
    xp_reward = excluded.xp_reward,
    image_url = excluded.image_url,
    video_url = excluded.video_url,
    difficulty = excluded.difficulty,
    content_json = excluded.content_json,
    type = excluded.type,
    updated_at = now();

with lesson_seed (
    id,
    course_id,
    title,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    type,
    body
) as (
    values
        (
            '21000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001',
            'Clean Chord Switching',
            1,
            180,
            'practical_guitar_1',
            'practical_guitar_video_1',
            'Beginner',
            'practical',
            jsonb_build_object(
                'summary', 'Make open-position chord changes feel musical by reducing wasted motion and controlling strum timing between shapes.',
                'steps', jsonb_build_array(
                    'Isolate the anchor finger that stays closest to the next chord and make it the visual target during every transition.',
                    'Lift fingers only as far as needed to clear the strings so the hand does not reset from zero on every change.',
                    'Count the final strum of the old chord and move during the space before the next beat lands.',
                    'Use muted practice reps where you switch shape silently without strumming to focus purely on movement efficiency.',
                    'Finish by cycling four-bar loops at a slow tempo and only increase speed when every string speaks clearly.'
                ),
                'focus_tags', jsonb_build_array('chord changes', 'timing', 'left hand control'),
                'duration_min', 15
            )
        ),
        (
            '21000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000001',
            'Minor Pentatonic Speed',
            2,
            220,
            'practical_guitar_2',
            'practical_guitar_video_2',
            'Upper Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Develop faster minor pentatonic lines without losing articulation, synchronization, or phrase clarity.',
                'steps', jsonb_build_array(
                    'Map the box pattern in one position and name the root notes so the shape is conceptually stable before pushing speed.',
                    'Use strict alternate picking with a metronome and play only as fast as both hands can stay rhythmically aligned.',
                    'Break the scale into three-note and four-note fragments to train acceleration without forcing the full pattern at once.',
                    'Add position shifts after the basic box feels clean so speed grows across the neck instead of only inside one shape.',
                    'Close each run with a bend, vibrato, or target note so the exercise stays connected to real solo language.'
                ),
                'focus_tags', jsonb_build_array('pentatonic', 'speed', 'alternate picking'),
                'duration_min', 19
            )
        ),
        (
            '21000000-0000-4000-8000-000000000003',
            '10000000-0000-4000-8000-000000000001',
            'Fretboard Sequencing',
            3,
            210,
            'practical_guitar_3',
            'practical_guitar_video_3',
            'Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Sequence scale fragments across strings to improve navigation, memory, and line construction under pressure.',
                'steps', jsonb_build_array(
                    'Choose one scale shape and play it in repeating three-note groups so you hear pattern movement rather than single notes.',
                    'Shift the same sequence onto adjacent strings and notice which fingerings stay stable and which require a position change.',
                    'Accent the first note of every group to reveal whether your timing stays solid while the hand moves.',
                    'Reverse the sequence so descending control develops as strongly as ascending control.',
                    'Improvise a short phrase using the same sequence logic to prove the pattern can become musical material.'
                ),
                'focus_tags', jsonb_build_array('fretboard fluency', 'sequencing', 'timing'),
                'duration_min', 17
            )
        ),
        (
            '21000000-0000-4000-8000-000000000004',
            '10000000-0000-4000-8000-000000000001',
            'Groove Lock Strumming',
            4,
            190,
            'practical_guitar_4',
            'practical_guitar_video_4',
            'Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Turn strumming into dependable groove by controlling subdivision, accents, and right-hand consistency.',
                'steps', jsonb_build_array(
                    'Keep the strumming hand moving in constant down-up motion even when some strokes miss the strings.',
                    'Count sixteenth-note subdivisions and choose exactly where the accents belong before adding chord changes.',
                    'Mute the strings with the fretting hand to practice pure rhythm without harmony distracting the pocket.',
                    'Introduce ghost strums and selective emphasis so the groove breathes instead of sounding mechanically even.',
                    'Record one-minute loops and listen for tempo drift, accent inconsistency, and unintentional rush on the turnaround.'
                ),
                'focus_tags', jsonb_build_array('strumming', 'groove', 'subdivision'),
                'duration_min', 16
            )
        ),
        (
            '21000000-0000-4000-8000-000000000005',
            '10000000-0000-4000-8000-000000000001',
            'Expressive Bends and Vibrato',
            5,
            230,
            'practical_guitar_5',
            'practical_guitar_video_5',
            'Upper Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Shape lead lines with accurate bends, controlled releases, and vocal-style vibrato that lands in tune.',
                'steps', jsonb_build_array(
                    'Pre-hear the destination pitch before bending so the motion is guided by your ear instead of your fingers.',
                    'Support the bending finger with the fingers behind it to increase strength and pitch stability.',
                    'Check whole-step and half-step bends against a reference note to eliminate habitual under-bending.',
                    'Separate vibrato from the bend itself by reaching the target first and then adding rhythmic width.',
                    'Use bends only on notes with melodic importance so expression feels intentional and not decorative.'
                ),
                'focus_tags', jsonb_build_array('lead guitar', 'bending', 'vibrato'),
                'duration_min', 18
            )
        )
)
insert into public.lessons (
    id,
    course_id,
    title,
    content,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    content_json,
    type
)
select
    id,
    course_id,
    title,
    body,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    body,
    type
from lesson_seed
on conflict (id) do update
set
    course_id = excluded.course_id,
    title = excluded.title,
    content = excluded.content,
    order_index = excluded.order_index,
    xp_reward = excluded.xp_reward,
    image_url = excluded.image_url,
    video_url = excluded.video_url,
    difficulty = excluded.difficulty,
    content_json = excluded.content_json,
    type = excluded.type,
    updated_at = now();

with lesson_seed (
    id,
    course_id,
    title,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    type,
    body
) as (
    values
        (
            '22000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002',
            'Hand Independence Foundations',
            1,
            180,
            'practical_piano_1',
            'practical_piano_video_1',
            'Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Separate the responsibilities of the two hands so groove, melody, and accompaniment can coexist cleanly.',
                'steps', jsonb_build_array(
                    'Assign one simple ostinato to the left hand and loop it until the pulse no longer requires conscious effort.',
                    'Add a right-hand melody using longer note values so the brain can track both parts without panic.',
                    'Count subdivisions aloud while both hands play to expose where the coordination slips.',
                    'Change dynamics independently so one hand can support while the other projects the lead line.',
                    'Expand the pattern into a short progression and keep the body loose so tension does not sabotage coordination.'
                ),
                'focus_tags', jsonb_build_array('independence', 'coordination', 'groove'),
                'duration_min', 16
            )
        ),
        (
            '22000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000002',
            'Syncopated Piano Rhythms',
            2,
            230,
            'practical_piano_2',
            'practical_piano_video_2',
            'Upper Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Play syncopated piano figures with confidence by placing accents off the beat while preserving a grounded pulse.',
                'steps', jsonb_build_array(
                    'Start with a metronome on beats two and four so the body feels the groove before the hands add complexity.',
                    'Clap the syncopated rhythm first, then transfer it to one hand while the other hand sustains simple chord tones.',
                    'Use short looped motifs that place accents on the and of the beat or tied syncopations across bar lines.',
                    'Keep the wrist relaxed and let the groove come from timing accuracy rather than heavier arm force.',
                    'Record two-bar loops and listen for whether off-beat accents still feel connected to the time grid.'
                ),
                'focus_tags', jsonb_build_array('syncopation', 'time feel', 'piano groove'),
                'duration_min', 18
            )
        ),
        (
            '22000000-0000-4000-8000-000000000003',
            '10000000-0000-4000-8000-000000000002',
            'Voicing Smooth Progressions',
            3,
            205,
            'practical_piano_3',
            'practical_piano_video_3',
            'Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Voice common chord progressions with minimal movement so harmony sounds polished and connected.',
                'steps', jsonb_build_array(
                    'Start with close-position triads and identify the common tones that can remain in place between chords.',
                    'Move only the notes that must change so each new voicing feels like a continuation of the previous sonority.',
                    'Convert the progression into inversions that keep the top voice singing smoothly.',
                    'Test the same progression in several keys to make the voicing concept transferable rather than key-specific.',
                    'Add light rhythmic comping after the voice leading feels secure so harmony and groove reinforce one another.'
                ),
                'focus_tags', jsonb_build_array('voice leading', 'comping', 'progressions'),
                'duration_min', 17
            )
        ),
        (
            '22000000-0000-4000-8000-000000000004',
            '10000000-0000-4000-8000-000000000002',
            'Arpeggio Precision',
            4,
            210,
            'practical_piano_4',
            'practical_piano_video_4',
            'Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Clean up broken-chord playing by controlling finger crossings, evenness, and harmonic awareness.',
                'steps', jsonb_build_array(
                    'Practice slow root-position arpeggios first and focus on even tone across every finger.',
                    'Prepare thumb-under and finger-over moments before they happen so hand shifts feel smooth instead of abrupt.',
                    'Use varied rhythms such as long-short and short-long to remove weak spots in the pattern.',
                    'Outline chord functions with the arpeggio so you hear tonic, predominant, and dominant behavior while practicing.',
                    'Apply the pattern to accompaniment figures and fills so precision transfers into real playing.'
                ),
                'focus_tags', jsonb_build_array('arpeggios', 'finger control', 'harmony'),
                'duration_min', 17
            )
        ),
        (
            '22000000-0000-4000-8000-000000000005',
            '10000000-0000-4000-8000-000000000002',
            'Contemporary Neo-Soul Texture',
            5,
            235,
            'practical_piano_5',
            'practical_piano_video_5',
            'Upper Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Blend rich voicings, delayed attacks, and tasteful rhythmic placement for a modern neo-soul piano texture.',
                'steps', jsonb_build_array(
                    'Choose extended chords with ninths, elevenths, and thirteenths while keeping the voicing compact and singable.',
                    'Place some chord attacks slightly behind the beat so the groove relaxes without collapsing.',
                    'Use the sustain pedal with restraint and change pedal after the harmony, not before it.',
                    'Decorate the top voice with slides and neighbor tones so the texture feels alive.',
                    'Finish by creating a four-bar vamp that balances color, pocket, and clarity.'
                ),
                'focus_tags', jsonb_build_array('neo-soul', 'voicings', 'feel'),
                'duration_min', 19
            )
        )
)
insert into public.lessons (
    id,
    course_id,
    title,
    content,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    content_json,
    type
)
select
    id,
    course_id,
    title,
    body,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    body,
    type
from lesson_seed
on conflict (id) do update
set
    course_id = excluded.course_id,
    title = excluded.title,
    content = excluded.content,
    order_index = excluded.order_index,
    xp_reward = excluded.xp_reward,
    image_url = excluded.image_url,
    video_url = excluded.video_url,
    difficulty = excluded.difficulty,
    content_json = excluded.content_json,
    type = excluded.type,
    updated_at = now();

with lesson_seed (
    id,
    course_id,
    title,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    type,
    body
) as (
    values
        (
            '23000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000003',
            'Groove Grid Control',
            1,
            185,
            'practical_drums_1',
            'practical_drums_video_1',
            'Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Lock the drum kit to a dependable time grid by controlling subdivision awareness and backbeat consistency.',
                'steps', jsonb_build_array(
                    'Play quarter notes on the hi-hat while counting sixteenth subdivisions out loud to internalize the full grid.',
                    'Place the snare on beats two and four with identical tone and height so the backbeat stays authoritative.',
                    'Keep the kick drum simple at first and use it to reinforce the pulse rather than chase complexity.',
                    'Move the hi-hat pattern between straight eighths, sixteenths, and off-beat openings without changing the tempo center.',
                    'Listen back for rushing fills into beat one and uneven hi-hat spacing, then correct one issue at a time.'
                ),
                'focus_tags', jsonb_build_array('timekeeping', 'subdivision', 'backbeat'),
                'duration_min', 16
            )
        ),
        (
            '23000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000003',
            'Drum Paradiddle Mastery',
            2,
            240,
            'practical_drums_2',
            'practical_drums_video_2',
            'Upper Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Internalize paradiddles as a musical language for fills, groove variations, and hand-to-hand control.',
                'steps', jsonb_build_array(
                    'Recite the sticking pattern clearly before playing so the mind stays ahead of the hands.',
                    'Play paradiddles at low volume first and make every stroke height intentional instead of accidental.',
                    'Accent different parts of the pattern to hear how the rudiment can imply different groove shapes.',
                    'Move the accents around the kit while keeping the underlying sticking stable.',
                    'Transform the rudiment into a fill that resolves cleanly on beat one without tempo distortion.'
                ),
                'focus_tags', jsonb_build_array('paradiddles', 'rudiments', 'stick control'),
                'duration_min', 18
            )
        ),
        (
            '23000000-0000-4000-8000-000000000003',
            '10000000-0000-4000-8000-000000000003',
            'Ghost Note Pocket',
            3,
            215,
            'practical_drums_3',
            'practical_drums_video_3',
            'Upper Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Use ghost notes to deepen groove without clutter by controlling touch, spacing, and dynamic contrast.',
                'steps', jsonb_build_array(
                    'Build the main groove first with kick, snare backbeat, and steady timekeeping so the pocket is already solid.',
                    'Add one ghost note at a time and make it clearly quieter than the accented snare hits.',
                    'Place ghost notes where they strengthen the subdivision, not where they only increase hand motion.',
                    'Maintain identical kick drum timing even when the left hand becomes more active.',
                    'Record medium-tempo grooves and listen for whether the ghost notes actually improve the feel.'
                ),
                'focus_tags', jsonb_build_array('ghost notes', 'dynamics', 'pocket'),
                'duration_min', 17
            )
        ),
        (
            '23000000-0000-4000-8000-000000000004',
            '10000000-0000-4000-8000-000000000003',
            'Linear Fill Construction',
            4,
            225,
            'practical_drums_4',
            'practical_drums_video_4',
            'Upper Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Design linear fills that move around the kit with clarity, direction, and clean subdivision placement.',
                'steps', jsonb_build_array(
                    'Define the subdivision first, then place one limb per note so no two hits happen simultaneously.',
                    'Start with short one-beat phrases and repeat them until the sticking feels automatic.',
                    'Move the hand notes between snare and toms while leaving the bass drum pattern consistent.',
                    'Control dynamics so the fill rises toward the resolution instead of sounding like random impacts.',
                    'Always practice the transition back into the groove because that is where linear fills usually rush.'
                ),
                'focus_tags', jsonb_build_array('linear fills', 'coordination', 'transitions'),
                'duration_min', 18
            )
        ),
        (
            '23000000-0000-4000-8000-000000000005',
            '10000000-0000-4000-8000-000000000003',
            'Dynamic Ride Cymbal Phrasing',
            5,
            210,
            'practical_drums_5',
            'practical_drums_video_5',
            'Intermediate',
            'practical',
            jsonb_build_object(
                'summary', 'Shape ride cymbal lines with clear quarter-note authority, subtle texture, and musical dynamic contour.',
                'steps', jsonb_build_array(
                    'Establish a relaxed ride pattern with an audible quarter-note pulse inside the swing or straight subdivision.',
                    'Control shoulder and tip contact so the cymbal speaks with a consistent tone.',
                    'Vary dynamics phrase by phrase rather than bar by bar so the ride part feels conversational.',
                    'Coordinate the left hand and bass drum underneath the ride without disturbing the cymbal time.',
                    'Listen for wash buildup, uneven spacing, and lost quarter-note definition, then refine the motion.'
                ),
                'focus_tags', jsonb_build_array('ride cymbal', 'phrasing', 'dynamics'),
                'duration_min', 16
            )
        )
)
insert into public.lessons (
    id,
    course_id,
    title,
    content,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    content_json,
    type
)
select
    id,
    course_id,
    title,
    body,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    body,
    type
from lesson_seed
on conflict (id) do update
set
    course_id = excluded.course_id,
    title = excluded.title,
    content = excluded.content,
    order_index = excluded.order_index,
    xp_reward = excluded.xp_reward,
    image_url = excluded.image_url,
    video_url = excluded.video_url,
    difficulty = excluded.difficulty,
    content_json = excluded.content_json,
    type = excluded.type,
    updated_at = now();

with lesson_seed (
    id,
    course_id,
    title,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    type,
    body
) as (
    values
        (
            '24000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000005',
            'Staff Reading Sprint',
            1,
            160,
            'quiz_bg_blue',
            'quiz_motion_1',
            'Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'Five rapid staff-reading questions that test clef landmarks, note placement, and rhythmic symbol recall.',
                'steps', jsonb_build_array(
                    'Read each prompt before scanning the answer options so your first instinct is based on recognition, not elimination.',
                    'Visualize the staff and count from the nearest landmark rather than trying to memorize every line in isolation.',
                    'Answer on a steady timer to build practical reading speed.',
                    'Review every explanation and note which symbols or positions slow you down most.',
                    'Repeat the pack until correct answers feel immediate.'
                ),
                'focus_tags', jsonb_build_array('staff reading', 'speed', 'notation recall'),
                'duration_min', 10
            )
        ),
        (
            '24000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000005',
            'Circle of Fifths Logic Test',
            2,
            170,
            'quiz_bg_violet',
            'quiz_motion_2',
            'Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'A focused quiz on key signatures, relative minors, dominant motion, and directional thinking on the circle.',
                'steps', jsonb_build_array(
                    'Picture the circle layout before looking at the answers.',
                    'Translate every key movement into clockwise or counterclockwise logic.',
                    'Link each key to its relative minor and dominant immediately.',
                    'Use the explanations to repair any weak spots in the map.',
                    'Retake until the circle feels operational rather than theoretical.'
                ),
                'focus_tags', jsonb_build_array('keys', 'dominant motion', 'relative minor'),
                'duration_min', 11
            )
        ),
        (
            '24000000-0000-4000-8000-000000000003',
            '10000000-0000-4000-8000-000000000005',
            'Interval Naming Intensive',
            3,
            175,
            'quiz_bg_mint',
            'quiz_motion_3',
            'Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'Check interval number, quality, and inversion awareness across common melodic and harmonic distances.',
                'steps', jsonb_build_array(
                    'Count letter names first, then quality, on every question.',
                    'Use major-scale reference thinking to confirm the answer.',
                    'Watch for inversion logic when similar interval pairs appear.',
                    'Do not rush enharmonic traps.',
                    'Repeat until interval naming feels automatic.'
                ),
                'focus_tags', jsonb_build_array('intervals', 'analysis', 'ear theory'),
                'duration_min', 10
            )
        ),
        (
            '24000000-0000-4000-8000-000000000004',
            '10000000-0000-4000-8000-000000000005',
            'Notation Symbol Mastery',
            4,
            165,
            'quiz_bg_cyan',
            'quiz_motion_4',
            'Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'Challenge your command of note values, rests, ties, dots, articulations, and common notation markings.',
                'steps', jsonb_build_array(
                    'Picture the symbol before you read the choices.',
                    'Relate every sign to a practical effect in sound or timing.',
                    'Pay attention to whether the question asks about duration, phrasing, or pitch.',
                    'Use the explanations to build a tighter notation vocabulary.',
                    'Aim for both accuracy and speed.'
                ),
                'focus_tags', jsonb_build_array('notation', 'symbols', 'rhythm'),
                'duration_min', 9
            )
        ),
        (
            '24000000-0000-4000-8000-000000000005',
            '10000000-0000-4000-8000-000000000005',
            'Sound Physics Challenge',
            5,
            185,
            'quiz_bg_sky',
            'quiz_motion_5',
            'Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'Probe your understanding of vibration, timbre, resonance, loudness, and frequency using practical studio language.',
                'steps', jsonb_build_array(
                    'Separate pitch, loudness, and tone color before answering.',
                    'Link each concept to a real instrument or recording scenario.',
                    'Watch for questions that contrast frequency with amplitude.',
                    'Use explanations to connect science language to music production decisions.',
                    'Retake until you can explain every correct answer in plain English.'
                ),
                'focus_tags', jsonb_build_array('sound design', 'frequency', 'timbre'),
                'duration_min', 11
            )
        ),
        (
            '24000000-0000-4000-8000-000000000006',
            '10000000-0000-4000-8000-000000000005',
            'Guitar Fretboard Focus',
            6,
            180,
            'quiz_bg_lagoon',
            'quiz_motion_6',
            'Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'A guitar-specific quiz pack on tuning, pentatonic formulae, fretboard landmarks, and practical lead mechanics.',
                'steps', jsonb_build_array(
                    'Visualize the neck before selecting the answer.',
                    'Use interval logic instead of memorized shapes alone.',
                    'Confirm string order and fret landmarks mentally.',
                    'Treat lead-guitar technique questions as musical problem solving.',
                    'Use the quiz to reveal weak zones on the neck.'
                ),
                'focus_tags', jsonb_build_array('guitar', 'fretboard', 'scales'),
                'duration_min', 10
            )
        ),
        (
            '24000000-0000-4000-8000-000000000007',
            '10000000-0000-4000-8000-000000000005',
            'Piano Rhythm Accuracy',
            7,
            180,
            'quiz_bg_amethyst',
            'quiz_motion_7',
            'Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'Test your knowledge of syncopation, pedal timing, subdivisions, and the language of groove on piano.',
                'steps', jsonb_build_array(
                    'Read for timing meaning, not only vocabulary recognition.',
                    'Imagine how the rhythm would sound under your hands.',
                    'Use pulse math when dotted values or tuplets appear.',
                    'Check whether the question is about feel, function, or notation.',
                    'Repeat until the correct answers feel obvious.'
                ),
                'focus_tags', jsonb_build_array('piano', 'rhythm', 'subdivision'),
                'duration_min', 10
            )
        ),
        (
            '24000000-0000-4000-8000-000000000008',
            '10000000-0000-4000-8000-000000000005',
            'Drum Rudiment Intelligence',
            8,
            185,
            'quiz_bg_teal',
            'quiz_motion_8',
            'Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'Measure your command of paradiddles, ghost notes, flams, linear phrasing, and subdivision language.',
                'steps', jsonb_build_array(
                    'Hear the sticking in your head before answering.',
                    'Translate rudiment names into real motion and sound.',
                    'Think about dynamic intent, not only sticking order.',
                    'Use the explanations to connect vocabulary to kit application.',
                    'Treat missed answers as practice priorities.'
                ),
                'focus_tags', jsonb_build_array('drums', 'rudiments', 'coordination'),
                'duration_min', 10
            )
        ),
        (
            '24000000-0000-4000-8000-000000000009',
            '10000000-0000-4000-8000-000000000005',
            'Harmony and Chord Function',
            9,
            190,
            'quiz_bg_sunset',
            'quiz_motion_9',
            'Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'A harmony pack that checks function, progressions, triad quality, suspended colors, and chord-tone spelling.',
                'steps', jsonb_build_array(
                    'Name function before quality whenever a progression appears.',
                    'Spell chord tones carefully instead of relying on shape memory.',
                    'Track whether the question is modal, tonal, or functional.',
                    'Review any miss until you can explain the choice out loud.',
                    'Aim for clean theoretical language as well as correct answers.'
                ),
                'focus_tags', jsonb_build_array('harmony', 'chord function', 'voicing logic'),
                'duration_min', 11
            )
        ),
        (
            '24000000-0000-4000-8000-000000000010',
            '10000000-0000-4000-8000-000000000005',
            'Mixed Musicianship Final',
            10,
            210,
            'quiz_bg_aurora',
            'quiz_motion_10',
            'Upper Intermediate',
            'quiz',
            jsonb_build_object(
                'summary', 'A final mixed quiz that blends tempo, harmony, notation, drum feel, and practical musicianship decisions.',
                'steps', jsonb_build_array(
                    'Treat this pack like a final checkpoint for the full catalog.',
                    'Switch mental gears quickly between theory, rhythm, and instrument-specific questions.',
                    'Trust the pulse when time-based math appears.',
                    'Use explanations to identify which discipline still needs review.',
                    'Retake after working the weak areas.'
                ),
                'focus_tags', jsonb_build_array('mixed review', 'tempo', 'musicianship'),
                'duration_min', 12
            )
        )
)
insert into public.lessons (
    id,
    course_id,
    title,
    content,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    content_json,
    type
)
select
    id,
    course_id,
    title,
    body,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    body,
    type
from lesson_seed
on conflict (id) do update
set
    course_id = excluded.course_id,
    title = excluded.title,
    content = excluded.content,
    order_index = excluded.order_index,
    xp_reward = excluded.xp_reward,
    image_url = excluded.image_url,
    video_url = excluded.video_url,
    difficulty = excluded.difficulty,
    content_json = excluded.content_json,
    type = excluded.type,
    updated_at = now();

with lesson_seed (
    id,
    course_id,
    title,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    type,
    body
) as (
    values
        (
            '25000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000006',
            'Ear Training Challenge',
            1,
            220,
            'game_logo_ear',
            'game_video_1',
            'Intermediate',
            'game',
            jsonb_build_object(
                'summary', 'Identify intervals, chord colors, and tonal centers under time pressure using repeated short listening rounds.',
                'steps', jsonb_build_array(
                    'Start each round by hearing a reference pitch or tonal center.',
                    'Listen to the prompt once without touching the instrument, then answer from your ear first.',
                    'Use streak scoring to reward consecutive correct identifications.',
                    'Review the missed examples immediately and sing them back before the next round.',
                    'Increase speed only after accuracy remains high for several rounds.'
                ),
                'focus_tags', jsonb_build_array('ear training', 'listening', 'speed round'),
                'duration_min', 12
            )
        ),
        (
            '25000000-0000-4000-8000-000000000002',
            '10000000-0000-4000-8000-000000000006',
            'Note Identification Speedrun',
            2,
            210,
            'game_logo_notes',
            'game_video_2',
            'Intermediate',
            'game',
            jsonb_build_object(
                'summary', 'Race the clock by naming notes on staff, keyboard, fretboard, and drum-grid style prompts as fast as possible.',
                'steps', jsonb_build_array(
                    'A note prompt appears and the timer begins immediately.',
                    'Answer before the multiplier bar expires to stack bonus points.',
                    'Use visual landmarks such as middle C, string roots, or black-key groupings to speed up recall.',
                    'Wrong answers break the streak and reveal the correct mapping.',
                    'Replay until recognition becomes automatic rather than analytical.'
                ),
                'focus_tags', jsonb_build_array('note recall', 'speed', 'visual mapping'),
                'duration_min', 10
            )
        ),
        (
            '25000000-0000-4000-8000-000000000003',
            '10000000-0000-4000-8000-000000000006',
            'Rhythm Matching Puzzle',
            3,
            225,
            'game_logo_rhythm',
            'game_video_3',
            'Intermediate',
            'game',
            jsonb_build_object(
                'summary', 'Match heard rhythms to notation patterns by comparing subdivision shape, accent placement, and phrase length.',
                'steps', jsonb_build_array(
                    'Hear the rhythm twice before seeing the answer options.',
                    'Count the subdivision grid silently so you recognize placement, not just overall shape.',
                    'Compare where the attacks land against the bar, especially on off-beats and ties.',
                    'Use the solution review to replay the correct rhythm and clap it back.',
                    'Advance to harder rounds once eighth-note and sixteenth-note syncopations feel reliable.'
                ),
                'focus_tags', jsonb_build_array('rhythm', 'matching', 'subdivision'),
                'duration_min', 11
            )
        ),
        (
            '25000000-0000-4000-8000-000000000004',
            '10000000-0000-4000-8000-000000000006',
            'Chord Builder Blitz',
            4,
            230,
            'game_logo_chords',
            'game_video_4',
            'Intermediate',
            'game',
            jsonb_build_object(
                'summary', 'Construct requested chord qualities from roots under a countdown and verify the exact chord tones before time runs out.',
                'steps', jsonb_build_array(
                    'A root note and chord quality appear at the start of the round.',
                    'Build the chord mentally by interval recipe before choosing or entering notes.',
                    'Bonus points are awarded for fast, perfect chord spelling.',
                    'Misses trigger an instant breakdown of the correct interval stack.',
                    'Increase difficulty by adding sevenths, suspensions, and altered tensions.'
                ),
                'focus_tags', jsonb_build_array('chords', 'construction', 'speed logic'),
                'duration_min', 12
            )
        ),
        (
            '25000000-0000-4000-8000-000000000005',
            '10000000-0000-4000-8000-000000000006',
            'Interval Detective',
            5,
            235,
            'game_logo_intervals',
            'game_video_5',
            'Upper Intermediate',
            'game',
            jsonb_build_object(
                'summary', 'Solve interval clues by combining listening, notation, and functional hints in a progressive detective-style challenge.',
                'steps', jsonb_build_array(
                    'Read the clue package, which may include staff notation, scale context, or an audio hint.',
                    'Infer the interval number before deciding the quality.',
                    'Use elimination only after you have tested the musical logic.',
                    'Check every reveal and note which clues gave away the answer fastest.',
                    'Replay higher-level cases until inversion and enharmonic traps stop causing misses.'
                ),
                'focus_tags', jsonb_build_array('intervals', 'logic', 'analysis game'),
                'duration_min', 13
            )
        )
)
insert into public.lessons (
    id,
    course_id,
    title,
    content,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    content_json,
    type
)
select
    id,
    course_id,
    title,
    body,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty,
    body,
    type
from lesson_seed
on conflict (id) do update
set
    course_id = excluded.course_id,
    title = excluded.title,
    content = excluded.content,
    order_index = excluded.order_index,
    xp_reward = excluded.xp_reward,
    image_url = excluded.image_url,
    video_url = excluded.video_url,
    difficulty = excluded.difficulty,
    content_json = excluded.content_json,
    type = excluded.type,
    updated_at = now();

with quiz_seed (
    id,
    lesson_id,
    question,
    options,
    correct_option_index,
    explanation
) as (
    values
        ('30000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'In treble clef, which pitch sits on the second line of the staff?', '["G","B","D","F"]'::jsonb, 0, 'The second line of the treble staff is G and is a core visual landmark.'),
        ('30000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000001', 'What pitch is written on a single ledger line directly below the treble staff?', '["A3","B3","C4","D4"]'::jsonb, 2, 'Middle C is written on one ledger line below the treble staff.'),
        ('30000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000001', 'A time signature of 6/8 tells you that each measure contains:', '["Six quarter notes","Six eighth notes","Three half notes","Eight sixteenth notes"]'::jsonb, 1, 'The top number counts beats or note units, and the bottom number names the unit as eighth notes.'),
        ('30000000-0000-4000-8000-000000000004', '24000000-0000-4000-8000-000000000001', 'Which accidental raises a note by one half step?', '["Flat","Natural","Sharp","Fermata"]'::jsonb, 2, 'A sharp raises the pitch by one semitone.'),
        ('30000000-0000-4000-8000-000000000005', '24000000-0000-4000-8000-000000000001', 'In treble clef, the first space of the staff is:', '["E","F","G","A"]'::jsonb, 1, 'The spaces of the treble staff spell F A C E from bottom to top.'),

        ('30000000-0000-4000-8000-000000000006', '24000000-0000-4000-8000-000000000002', 'Moving one step clockwise on the circle of fifths usually adds:', '["One flat","One sharp","Two sharps","A relative minor"]'::jsonb, 1, 'Clockwise motion adds sharps one at a time.'),
        ('30000000-0000-4000-8000-000000000007', '24000000-0000-4000-8000-000000000002', 'Which major key has three flats?', '["A major","E-flat major","D major","B major"]'::jsonb, 1, 'E-flat major contains B-flat, E-flat, and A-flat.'),
        ('30000000-0000-4000-8000-000000000008', '24000000-0000-4000-8000-000000000002', 'What is the relative minor of G major?', '["E minor","D minor","B minor","C minor"]'::jsonb, 0, 'The relative minor shares the key signature and starts on the sixth degree.'),
        ('30000000-0000-4000-8000-000000000009', '24000000-0000-4000-8000-000000000002', 'One step counterclockwise from C major on the circle lands on:', '["G major","D major","F major","A minor"]'::jsonb, 2, 'Counterclockwise adds flats, so the first stop from C is F major.'),
        ('30000000-0000-4000-8000-000000000010', '24000000-0000-4000-8000-000000000002', 'What is the dominant major key of A major?', '["D major","E major","F-sharp major","B major"]'::jsonb, 1, 'The dominant is built on scale degree five, so A major points to E major.'),

        ('30000000-0000-4000-8000-000000000011', '24000000-0000-4000-8000-000000000003', 'The interval from C up to G is a:', '["Perfect fourth","Perfect fifth","Major sixth","Minor sixth"]'::jsonb, 1, 'C to G spans five letter names and is a perfect fifth.'),
        ('30000000-0000-4000-8000-000000000012', '24000000-0000-4000-8000-000000000003', 'The interval from E up to F is a:', '["Major second","Minor second","Perfect fourth","Augmented second"]'::jsonb, 1, 'E to F is one semitone and therefore a minor second.'),
        ('30000000-0000-4000-8000-000000000013', '24000000-0000-4000-8000-000000000003', 'The interval from C up to A is a:', '["Perfect fifth","Major sixth","Minor sixth","Major seventh"]'::jsonb, 1, 'C to A spans six letter names and fits the major-sixth size.'),
        ('30000000-0000-4000-8000-000000000014', '24000000-0000-4000-8000-000000000003', 'What is the inversion of a major sixth?', '["Major third","Minor third","Perfect fourth","Minor sixth"]'::jsonb, 1, 'Inversions sum to nine and major becomes minor, so a major sixth inverts to a minor third.'),
        ('30000000-0000-4000-8000-000000000015', '24000000-0000-4000-8000-000000000003', 'Two notes with the same pitch name and octave form a:', '["Minor second","Perfect unison","Perfect octave","Major second"]'::jsonb, 1, 'The same pitch in the same register is a perfect unison.'),

        ('30000000-0000-4000-8000-000000000016', '24000000-0000-4000-8000-000000000004', 'A dot placed after a note adds:', '["Half the note value","A whole beat every time","Double the note value","A semitone"]'::jsonb, 0, 'A dotted note lasts for its original value plus half of that value.'),
        ('30000000-0000-4000-8000-000000000017', '24000000-0000-4000-8000-000000000004', 'A tie connects:', '["Two different pitches for legato phrasing","Two identical pitches to combine duration","Any repeated rhythm pattern","A note and a rest"]'::jsonb, 1, 'Ties join identical pitches so their durations become one sustained event.'),
        ('30000000-0000-4000-8000-000000000018', '24000000-0000-4000-8000-000000000004', 'A staccato marking tells the performer to play:', '["Smooth and connected","Loud and accented","Short and detached","Very slowly"]'::jsonb, 2, 'Staccato indicates short, separated articulation.'),
        ('30000000-0000-4000-8000-000000000019', '24000000-0000-4000-8000-000000000004', 'Which symbol cancels a previous sharp or flat for that pitch in the measure?', '["Coda","Natural","Repeat sign","Accent"]'::jsonb, 1, 'A natural sign returns the pitch to its unaltered form.'),
        ('30000000-0000-4000-8000-000000000020', '24000000-0000-4000-8000-000000000004', 'A fermata generally means:', '["Play the note lower","Hold the note longer than written","Repeat the measure","Cut the note short"]'::jsonb, 1, 'A fermata signals a held note or rest, usually longer than the written value.'),

        ('30000000-0000-4000-8000-000000000021', '24000000-0000-4000-8000-000000000005', 'Frequency is usually measured in:', '["Decibels","Hertz","Watts","Seconds"]'::jsonb, 1, 'Hertz counts cycles per second.'),
        ('30000000-0000-4000-8000-000000000022', '24000000-0000-4000-8000-000000000005', 'Amplitude most directly affects perceived:', '["Pitch","Tempo","Loudness","Key center"]'::jsonb, 2, 'Greater amplitude is generally heard as greater loudness.'),
        ('30000000-0000-4000-8000-000000000023', '24000000-0000-4000-8000-000000000005', 'A faster vibration rate produces a:', '["Lower pitch","Higher pitch","Longer note value","Softer sound"]'::jsonb, 1, 'Higher frequency results in higher perceived pitch.'),
        ('30000000-0000-4000-8000-000000000024', '24000000-0000-4000-8000-000000000005', 'Timbre is strongly shaped by an instrument''s:', '["Harmonic content","Metronome setting","Measure count","Song title"]'::jsonb, 0, 'Waveform shape and overtone content help define timbre.'),
        ('30000000-0000-4000-8000-000000000025', '24000000-0000-4000-8000-000000000005', 'Audio compression mainly reduces:', '["Dynamic range","Pitch accuracy","Key signatures","Rhythmic subdivision"]'::jsonb, 0, 'Compression narrows the gap between louder and quieter levels.'),

        ('30000000-0000-4000-8000-000000000026', '24000000-0000-4000-8000-000000000006', 'What pitch is found at the fifth fret of the low E string in standard tuning?', '["G","A","B","C"]'::jsonb, 1, 'The low E string rises chromatically to A at the fifth fret.'),
        ('30000000-0000-4000-8000-000000000027', '24000000-0000-4000-8000-000000000006', 'The minor pentatonic scale formula is:', '["1 2 3 5 6","1 b3 4 5 b7","1 2 4 5 b7","1 b2 4 5 b6"]'::jsonb, 1, 'Minor pentatonic is built from 1, b3, 4, 5, and b7.'),
        ('30000000-0000-4000-8000-000000000028', '24000000-0000-4000-8000-000000000006', 'Standard guitar tuning from low to high is:', '["E A D G B E","E B G D A E","D G C F A D","E A C G B E"]'::jsonb, 0, 'Standard tuning is E A D G B E.'),
        ('30000000-0000-4000-8000-000000000029', '24000000-0000-4000-8000-000000000006', 'Accurate string bends are usually improved by:', '["Using one finger only with a collapsed wrist","Supporting the bend with nearby fingers","Picking harder instead of listening","Avoiding reference pitches"]'::jsonb, 1, 'Multiple fingers behind the bend add strength and pitch control.'),
        ('30000000-0000-4000-8000-000000000030', '24000000-0000-4000-8000-000000000006', 'Moving two frets higher on the same string changes the pitch by:', '["One half step","One whole step","A minor third","A perfect fourth"]'::jsonb, 1, 'Two frets equal two semitones, or one whole step.'),

        ('30000000-0000-4000-8000-000000000031', '24000000-0000-4000-8000-000000000007', 'Syncopation usually emphasizes:', '["Only beat one","Weak beats or off-beats","The downbeat of every bar","Silence instead of rhythm"]'::jsonb, 1, 'Syncopation shifts emphasis away from the most expected strong beats.'),
        ('30000000-0000-4000-8000-000000000032', '24000000-0000-4000-8000-000000000007', 'A triplet divides one beat into:', '["Two equal notes","Three equal notes","Four equal notes","Six equal notes"]'::jsonb, 1, 'Triplets split the beat into three equal parts.'),
        ('30000000-0000-4000-8000-000000000033', '24000000-0000-4000-8000-000000000007', 'If the sustain pedal changes too late, the harmony may sound:', '["More detached","Blurred together","More percussive","Muted"]'::jsonb, 1, 'Late pedal changes can smear one harmony into the next.'),
        ('30000000-0000-4000-8000-000000000034', '24000000-0000-4000-8000-000000000007', 'An ostinato is best described as:', '["A repeated pattern","A random chord cluster","A tempo marking","A one-time accent"]'::jsonb, 0, 'An ostinato is a repeating musical pattern.'),
        ('30000000-0000-4000-8000-000000000035', '24000000-0000-4000-8000-000000000007', 'In 4/4, a dotted quarter note lasts for:', '["One beat","One and a half beats","Two beats","Three beats"]'::jsonb, 1, 'A quarter note plus half of itself equals one and a half beats.'),

        ('30000000-0000-4000-8000-000000000036', '24000000-0000-4000-8000-000000000008', 'The sticking pattern for a standard paradiddle is:', '["RLRL LRLR","RRLL RRLL","RLRR LRLL","RLLR LRRL"]'::jsonb, 2, 'Paradiddle combines single and double strokes as RLRR LRLL.'),
        ('30000000-0000-4000-8000-000000000037', '24000000-0000-4000-8000-000000000008', 'Ghost notes are generally played:', '["Very loudly","Very quietly","Only on cymbals","Only with the kick drum"]'::jsonb, 1, 'Ghost notes are intentionally soft notes that deepen the groove.'),
        ('30000000-0000-4000-8000-000000000038', '24000000-0000-4000-8000-000000000008', 'A flam is created by:', '["Two simultaneous bass drum hits","A grace note striking just before the main note","A sustained cymbal roll","A note tied across the bar line"]'::jsonb, 1, 'A flam uses one grace note followed by the principal stroke.'),
        ('30000000-0000-4000-8000-000000000039', '24000000-0000-4000-8000-000000000008', 'A linear drum groove means:', '["Only the hands play","No two limbs strike at the same time","Every note is accented","The tempo constantly accelerates"]'::jsonb, 1, 'Linear phrasing avoids simultaneous limb hits.'),
        ('30000000-0000-4000-8000-000000000040', '24000000-0000-4000-8000-000000000008', 'A common spoken count for sixteenth notes is:', '["1 and 2 and","1 trip let","1 e and a","1 la li"]'::jsonb, 2, 'The classic sixteenth-note grid is counted as 1 e and a.'),

        ('30000000-0000-4000-8000-000000000041', '24000000-0000-4000-8000-000000000009', 'In tonal harmony, the V chord most strongly resolves to:', '["ii","iii","I","vi"]'::jsonb, 2, 'Dominant function naturally points back to tonic.'),
        ('30000000-0000-4000-8000-000000000042', '24000000-0000-4000-8000-000000000009', 'A ii V I progression in C major is:', '["Dm7 G7 Cmaj7","Em7 A7 Dmaj7","Am7 D7 Gmaj7","Fm7 Bb7 Ebmaj7"]'::jsonb, 0, 'Scale degrees ii, V, and I in C are Dm, G, and C.'),
        ('30000000-0000-4000-8000-000000000043', '24000000-0000-4000-8000-000000000009', 'A major triad contains which interval structure from the root?', '["Major third and perfect fifth","Minor third and perfect fifth","Major third and diminished fifth","Minor third and major sixth"]'::jsonb, 0, 'Major triads are built from root, major third, and perfect fifth.'),
        ('30000000-0000-4000-8000-000000000044', '24000000-0000-4000-8000-000000000009', 'A suspended chord replaces the third with a:', '["Second or fourth","Seventh only","Flat fifth","Minor sixth"]'::jsonb, 0, 'Suspended chords omit the third and usually use the second or fourth.'),
        ('30000000-0000-4000-8000-000000000045', '24000000-0000-4000-8000-000000000009', 'Which notes belong to an A minor triad?', '["A C E","A C-sharp E","A D E","A C F"]'::jsonb, 0, 'A minor triad spells A, C, and E.'),

        ('30000000-0000-4000-8000-000000000046', '24000000-0000-4000-8000-000000000010', 'BPM stands for:', '["Bars per measure","Beats per minute","Bass pulse motion","Balanced pitch movement"]'::jsonb, 1, 'BPM is the standard abbreviation for beats per minute.'),
        ('30000000-0000-4000-8000-000000000047', '24000000-0000-4000-8000-000000000010', 'In a 12-bar blues in E, the home chord is:', '["E major or E7","A major only","B diminished","C-sharp minor only"]'::jsonb, 0, 'The blues in E centers on the I chord, commonly voiced as E7.'),
        ('30000000-0000-4000-8000-000000000048', '24000000-0000-4000-8000-000000000010', 'In 4/4, the distance from beat two to beat four is:', '["One beat","Two beats","Three beats","Half a beat"]'::jsonb, 1, 'Beat four is two beats after beat two.'),
        ('30000000-0000-4000-8000-000000000049', '24000000-0000-4000-8000-000000000010', 'Which rest can represent an entire measure of silence in common time?', '["Eighth rest","Quarter rest","Half rest","Whole rest"]'::jsonb, 3, 'A whole rest commonly marks a full measure of silence in 4/4.'),
        ('30000000-0000-4000-8000-000000000050', '24000000-0000-4000-8000-000000000010', 'At 60 BPM, one quarter note lasts for:', '["Half a second","One second","One and a half seconds","Two seconds"]'::jsonb, 1, 'Sixty quarter-note beats per minute means each beat lasts exactly one second.')
)
insert into public.quizzes (
    id,
    lesson_id,
    question,
    options,
    correct_option_index,
    explanation
)
select
    id::uuid,
    lesson_id,
    question,
    options,
    correct_option_index,
    explanation
from quiz_seed
on conflict (id) do update
set
    lesson_id = excluded.lesson_id,
    question = excluded.question,
    options = excluded.options,
    correct_option_index = excluded.correct_option_index,
    explanation = excluded.explanation,
    updated_at = now();

commit;
