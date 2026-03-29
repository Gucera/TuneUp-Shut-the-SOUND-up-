create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_preferences jsonb := '{}'::jsonb;
    v_requested_username text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
    v_final_username text := v_requested_username;
begin
    if jsonb_typeof(new.raw_user_meta_data -> 'preferences') = 'object' then
        v_preferences = new.raw_user_meta_data -> 'preferences';
    end if;

    if v_final_username is not null then
        while exists (
            select 1
            from public.users u
            where u.username = v_final_username
        ) loop
            v_final_username := concat(
                v_requested_username,
                '-',
                lpad((floor(random() * 10000))::int::text, 4, '0')
            );
        end loop;
    end if;

    insert into public.users (
        id,
        username,
        avatar_url,
        preferences
    )
    values (
        new.id,
        v_final_username,
        nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
        v_preferences
    );

    return new;
end;
$$;
