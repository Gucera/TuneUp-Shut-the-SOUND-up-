begin;

alter table public.lessons
    add column if not exists image_url text,
    add column if not exists video_url text,
    add column if not exists difficulty text,
    add column if not exists content_json jsonb not null default '{}'::jsonb;

update public.lessons
set content_json = content
where content_json = '{}'::jsonb
    and jsonb_typeof(content) in ('object', 'array');

create table if not exists public.quizzes (
    id uuid primary key,
    lesson_id uuid not null references public.lessons (id) on delete cascade,
    question text not null,
    options jsonb not null default '[]'::jsonb,
    correct_option_index integer not null default 0,
    explanation text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint quizzes_question_not_blank check (btrim(question) <> ''),
    constraint quizzes_options_is_array check (jsonb_typeof(options) = 'array'),
    constraint quizzes_correct_option_non_negative check (correct_option_index >= 0)
);

create index if not exists quizzes_lesson_id_idx
    on public.quizzes (lesson_id);

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'set_quizzes_updated_at'
    ) then
        create trigger set_quizzes_updated_at
        before update on public.quizzes
        for each row
        execute function public.set_updated_at();
    end if;
end;
$$;

insert into public.courses (
    id,
    title,
    description,
    difficulty_level,
    instrument_type
)
values
    (
        '11111111-1111-4111-8111-111111111111',
        'Guitar Foundations Studio',
        'A polished beginner path for chords, time, and melodic confidence with media-backed premium lessons.',
        'Beginner',
        'Guitar'
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'Piano Foundations Studio',
        'A modern piano starter track covering shape, pulse, harmony, and expressive phrasing.',
        'Beginner',
        'Piano'
    ),
    (
        '33333333-3333-4333-8333-333333333333',
        'Drum Foundations Studio',
        'A premium drum lane focused on motion, pocket, and musical fills.',
        'Beginner',
        'Drums'
    )
on conflict (id) do update
set
    title = excluded.title,
    description = excluded.description,
    difficulty_level = excluded.difficulty_level,
    instrument_type = excluded.instrument_type;

insert into public.lessons (
    id,
    course_id,
    title,
    content,
    content_json,
    order_index,
    xp_reward,
    image_url,
    video_url,
    difficulty
)
values
    (
        '44444444-4444-4444-8444-444444444441',
        '11111111-1111-4111-8111-111111111111',
        'Beginner Chords Bootcamp',
        jsonb_build_object(
            'summary', 'Lock in a relaxed left-hand setup, fast chord changes, and a clean first strum pattern.',
            'duration_min', 18,
            'focus_tags', jsonb_build_array('open chords', 'fretting', 'strumming'),
            'steps', jsonb_build_array(
                'Warm up with fingertip placement and thumb position so every finger lands with a rounded shape.',
                'Build E minor and G major slowly, aiming for full-string ring and zero buzzing.',
                'Practice the chord change in two-beat loops without the strumming hand moving yet.',
                'Add a down-down-up-up-down-up groove and keep the right hand moving like a pendulum.',
                'Finish with a one-minute musical loop that prioritizes timing over speed.'
            )
        ),
        jsonb_build_object(
            'summary', 'Lock in a relaxed left-hand setup, fast chord changes, and a clean first strum pattern.',
            'duration_min', 18,
            'focus_tags', jsonb_build_array('open chords', 'fretting', 'strumming'),
            'steps', jsonb_build_array(
                'Warm up with fingertip placement and thumb position so every finger lands with a rounded shape.',
                'Build E minor and G major slowly, aiming for full-string ring and zero buzzing.',
                'Practice the chord change in two-beat loops without the strumming hand moving yet.',
                'Add a down-down-up-up-down-up groove and keep the right hand moving like a pendulum.',
                'Finish with a one-minute musical loop that prioritizes timing over speed.'
            ),
            'tips', jsonb_build_array(
                'Keep your thumb behind the neck rather than wrapped over the top.',
                'If a note buzzes, move that fingertip closer to the fret instead of pressing harder.',
                'Let the strumming hand swing continuously so the groove stays stable through the change.'
            ),
            'checkpoints', jsonb_build_array(
                'Can you hear every string that should ring in E minor?',
                'Can you switch from E minor to G major without stopping your strumming arm?',
                'Can you keep the groove steady for sixty seconds?'
            ),
            'practice_prompt', 'Play four bars of E minor and four bars of G major with a soft, even down-up motion.',
            'coach_note', 'Clean, calm motion always beats aggressive squeezing in early chord work.'
        ),
        1,
        80,
        'guitar_foundations_thumb',
        'guitar_foundations_video',
        'Beginner'
    ),
    (
        '44444444-4444-4444-8444-444444444442',
        '11111111-1111-4111-8111-111111111111',
        'Rhythm Timing Lock-In',
        jsonb_build_object(
            'summary', 'Build dependable rhythm by matching muted strums to a counted pulse and accent map.',
            'duration_min', 20,
            'focus_tags', jsonb_build_array('timing', 'muted strums', 'groove'),
            'steps', jsonb_build_array(
                'Mute the strings with your fretting hand and strum eighth notes along with a counted 1-and-2-and pulse.',
                'Accent beats two and four until the groove starts to feel like a backbeat.',
                'Move between quiet ghost strokes and louder accents without changing tempo.',
                'Transfer the same pulse to A minor and C major while keeping your right hand identical.',
                'End with a ninety-second groove challenge that favors consistency over complexity.'
            )
        ),
        jsonb_build_object(
            'summary', 'Build dependable rhythm by matching muted strums to a counted pulse and accent map.',
            'duration_min', 20,
            'focus_tags', jsonb_build_array('timing', 'muted strums', 'groove'),
            'steps', jsonb_build_array(
                'Mute the strings with your fretting hand and strum eighth notes along with a counted 1-and-2-and pulse.',
                'Accent beats two and four until the groove starts to feel like a backbeat.',
                'Move between quiet ghost strokes and louder accents without changing tempo.',
                'Transfer the same pulse to A minor and C major while keeping your right hand identical.',
                'End with a ninety-second groove challenge that favors consistency over complexity.'
            ),
            'tips', jsonb_build_array(
                'Count out loud at first so your hand learns the grid instead of guessing.',
                'Muted strums reveal timing mistakes faster than full chords because the attack is very clear.',
                'Think of accents as weight, not speed. A stronger stroke should still land inside the same pulse.'
            ),
            'checkpoints', jsonb_build_array(
                'Are the quiet and loud strums sharing the same tempo?',
                'Do beats two and four feel stronger without sounding rushed?',
                'Can you keep the pattern moving when you change chords?'
            ),
            'practice_prompt', 'Loop eight bars of muted eighth notes and place clear accents on two and four.',
            'coach_note', 'The best beginner rhythm playing feels predictable, repeatable, and easy to follow.'
        ),
        2,
        90,
        'guitar_rhythm_thumb',
        'guitar_rhythm_video',
        'Beginner'
    ),
    (
        '44444444-4444-4444-8444-444444444443',
        '11111111-1111-4111-8111-111111111111',
        'Lead Guitar First Phrases',
        jsonb_build_object(
            'summary', 'Use one small scale shape to create musical two-bar phrases with intentional space.',
            'duration_min', 22,
            'focus_tags', jsonb_build_array('lead guitar', 'phrasing', 'expression'),
            'steps', jsonb_build_array(
                'Map the first-position A minor pentatonic notes with slow alternate picking.',
                'Choose three notes and play them as a question phrase, then leave a full beat of silence.',
                'Answer with a different three-note phrase that starts on a new string.',
                'Add one bend or slide only after the note locations are secure.',
                'Record a short call-and-response solo and listen for phrasing rather than speed.'
            )
        ),
        jsonb_build_object(
            'summary', 'Use one small scale shape to create musical two-bar phrases with intentional space.',
            'duration_min', 22,
            'focus_tags', jsonb_build_array('lead guitar', 'phrasing', 'expression'),
            'steps', jsonb_build_array(
                'Map the first-position A minor pentatonic notes with slow alternate picking.',
                'Choose three notes and play them as a question phrase, then leave a full beat of silence.',
                'Answer with a different three-note phrase that starts on a new string.',
                'Add one bend or slide only after the note locations are secure.',
                'Record a short call-and-response solo and listen for phrasing rather than speed.'
            ),
            'tips', jsonb_build_array(
                'Space is part of the phrase. Silence makes the next note feel deliberate.',
                'Pick lightly and evenly so the melodic shape stays smooth.',
                'Treat bends as expressive punctuation, not decoration on every note.'
            ),
            'checkpoints', jsonb_build_array(
                'Can you name the three strings used in your phrase?',
                'Does the answer phrase feel different from the question phrase?',
                'Do your notes stay in tune when you slide or bend?'
            ),
            'practice_prompt', 'Create four two-bar phrases in A minor pentatonic with at least one full beat of silence in each.',
            'coach_note', 'Strong lead playing sounds sung, not sprayed across the fretboard.'
        ),
        3,
        100,
        'guitar_expression_thumb',
        'guitar_expression_video',
        'Beginner'
    ),
    (
        '55555555-5555-4555-8555-555555555551',
        '22222222-2222-4222-8222-222222222222',
        'Keyboard Foundations Flow',
        jsonb_build_object(
            'summary', 'Set up hand shape, wrist balance, and simple triads so the keyboard feels organized immediately.',
            'duration_min', 18,
            'focus_tags', jsonb_build_array('hand shape', 'triads', 'posture'),
            'steps', jsonb_build_array(
                'Sit tall, float the wrists, and find a natural curved hand over middle C.',
                'Play C major broken chord patterns slowly with finger numbers spoken out loud.',
                'Add G major and F major, noticing how the thumb tucks under smoothly.',
                'Alternate between blocked triads and broken triads without lifting the wrists high.',
                'Close with a calm four-chord loop that rewards even tone.'
            )
        ),
        jsonb_build_object(
            'summary', 'Set up hand shape, wrist balance, and simple triads so the keyboard feels organized immediately.',
            'duration_min', 18,
            'focus_tags', jsonb_build_array('hand shape', 'triads', 'posture'),
            'steps', jsonb_build_array(
                'Sit tall, float the wrists, and find a natural curved hand over middle C.',
                'Play C major broken chord patterns slowly with finger numbers spoken out loud.',
                'Add G major and F major, noticing how the thumb tucks under smoothly.',
                'Alternate between blocked triads and broken triads without lifting the wrists high.',
                'Close with a calm four-chord loop that rewards even tone.'
            ),
            'tips', jsonb_build_array(
                'Let the finger pads rest on the keys instead of flattening the entire hand.',
                'A relaxed wrist makes thumb crossings smoother and quieter.',
                'Aim for equal volume across the triad rather than a heavy thumb.'
            ),
            'checkpoints', jsonb_build_array(
                'Can you keep all five fingers curved while playing slowly?',
                'Does the thumb move under without a sudden wrist drop?',
                'Do the triads sound balanced instead of bottom-heavy?'
            ),
            'practice_prompt', 'Play C, G, Am, and F as blocked chords, then repeat them as broken chords.',
            'coach_note', 'Elegant piano movement looks small and feels loose.'
        ),
        1,
        80,
        'piano_foundations_thumb',
        'piano_foundations_video',
        'Beginner'
    ),
    (
        '55555555-5555-4555-8555-555555555552',
        '22222222-2222-4222-8222-222222222222',
        'Rhythm Grid and Left-Hand Pulse',
        jsonb_build_object(
            'summary', 'Connect left-hand pulse and right-hand harmony so beginner accompaniment feels stable and musical.',
            'duration_min', 20,
            'focus_tags', jsonb_build_array('left hand', 'pulse', 'harmony'),
            'steps', jsonb_build_array(
                'Tap quarter notes with the left hand on low C while the right hand holds a C major chord.',
                'Switch the left hand to octave pulses and keep the right hand sustained.',
                'Move the progression to G, Am, and F while the left hand preserves the same quarter-note engine.',
                'Shorten the right-hand chords into half-note changes so both hands start working independently.',
                'Perform the loop for one minute with the metronome and no stopping.'
            )
        ),
        jsonb_build_object(
            'summary', 'Connect left-hand pulse and right-hand harmony so beginner accompaniment feels stable and musical.',
            'duration_min', 20,
            'focus_tags', jsonb_build_array('left hand', 'pulse', 'harmony'),
            'steps', jsonb_build_array(
                'Tap quarter notes with the left hand on low C while the right hand holds a C major chord.',
                'Switch the left hand to octave pulses and keep the right hand sustained.',
                'Move the progression to G, Am, and F while the left hand preserves the same quarter-note engine.',
                'Shorten the right-hand chords into half-note changes so both hands start working independently.',
                'Perform the loop for one minute with the metronome and no stopping.'
            ),
            'tips', jsonb_build_array(
                'Think of the left hand as the drummer and the right hand as the color layer.',
                'If the hands drift apart, simplify the right hand first and keep the pulse alive.',
                'Use a light wrist bounce to avoid tension during repeated quarter notes.'
            ),
            'checkpoints', jsonb_build_array(
                'Is the left-hand pulse consistent from the first bar to the last?',
                'Can the right hand change chords without interrupting the beat?',
                'Do the octave jumps land accurately without rushing?'
            ),
            'practice_prompt', 'Play a C-G-Am-F loop with steady quarter-note left hand and half-note right-hand chords.',
            'coach_note', 'Reliable accompaniment feels like a conveyor belt: calm, even, and unbroken.'
        ),
        2,
        90,
        'piano_rhythm_thumb',
        'piano_rhythm_video',
        'Beginner'
    ),
    (
        '55555555-5555-4555-8555-555555555553',
        '22222222-2222-4222-8222-222222222222',
        'Melody Shape and Expression',
        jsonb_build_object(
            'summary', 'Shape beginner melodies with touch, phrase endings, and simple dynamic contrast.',
            'duration_min', 22,
            'focus_tags', jsonb_build_array('melody', 'dynamics', 'phrasing'),
            'steps', jsonb_build_array(
                'Play a five-note C major melody with identical tempo but two different volume levels.',
                'Mark the highest note of the phrase and let it sing slightly more than the surrounding notes.',
                'Use a gentle lift at the end of each phrase instead of cutting the note abruptly.',
                'Repeat the melody legato, then staccato, to hear how articulation changes the mood.',
                'End by recording two expressive versions and choosing which phrasing sounds more intentional.'
            )
        ),
        jsonb_build_object(
            'summary', 'Shape beginner melodies with touch, phrase endings, and simple dynamic contrast.',
            'duration_min', 22,
            'focus_tags', jsonb_build_array('melody', 'dynamics', 'phrasing'),
            'steps', jsonb_build_array(
                'Play a five-note C major melody with identical tempo but two different volume levels.',
                'Mark the highest note of the phrase and let it sing slightly more than the surrounding notes.',
                'Use a gentle lift at the end of each phrase instead of cutting the note abruptly.',
                'Repeat the melody legato, then staccato, to hear how articulation changes the mood.',
                'End by recording two expressive versions and choosing which phrasing sounds more intentional.'
            ),
            'tips', jsonb_build_array(
                'Imagine a singer taking a breath at the end of each line.',
                'A small change in touch often sounds more musical than an extreme volume jump.',
                'Keep the fingertips active even during soft playing so the melody does not disappear.'
            ),
            'checkpoints', jsonb_build_array(
                'Can you hear one clear high point in the phrase?',
                'Do the phrase endings feel relaxed instead of chopped off?',
                'Can you switch between legato and staccato on command?'
            ),
            'practice_prompt', 'Play one short melody twice: once gentle and legato, once brighter and detached.',
            'coach_note', 'Musical shape matters as much as the right notes.'
        ),
        3,
        100,
        'piano_expression_thumb',
        'piano_expression_video',
        'Beginner'
    ),
    (
        '66666666-6666-4666-8666-666666666661',
        '33333333-3333-4333-8333-333333333333',
        'Stick Control Essentials',
        jsonb_build_object(
            'summary', 'Build efficient grip, rebound, and single-stroke control that keeps the hands relaxed.',
            'duration_min', 18,
            'focus_tags', jsonb_build_array('grip', 'rebound', 'single strokes'),
            'steps', jsonb_build_array(
                'Set a relaxed matched grip and let the stick rebound naturally from the pad.',
                'Alternate right and left single strokes at a slow quarter-note tempo.',
                'Increase to eighth notes without tightening the shoulders or forearms.',
                'Add simple accent patterns every fourth stroke while the other notes remain soft.',
                'Finish with a sixty-second single-stroke endurance round at a comfortable speed.'
            )
        ),
        jsonb_build_object(
            'summary', 'Build efficient grip, rebound, and single-stroke control that keeps the hands relaxed.',
            'duration_min', 18,
            'focus_tags', jsonb_build_array('grip', 'rebound', 'single strokes'),
            'steps', jsonb_build_array(
                'Set a relaxed matched grip and let the stick rebound naturally from the pad.',
                'Alternate right and left single strokes at a slow quarter-note tempo.',
                'Increase to eighth notes without tightening the shoulders or forearms.',
                'Add simple accent patterns every fourth stroke while the other notes remain soft.',
                'Finish with a sixty-second single-stroke endurance round at a comfortable speed.'
            ),
            'tips', jsonb_build_array(
                'The back fingers guide the rebound; they do not clamp the stick.',
                'Stay low to the surface for the soft notes so the accents have somewhere to grow.',
                'Check your shoulders often. Excess tension usually starts above the hands.'
            ),
            'checkpoints', jsonb_build_array(
                'Does each hand produce a similar sound and height?',
                'Can the stick rebound without you lifting it manually every time?',
                'Do the accents pop without making the groove feel unstable?'
            ),
            'practice_prompt', 'Play alternating single strokes for one minute and accent every fourth note.',
            'coach_note', 'Great drumming feels spring-loaded rather than forced.'
        ),
        1,
        80,
        'drums_foundations_thumb',
        'drums_foundations_video',
        'Beginner'
    ),
    (
        '66666666-6666-4666-8666-666666666662',
        '33333333-3333-4333-8333-333333333333',
        'Pocket Timing Lab',
        jsonb_build_object(
            'summary', 'Lock kick, snare, and hi-hat into a clear beginner groove that feels steady and centered.',
            'duration_min', 20,
            'focus_tags', jsonb_build_array('groove', 'backbeat', 'time'),
            'steps', jsonb_build_array(
                'Play eighth notes on the hi-hat until the motion feels automatic.',
                'Place the snare on beats two and four without changing the hi-hat width.',
                'Add kick drum on beats one and three to build the core rock groove.',
                'Record four bars and check whether the snare lands late, early, or centered.',
                'Repeat the groove with a quieter hi-hat so the backbeat stays dominant.'
            )
        ),
        jsonb_build_object(
            'summary', 'Lock kick, snare, and hi-hat into a clear beginner groove that feels steady and centered.',
            'duration_min', 20,
            'focus_tags', jsonb_build_array('groove', 'backbeat', 'time'),
            'steps', jsonb_build_array(
                'Play eighth notes on the hi-hat until the motion feels automatic.',
                'Place the snare on beats two and four without changing the hi-hat width.',
                'Add kick drum on beats one and three to build the core rock groove.',
                'Record four bars and check whether the snare lands late, early, or centered.',
                'Repeat the groove with a quieter hi-hat so the backbeat stays dominant.'
            ),
            'tips', jsonb_build_array(
                'The hi-hat is the glue. Keep it even while the other limbs join in.',
                'Strong backbeats sound deliberate, not slammed.',
                'Recording a short loop is the fastest way to notice drift in beginner grooves.'
            ),
            'checkpoints', jsonb_build_array(
                'Are the hi-hat notes even from bar to bar?',
                'Does the snare clearly anchor beats two and four?',
                'Can you keep the groove steady while playing slightly softer overall?'
            ),
            'practice_prompt', 'Play an eight-bar rock groove with hi-hat eighth notes, kick on one and three, snare on two and four.',
            'coach_note', 'Pocket comes from repetition and consistency before it comes from speed.'
        ),
        2,
        90,
        'drums_rhythm_thumb',
        'drums_rhythm_video',
        'Beginner'
    ),
    (
        '66666666-6666-4666-8666-666666666663',
        '33333333-3333-4333-8333-333333333333',
        'Musical Fill Architecture',
        jsonb_build_object(
            'summary', 'Build short fills that connect sections cleanly without losing the groove underneath.',
            'duration_min', 22,
            'focus_tags', jsonb_build_array('fills', 'transitions', 'phrasing'),
            'steps', jsonb_build_array(
                'Keep the main groove running for three bars so the pocket is established first.',
                'Use only two drums for the fill, starting on beat four of bar four.',
                'Return to the crash or hi-hat on the next downbeat immediately after the fill.',
                'Experiment with one fill that rises in pitch and one that falls in pitch.',
                'Record a full sixteen-bar take and listen for whether the transition feels connected.'
            )
        ),
        jsonb_build_object(
            'summary', 'Build short fills that connect sections cleanly without losing the groove underneath.',
            'duration_min', 22,
            'focus_tags', jsonb_build_array('fills', 'transitions', 'phrasing'),
            'steps', jsonb_build_array(
                'Keep the main groove running for three bars so the pocket is established first.',
                'Use only two drums for the fill, starting on beat four of bar four.',
                'Return to the crash or hi-hat on the next downbeat immediately after the fill.',
                'Experiment with one fill that rises in pitch and one that falls in pitch.',
                'Record a full sixteen-bar take and listen for whether the transition feels connected.'
            ),
            'tips', jsonb_build_array(
                'A fill should point back to the groove, not distract from it.',
                'Short fills are easier to land cleanly than busy fills.',
                'Count the downbeat you are returning to before you start the fill.'
            ),
            'checkpoints', jsonb_build_array(
                'Do you re-enter the groove on beat one cleanly every time?',
                'Can you hear a clear start and end to the fill phrase?',
                'Does the fill serve the section change instead of sounding random?'
            ),
            'practice_prompt', 'Play three bars of groove and one bar with a short fill starting on beat four.',
            'coach_note', 'The best fills sound inevitable because the groove already set them up.'
        ),
        3,
        100,
        'drums_expression_thumb',
        'drums_expression_video',
        'Beginner'
    )
on conflict (id) do update
set
    course_id = excluded.course_id,
    title = excluded.title,
    content = excluded.content,
    content_json = excluded.content_json,
    order_index = excluded.order_index,
    xp_reward = excluded.xp_reward,
    image_url = excluded.image_url,
    video_url = excluded.video_url,
    difficulty = excluded.difficulty;

insert into public.quizzes (
    id,
    lesson_id,
    question,
    options,
    correct_option_index,
    explanation
)
values
    (
        '77777777-7777-4777-8777-777777777771',
        '44444444-4444-4444-8444-444444444441',
        'What usually fixes a buzzing note in an open chord fastest?',
        jsonb_build_array(
            'Move the fingertip closer to the fret and keep it curved',
            'Press the string as hard as possible',
            'Mute the string with a flat finger',
            'Strum louder'
        ),
        0,
        'Closer fret placement with a curved fingertip usually clears the note without adding excess tension.'
    ),
    (
        '77777777-7777-4777-8777-777777777772',
        '44444444-4444-4444-8444-444444444441',
        'Why should the strumming hand keep moving during a chord change?',
        jsonb_build_array(
            'It keeps the groove stable and predictable',
            'It makes the chords louder',
            'It replaces the need for accurate fretting',
            'It shortens the guitar neck'
        ),
        0,
        'Continuous motion helps rhythm stay intact even while the fretting hand is changing shape.'
    ),
    (
        '77777777-7777-4777-8777-777777777773',
        '44444444-4444-4444-8444-444444444442',
        'Muted strums are especially useful for rhythm training because they:',
        jsonb_build_array(
            'Reveal timing clearly without chord distractions',
            'Make every groove sound finished immediately',
            'Remove the need for counting',
            'Only work on electric guitar'
        ),
        0,
        'Muted attacks make the exact placement of each stroke easy to hear.'
    ),
    (
        '77777777-7777-4777-8777-777777777774',
        '44444444-4444-4444-8444-444444444442',
        'What is the role of accents in this lesson?',
        jsonb_build_array(
            'They add weight to chosen beats without changing tempo',
            'They make the groove automatically faster',
            'They replace the need for quiet strums',
            'They should appear on every note equally'
        ),
        0,
        'A strong accent changes emphasis, not the speed of the pulse.'
    ),
    (
        '77777777-7777-4777-8777-777777777775',
        '44444444-4444-4444-8444-444444444443',
        'Why is silence important in a beginner lead phrase?',
        jsonb_build_array(
            'It gives the phrase shape and makes the next note feel intentional',
            'It hides wrong notes from the listener',
            'It makes the scale longer',
            'It replaces bending technique'
        ),
        0,
        'Space creates contrast and makes a simple phrase feel musical instead of rushed.'
    ),
    (
        '77777777-7777-4777-8777-777777777776',
        '44444444-4444-4444-8444-444444444443',
        'When should bends or slides be added in this lesson?',
        jsonb_build_array(
            'After the note locations and rhythm feel secure',
            'Before learning the scale shape',
            'Only on the very first note',
            'Instead of all picked notes'
        ),
        0,
        'Expression works best after the base phrase is already accurate.'
    ),
    (
        '88888888-8888-4888-8888-888888888881',
        '55555555-5555-4555-8555-555555555551',
        'A healthy beginner piano hand shape is usually:',
        jsonb_build_array(
            'Curved, relaxed, and balanced over the keys',
            'Flat with locked knuckles',
            'Lifted high above every note',
            'Driven mostly by shoulder motion'
        ),
        0,
        'Curved fingers and a relaxed wrist create control without tension.'
    ),
    (
        '88888888-8888-4888-8888-888888888882',
        '55555555-5555-4555-8555-555555555551',
        'What is the main goal of alternating blocked and broken triads here?',
        jsonb_build_array(
            'To make the hand shape and chord awareness feel flexible',
            'To avoid playing with finger numbers',
            'To practice only the left hand',
            'To make all notes louder'
        ),
        0,
        'Switching textures helps beginners understand the same harmony in multiple playable forms.'
    ),
    (
        '88888888-8888-4888-8888-888888888883',
        '55555555-5555-4555-8555-555555555552',
        'In this lesson, the left hand acts mostly like the:',
        jsonb_build_array(
            'Pulse engine that holds the groove steady',
            'Decorative melody voice',
            'Pedal replacement',
            'Only hand that matters'
        ),
        0,
        'The left hand supplies the reliable rhythmic foundation.'
    ),
    (
        '88888888-8888-4888-8888-888888888884',
        '55555555-5555-4555-8555-555555555552',
        'If the hands drift apart, what should you simplify first?',
        jsonb_build_array(
            'The right-hand harmony layer while keeping the pulse alive',
            'The metronome',
            'The left-hand quarter notes',
            'The bench height'
        ),
        0,
        'Protecting the rhythmic engine makes it easier to rebuild independence.'
    ),
    (
        '88888888-8888-4888-8888-888888888885',
        '55555555-5555-4555-8555-555555555553',
        'What gives a melody a clear high point?',
        jsonb_build_array(
            'Letting one note sing slightly more than the surrounding notes',
            'Playing every note at maximum volume',
            'Removing all phrase endings',
            'Using only staccato touch'
        ),
        0,
        'A shaped phrase usually has one note that feels more important than the rest.'
    ),
    (
        '88888888-8888-4888-8888-888888888886',
        '55555555-5555-4555-8555-555555555553',
        'What does comparing legato and staccato versions teach?',
        jsonb_build_array(
            'How articulation changes the emotional feel of the melody',
            'How to avoid dynamics entirely',
            'How to play only with the pedal',
            'How to remove phrasing'
        ),
        0,
        'Different articulation choices create very different musical character.'
    ),
    (
        '99999999-9999-4999-8999-999999999991',
        '66666666-6666-4666-8666-666666666661',
        'A relaxed matched grip helps because it:',
        jsonb_build_array(
            'Allows rebound and reduces unnecessary tension',
            'Makes every stroke an accent',
            'Removes the need for practice',
            'Works only at fast tempos'
        ),
        0,
        'Efficient grip supports control while still letting the stick move naturally.'
    ),
    (
        '99999999-9999-4999-8999-999999999992',
        '66666666-6666-4666-8666-666666666661',
        'What is the purpose of accenting every fourth stroke?',
        jsonb_build_array(
            'To control contrast while keeping the hand motion organized',
            'To replace single strokes with fills',
            'To stop rebound from happening',
            'To play louder all the time'
        ),
        0,
        'Accent placement trains dynamic control without abandoning the core sticking pattern.'
    ),
    (
        '99999999-9999-4999-8999-999999999993',
        '66666666-6666-4666-8666-666666666662',
        'Why is the hi-hat called the glue in this lesson?',
        jsonb_build_array(
            'It keeps the time grid connected while the other limbs join the groove',
            'It should always be the loudest sound',
            'It replaces kick and snare',
            'It is only used in fills'
        ),
        0,
        'Even hi-hat motion helps the groove stay centered as the full pattern is built.'
    ),
    (
        '99999999-9999-4999-8999-999999999994',
        '66666666-6666-4666-8666-666666666662',
        'What defines the beginner backbeat groove here?',
        jsonb_build_array(
            'Snare on two and four with a steady supporting pulse',
            'Snare on every beat equally',
            'No hi-hat notes',
            'Kick only on beat four'
        ),
        0,
        'A clear backbeat centers the groove around beats two and four.'
    ),
    (
        '99999999-9999-4999-8999-999999999995',
        '66666666-6666-4666-8666-666666666663',
        'What should a short fill mainly do?',
        jsonb_build_array(
            'Guide the listener back into the groove cleanly',
            'Replace the groove completely',
            'Use every drum every time',
            'Ignore the next downbeat'
        ),
        0,
        'A useful fill supports the transition and lands confidently back on beat one.'
    ),
    (
        '99999999-9999-4999-8999-999999999996',
        '66666666-6666-4666-8666-666666666663',
        'Why start with only two drums in a fill exercise?',
        jsonb_build_array(
            'It keeps the phrase controlled and easier to land in time',
            'It makes the fill automatically louder',
            'It removes the need for counting',
            'It is the only valid kind of fill'
        ),
        0,
        'Fewer moving parts help beginners focus on timing, shape, and re-entry.'
    )
on conflict (id) do update
set
    lesson_id = excluded.lesson_id,
    question = excluded.question,
    options = excluded.options,
    correct_option_index = excluded.correct_option_index,
    explanation = excluded.explanation;

commit;
