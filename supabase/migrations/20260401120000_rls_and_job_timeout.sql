alter table public.ai_analysis_jobs
    drop constraint if exists ai_analysis_jobs_status_valid;

alter table public.ai_analysis_jobs
    drop constraint if exists ai_analysis_jobs_completion_consistent;

alter table public.ai_analysis_jobs
    add constraint ai_analysis_jobs_status_valid
        check (status in ('pending', 'processing', 'completed', 'failed', 'timed_out')),
    add constraint ai_analysis_jobs_completion_consistent
        check (
            (status in ('pending', 'processing') and completed_at is null)
            or (status in ('completed', 'failed', 'timed_out') and completed_at is not null)
        );

alter table public.users enable row level security;
alter table public.achievements enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.song_lessons enable row level security;
alter table public.theory_activities enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_lesson_progress enable row level security;
alter table public.user_song_progress enable row level security;
alter table public.user_theory_activity_progress enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.tracks enable row level security;
alter table public.track_markers enable row level security;
alter table public.ai_analysis_jobs enable row level security;

drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
for select to authenticated
using (auth.uid() = id);

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists achievements_read_authenticated on public.achievements;
create policy achievements_read_authenticated on public.achievements
for select to authenticated
using (true);

drop policy if exists courses_read_authenticated on public.courses;
create policy courses_read_authenticated on public.courses
for select to authenticated
using (true);

drop policy if exists lessons_read_authenticated on public.lessons;
create policy lessons_read_authenticated on public.lessons
for select to authenticated
using (true);

drop policy if exists theory_activities_read_authenticated on public.theory_activities;
create policy theory_activities_read_authenticated on public.theory_activities
for select to authenticated
using (true);

drop policy if exists song_lessons_read_visible on public.song_lessons;
create policy song_lessons_read_visible on public.song_lessons
for select to authenticated
using (owner_user_id is null or owner_user_id = auth.uid());

drop policy if exists song_lessons_insert_own on public.song_lessons;
create policy song_lessons_insert_own on public.song_lessons
for insert to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists song_lessons_update_own on public.song_lessons;
create policy song_lessons_update_own on public.song_lessons
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists song_lessons_delete_own on public.song_lessons;
create policy song_lessons_delete_own on public.song_lessons
for delete to authenticated
using (owner_user_id = auth.uid());

drop policy if exists user_achievements_owner_access on public.user_achievements;
create policy user_achievements_owner_access on public.user_achievements
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_lesson_progress_owner_access on public.user_lesson_progress;
create policy user_lesson_progress_owner_access on public.user_lesson_progress
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_song_progress_owner_access on public.user_song_progress;
create policy user_song_progress_owner_access on public.user_song_progress
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_theory_progress_owner_access on public.user_theory_activity_progress;
create policy user_theory_progress_owner_access on public.user_theory_activity_progress
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists practice_sessions_owner_access on public.practice_sessions;
create policy practice_sessions_owner_access on public.practice_sessions
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists tracks_owner_access on public.tracks;
create policy tracks_owner_access on public.tracks
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists track_markers_owner_access on public.track_markers;
create policy track_markers_owner_access on public.track_markers
for all to authenticated
using (
    exists (
        select 1
        from public.tracks t
        where t.id = track_id
            and t.user_id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from public.tracks t
        where t.id = track_id
            and t.user_id = auth.uid()
    )
);

drop policy if exists ai_analysis_jobs_owner_access on public.ai_analysis_jobs;
create policy ai_analysis_jobs_owner_access on public.ai_analysis_jobs
for all to authenticated
using (
    exists (
        select 1
        from public.tracks t
        where t.id = track_id
            and t.user_id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from public.tracks t
        where t.id = track_id
            and t.user_id = auth.uid()
    )
);
