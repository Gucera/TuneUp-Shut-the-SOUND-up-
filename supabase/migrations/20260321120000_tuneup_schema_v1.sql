create extension if not exists pgcrypto with schema extensions;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create function public.sync_user_level_from_xp()
returns trigger
language plpgsql
as $$
begin
    new.total_xp = coalesce(new.total_xp, 0);
    new.current_level = (new.total_xp / 100) + 1;
    return new;
end;
$$;

create function public.recalculate_user_streaks(p_user_id uuid)
returns void
language plpgsql
as $$
declare
    v_timezone text := 'UTC';
begin
    select
        coalesce(
            case
                when u.preferences ? 'timezone'
                    and exists (
                        select 1
                        from pg_timezone_names tz
                        where tz.name = u.preferences ->> 'timezone'
                    )
                then u.preferences ->> 'timezone'
                else null
            end,
            'UTC'
        )
    into v_timezone
    from public.users u
    where u.id = p_user_id;

    if not found then
        return;
    end if;

    with distinct_days as (
        select distinct (ps.created_at at time zone v_timezone)::date as local_day
        from public.practice_sessions ps
        where ps.user_id = p_user_id
    ),
    ordered_days as (
        select
            local_day,
            row_number() over (order by local_day) as rn
        from distinct_days
    ),
    streak_groups as (
        select
            local_day,
            local_day - (rn::integer) as streak_group
        from ordered_days
    ),
    streaks as (
        select
            min(local_day) as start_day,
            max(local_day) as end_day,
            count(*)::integer as streak_length
        from streak_groups
        group by streak_group
    ),
    streak_summary as (
        select
            coalesce(max(streak_length), 0) as longest_streak,
            coalesce(
                (
                    select s.streak_length
                    from streaks s
                    order by s.end_day desc
                    limit 1
                ),
                0
            ) as current_streak
        from streaks
    )
    update public.users u
    set
        current_streak = streak_summary.current_streak,
        longest_streak = streak_summary.longest_streak
    from streak_summary
    where u.id = p_user_id;
end;
$$;

create function public.refresh_user_streaks()
returns trigger
language plpgsql
as $$
begin
    if tg_table_name = 'users' then
        perform public.recalculate_user_streaks(new.id);
        return new;
    end if;

    if tg_op = 'DELETE' then
        perform public.recalculate_user_streaks(old.user_id);
        return old;
    end if;

    if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
        perform public.recalculate_user_streaks(old.user_id);
    end if;

    perform public.recalculate_user_streaks(new.user_id);
    return new;
end;
$$;

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_preferences jsonb := '{}'::jsonb;
begin
    if jsonb_typeof(new.raw_user_meta_data -> 'preferences') = 'object' then
        v_preferences = new.raw_user_meta_data -> 'preferences';
    end if;

    insert into public.users (
        id,
        username,
        avatar_url,
        preferences
    )
    values (
        new.id,
        nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
        v_preferences
    );

    return new;
end;
$$;

create table public.users (
    id uuid primary key references auth.users (id) on delete cascade,
    username text unique,
    avatar_url text,
    total_xp integer not null default 0,
    current_level integer not null default 1,
    current_streak integer not null default 0,
    longest_streak integer not null default 0,
    preferences jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint users_username_not_blank check (username is null or btrim(username) <> ''),
    constraint users_total_xp_non_negative check (total_xp >= 0),
    constraint users_current_level_positive check (current_level >= 1),
    constraint users_current_streak_non_negative check (current_streak >= 0),
    constraint users_longest_streak_non_negative check (longest_streak >= 0),
    constraint users_current_streak_lte_longest check (current_streak <= longest_streak),
    constraint users_preferences_is_object check (jsonb_typeof(preferences) = 'object')
);

create table public.achievements (
    id text primary key,
    title text not null,
    description text not null,
    icon_url text,
    required_xp_or_action jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint achievements_id_not_blank check (btrim(id) <> ''),
    constraint achievements_title_not_blank check (btrim(title) <> ''),
    constraint achievements_description_not_blank check (btrim(description) <> ''),
    constraint achievements_rule_is_object check (jsonb_typeof(required_xp_or_action) = 'object')
);

create table public.courses (
    id text primary key,
    title text not null,
    description text,
    difficulty_level text not null,
    instrument_type text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint courses_id_not_blank check (btrim(id) <> ''),
    constraint courses_title_not_blank check (btrim(title) <> ''),
    constraint courses_difficulty_level_valid check (
        difficulty_level in ('Beginner', 'Early Intermediate', 'Intermediate', 'Upper Intermediate')
    ),
    constraint courses_instrument_type_valid check (
        instrument_type in ('Guitar', 'Piano', 'Drums')
    )
);

create table public.lessons (
    id text primary key,
    course_id text not null references public.courses (id) on delete cascade,
    title text not null,
    content jsonb not null default '{}'::jsonb,
    order_index integer not null,
    xp_reward integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint lessons_id_not_blank check (btrim(id) <> ''),
    constraint lessons_title_not_blank check (btrim(title) <> ''),
    constraint lessons_order_index_non_negative check (order_index >= 0),
    constraint lessons_xp_reward_non_negative check (xp_reward >= 0),
    constraint lessons_content_valid check (jsonb_typeof(content) in ('object', 'array')),
    constraint lessons_course_order_unique unique (course_id, order_index)
);

create table public.song_lessons (
    id text primary key,
    owner_user_id uuid references public.users (id) on delete cascade,
    title text not null,
    artist text not null,
    difficulty_level text not null,
    backing_track_url text,
    duration_seconds double precision not null,
    chord_events jsonb not null default '[]'::jsonb,
    tab_notes jsonb not null default '[]'::jsonb,
    is_imported boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint song_lessons_id_not_blank check (btrim(id) <> ''),
    constraint song_lessons_title_not_blank check (btrim(title) <> ''),
    constraint song_lessons_artist_not_blank check (btrim(artist) <> ''),
    constraint song_lessons_difficulty_valid check (
        difficulty_level in ('Easy', 'Medium', 'Hard')
    ),
    constraint song_lessons_duration_non_negative check (duration_seconds >= 0),
    constraint song_lessons_chord_events_is_array check (jsonb_typeof(chord_events) = 'array'),
    constraint song_lessons_tab_notes_is_array check (jsonb_typeof(tab_notes) = 'array')
);

create table public.theory_activities (
    id text primary key,
    activity_kind text not null,
    title text not null,
    difficulty_level text,
    xp_reward integer not null default 0,
    content jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint theory_activities_id_not_blank check (btrim(id) <> ''),
    constraint theory_activities_kind_valid check (
        activity_kind in ('quiz', 'puzzle', 'audio-quiz', 'quick-note')
    ),
    constraint theory_activities_title_not_blank check (btrim(title) <> ''),
    constraint theory_activities_difficulty_valid check (
        difficulty_level is null or difficulty_level in ('easy', 'medium', 'hard')
    ),
    constraint theory_activities_xp_reward_non_negative check (xp_reward >= 0),
    constraint theory_activities_content_valid check (jsonb_typeof(content) in ('object', 'array'))
);

create table public.user_achievements (
    id uuid primary key default extensions.gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    achievement_id text not null references public.achievements (id) on delete cascade,
    unlocked_at timestamptz not null default now(),
    constraint user_achievements_user_achievement_unique unique (user_id, achievement_id)
);

create table public.user_lesson_progress (
    id uuid primary key default extensions.gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    lesson_id text not null references public.lessons (id) on delete cascade,
    status text not null default 'started',
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_lesson_progress_status_valid check (status in ('started', 'completed')),
    constraint user_lesson_progress_completion_consistent check (
        (status = 'started' and completed_at is null)
        or (status = 'completed' and completed_at is not null)
    ),
    constraint user_lesson_progress_user_lesson_unique unique (user_id, lesson_id)
);

create table public.user_song_progress (
    id uuid primary key default extensions.gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    song_lesson_id text not null references public.song_lessons (id) on delete cascade,
    status text not null default 'started',
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_song_progress_status_valid check (status in ('started', 'completed')),
    constraint user_song_progress_completion_consistent check (
        (status = 'started' and completed_at is null)
        or (status = 'completed' and completed_at is not null)
    ),
    constraint user_song_progress_user_song_unique unique (user_id, song_lesson_id)
);

create table public.user_theory_activity_progress (
    id uuid primary key default extensions.gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    theory_activity_id text not null references public.theory_activities (id) on delete cascade,
    status text not null default 'started',
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_theory_activity_progress_status_valid check (status in ('started', 'completed')),
    constraint user_theory_activity_progress_completion_consistent check (
        (status = 'started' and completed_at is null)
        or (status = 'completed' and completed_at is not null)
    ),
    constraint user_theory_progress_user_activity_unique unique (user_id, theory_activity_id)
);

create table public.practice_sessions (
    id uuid primary key default extensions.gen_random_uuid(),
    user_id uuid not null references public.users (id) on delete cascade,
    session_type text not null,
    duration_minutes integer not null default 0,
    created_at timestamptz not null default now(),
    constraint practice_sessions_session_type_valid check (
        session_type in (
            'tuning',
            'metronome',
            'general',
            'lesson',
            'song',
            'quiz',
            'puzzle',
            'audio-quiz',
            'quick-note'
        )
    ),
    constraint practice_sessions_duration_non_negative check (duration_minutes >= 0)
);

create table public.tracks (
    id uuid primary key default extensions.gen_random_uuid(),
    user_id uuid references public.users (id) on delete cascade,
    title text not null,
    original_filename text,
    audio_url text,
    duration_seconds double precision not null default 0,
    bpm numeric(6, 2),
    key text,
    track_source text not null default 'uploaded',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tracks_title_not_blank check (btrim(title) <> ''),
    constraint tracks_duration_non_negative check (duration_seconds >= 0),
    constraint tracks_bpm_non_negative check (bpm is null or bpm >= 0),
    constraint tracks_source_valid check (
        track_source in ('uploaded', 'saved-traffic', 'preset')
    )
);

create table public.track_markers (
    id uuid primary key default extensions.gen_random_uuid(),
    track_id uuid not null references public.tracks (id) on delete cascade,
    source_marker_id bigint,
    label text not null,
    start_time double precision,
    end_time double precision,
    position_x double precision,
    color_hex text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint track_markers_label_not_blank check (btrim(label) <> ''),
    constraint track_markers_has_position_or_time check (
        start_time is not null or position_x is not null
    ),
    constraint track_markers_start_time_non_negative check (
        start_time is null or start_time >= 0
    ),
    constraint track_markers_end_time_non_negative check (
        end_time is null or end_time >= 0
    ),
    constraint track_markers_end_after_start check (
        end_time is null or (start_time is not null and end_time >= start_time)
    ),
    constraint track_markers_position_x_non_negative check (
        position_x is null or position_x >= 0
    ),
    constraint track_markers_color_hex_valid check (
        color_hex ~ '^#[0-9A-Fa-f]{6}$'
    )
);

create table public.ai_analysis_jobs (
    id uuid primary key default extensions.gen_random_uuid(),
    track_id uuid not null references public.tracks (id) on delete cascade,
    status text not null default 'pending',
    progress_text text,
    result_payload jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    constraint ai_analysis_jobs_status_valid check (
        status in ('pending', 'processing', 'completed', 'failed')
    ),
    constraint ai_analysis_jobs_result_payload_valid check (
        result_payload is null or jsonb_typeof(result_payload) = 'object'
    ),
    constraint ai_analysis_jobs_completion_consistent check (
        (status in ('pending', 'processing') and completed_at is null)
        or (status in ('completed', 'failed') and completed_at is not null)
    )
);

create index user_achievements_user_id_idx
    on public.user_achievements (user_id, unlocked_at desc);

create index user_achievements_achievement_id_idx
    on public.user_achievements (achievement_id);

create index lessons_course_id_idx
    on public.lessons (course_id);

create index song_lessons_owner_user_id_idx
    on public.song_lessons (owner_user_id);

create index theory_activities_kind_idx
    on public.theory_activities (activity_kind);

create index user_lesson_progress_lesson_id_idx
    on public.user_lesson_progress (lesson_id);

create index user_lesson_progress_user_status_idx
    on public.user_lesson_progress (user_id, status);

create index user_song_progress_song_lesson_id_idx
    on public.user_song_progress (song_lesson_id);

create index user_song_progress_user_status_idx
    on public.user_song_progress (user_id, status);

create index user_theory_activity_progress_activity_id_idx
    on public.user_theory_activity_progress (theory_activity_id);

create index user_theory_activity_progress_user_status_idx
    on public.user_theory_activity_progress (user_id, status);

create index practice_sessions_user_created_at_idx
    on public.practice_sessions (user_id, created_at desc);

create index practice_sessions_user_session_type_idx
    on public.practice_sessions (user_id, session_type);

create index tracks_user_created_at_idx
    on public.tracks (user_id, created_at desc);

create index tracks_source_created_at_idx
    on public.tracks (track_source, created_at desc);

create index track_markers_track_start_time_idx
    on public.track_markers (track_id, start_time);

create index track_markers_track_position_x_idx
    on public.track_markers (track_id, position_x);

create index ai_analysis_jobs_track_status_idx
    on public.ai_analysis_jobs (track_id, status);

create index ai_analysis_jobs_status_updated_at_idx
    on public.ai_analysis_jobs (status, updated_at desc);

create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

create trigger sync_users_level_from_xp
before insert or update of total_xp on public.users
for each row
execute function public.sync_user_level_from_xp();

create trigger set_achievements_updated_at
before update on public.achievements
for each row
execute function public.set_updated_at();

create trigger set_courses_updated_at
before update on public.courses
for each row
execute function public.set_updated_at();

create trigger set_lessons_updated_at
before update on public.lessons
for each row
execute function public.set_updated_at();

create trigger set_song_lessons_updated_at
before update on public.song_lessons
for each row
execute function public.set_updated_at();

create trigger set_theory_activities_updated_at
before update on public.theory_activities
for each row
execute function public.set_updated_at();

create trigger set_user_lesson_progress_updated_at
before update on public.user_lesson_progress
for each row
execute function public.set_updated_at();

create trigger set_user_song_progress_updated_at
before update on public.user_song_progress
for each row
execute function public.set_updated_at();

create trigger set_user_theory_activity_progress_updated_at
before update on public.user_theory_activity_progress
for each row
execute function public.set_updated_at();

create trigger set_tracks_updated_at
before update on public.tracks
for each row
execute function public.set_updated_at();

create trigger set_track_markers_updated_at
before update on public.track_markers
for each row
execute function public.set_updated_at();

create trigger set_ai_analysis_jobs_updated_at
before update on public.ai_analysis_jobs
for each row
execute function public.set_updated_at();

create trigger refresh_user_streaks_on_practice_sessions
after insert or update or delete on public.practice_sessions
for each row
execute function public.refresh_user_streaks();

create trigger refresh_user_streaks_on_user_timezone_change
after update of preferences on public.users
for each row
when (old.preferences is distinct from new.preferences)
execute function public.refresh_user_streaks();

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();
