-- Liminal Echoes · Anniversary Trivia — Supabase schema
-- Run this whole file once in the Supabase SQL editor (Database → SQL Editor → New query → paste → Run).
-- Before running: change the HOST PIN on the line marked  <<< CHANGE ME >>>  near the bottom.

-- ---------- tables ----------
create table if not exists public.games (
  id           text primary key,                      -- the join code viewers type, e.g. 'ECHO'
  state        jsonb not null default '{}'::jsonb,    -- phase, q_index, round, timers, settings, last result, leaderboard
  questions    jsonb not null default '[]'::jsonb,    -- the show: array of question objects (loaded from the sheet by a host)
  updated_at   timestamptz not null default now()
);

create table if not exists public.game_secrets (
  game_id      text primary key references public.games(id) on delete cascade,
  host_pin     text not null
);

create table if not exists public.players (
  game_id      text not null references public.games(id) on delete cascade,
  pid          text not null,
  name         text not null,
  role         text not null check (role in ('player','audience')),
  score        int  not null default 0,
  last         int  not null default 0,
  joined_at    timestamptz not null default now(),
  primary key (game_id, pid)
);

create table if not exists public.answers (
  game_id      text not null,
  q            int  not null,
  pid          text not null,
  role         text not null,
  choice       int  not null,
  at           timestamptz not null default now(),
  correct      boolean,
  points       int,
  fastest      boolean not null default false,
  primary key (game_id, q, pid),
  foreign key (game_id, pid) references public.players(game_id, pid) on delete cascade
);

create index if not exists answers_game_q on public.answers(game_id, q);

-- ---------- realtime ----------
do $$ begin
  begin alter publication supabase_realtime add table public.games;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.answers; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
end $$;

-- ---------- row level security: everyone may READ games/players/answers; nobody writes directly ----------
alter table public.games        enable row level security;
alter table public.game_secrets enable row level security;
alter table public.players      enable row level security;
alter table public.answers      enable row level security;

drop policy if exists "read games"   on public.games;
drop policy if exists "read players" on public.players;
drop policy if exists "read answers" on public.answers;
create policy "read games"   on public.games   for select using (true);
create policy "read players" on public.players for select using (true);
create policy "read answers" on public.answers for select using (true);
-- game_secrets has no policies: unreadable from the browser.

-- ---------- helpers ----------
create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;

create or replace function public._check_pin(p_game text, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from game_secrets where game_id = p_game and host_pin = p_pin) then
    raise exception 'bad host pin' using errcode = '28000';
  end if;
end $$;

-- ---------- viewer actions ----------
create or replace function public.join_game(p_game text, p_pid text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare v_phase text; v_role text; v_name text;
begin
  select state->>'phase' into v_phase from games where id = p_game;
  if v_phase is null then raise exception 'no such game' using errcode = 'P0002'; end if;
  v_name := left(trim(p_name), 18);
  if v_name = '' then raise exception 'name required' using errcode = '22023'; end if;
  v_role := case when v_phase = 'lobby' then 'player' else 'audience' end;
  insert into players(game_id, pid, name, role) values (p_game, p_pid, v_name, v_role)
    on conflict (game_id, pid) do update set name = excluded.name;
  return (select role from players where game_id = p_game and pid = p_pid);
end $$;

create or replace function public.submit_answer(p_game text, p_pid text, p_choice int)
returns void language plpgsql security definer set search_path = public as $$
declare s jsonb; v_role text; v_q int;
begin
  select state into s from games where id = p_game;
  if s->>'phase' <> 'question' then return; end if;                       -- too late / too early: silently ignore
  if (s->>'paused')::boolean then return; end if;
  if now() > (s->>'question_ends')::timestamptz + interval '1.5 seconds' then return; end if;  -- small grace for network lag
  select role into v_role from players where game_id = p_game and pid = p_pid;
  if v_role is null then return; end if;
  v_q := (s->>'q_index')::int;
  insert into answers(game_id, q, pid, role, choice) values (p_game, v_q, p_pid, v_role, p_choice)
    on conflict do nothing;                                              -- first answer wins, no changing your mind
end $$;

-- ---------- host actions (all require the PIN) ----------
create or replace function public.host_set_state(p_game text, p_pin text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  perform _check_pin(p_game, p_pin);
  update games set state = state || p_patch, updated_at = now() where id = p_game returning state into s;
  return s;
end $$;

create or replace function public.host_set_questions(p_game text, p_pin text, p_questions jsonb)
returns int language plpgsql security definer set search_path = public as $$
begin
  perform _check_pin(p_game, p_pin);
  update games set questions = p_questions, state = state || jsonb_build_object('qv', coalesce((state->>'qv')::int,0)+1), updated_at = now() where id = p_game;
  return jsonb_array_length(p_questions);
end $$;

-- start the timer using the SERVER clock so every screen agrees
create or replace function public.host_show_question(p_game text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb; d int;
begin
  perform _check_pin(p_game, p_pin);
  select state into s from games where id = p_game;
  if s->>'phase' <> 'setup' then return s; end if;
  d := coalesce((s->'settings'->>'duration')::int, 20);
  update games set state = state || jsonb_build_object('phase','question','paused',false,
      'question_start', now(), 'question_ends', now() + make_interval(secs => d)), updated_at = now()
    where id = p_game returning state into s;
  return s;
end $$;

create or replace function public.host_pause(p_game text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s jsonb; left_ms int;
begin
  perform _check_pin(p_game, p_pin);
  select state into s from games where id = p_game;
  if s->>'phase' <> 'question' or (s->>'paused')::boolean then return s; end if;
  left_ms := greatest(0, (extract(epoch from ((s->>'question_ends')::timestamptz - now())) * 1000)::int);
  update games set state = state || jsonb_build_object('paused', true, 'pause_left_ms', left_ms), updated_at = now() where id = p_game returning state into s;
  return s;
end $$;

create or replace function public.host_resume(p_game text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  perform _check_pin(p_game, p_pin);
  select state into s from games where id = p_game;
  if not (s->>'paused')::boolean then return s; end if;
  update games set state = state || jsonb_build_object('paused', false,
      'question_ends', now() + make_interval(secs => coalesce((s->>'pause_left_ms')::int,0)/1000.0)), updated_at = now()
    where id = p_game returning state into s;
  return s;
end $$;

create or replace function public.host_add_time(p_game text, p_pin text, p_secs int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  perform _check_pin(p_game, p_pin);
  select state into s from games where id = p_game;
  if (s->>'paused')::boolean then
    update games set state = state || jsonb_build_object('pause_left_ms', coalesce((s->>'pause_left_ms')::int,0) + p_secs*1000) where id = p_game returning state into s;
  else
    update games set state = state || jsonb_build_object('question_ends', (s->>'question_ends')::timestamptz + make_interval(secs => p_secs)) where id = p_game returning state into s;
  end if;
  return s;
end $$;

-- score the current question on the server: one atomic pass, then flip to 'reveal'
create or replace function public.host_reveal(p_game text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s jsonb; qs jsonb; q jsonb; v_q int; v_correct int; v_kind text; v_final boolean;
        pts_ok int; pts_bad int; pts_fast int; mult int; fastest_pid text; res jsonb;
begin
  perform _check_pin(p_game, p_pin);
  select state, questions into s, qs from games where id = p_game;
  if s->>'phase' <> 'question' then return s; end if;
  v_q := (s->>'q_index')::int;
  q := qs -> v_q;
  v_correct := (q->>'correct')::int;
  v_kind := coalesce(q->>'kind','fact');
  v_final := coalesce((s->>'final_round')::boolean, false);
  mult    := case when v_final then coalesce((s->'settings'->>'mult')::int, 2) else 1 end;
  pts_ok  := coalesce((s->'settings'->>'correct')::int, 500) * mult;
  pts_bad := coalesce((s->'settings'->>'wrong')::int, -250);
  pts_fast:= coalesce((s->'settings'->>'fastest')::int, 100);

  -- fastest correct PLAYER (audience are not eligible for the speed bonus)
  select pid into fastest_pid from answers
    where game_id = p_game and q = v_q and role = 'player' and choice = v_correct
    order by at asc limit 1;

  update answers a set
      correct = (a.choice = v_correct),
      fastest = (v_kind = 'host' and a.pid = fastest_pid),
      points  = case when a.choice = v_correct then pts_ok + (case when v_kind = 'host' and a.pid = fastest_pid then pts_fast else 0 end)
                     else pts_bad end
    where a.game_id = p_game and a.q = v_q and a.points is null;

  update players p set last = 0 where p.game_id = p_game;
  update players p set score = p.score + a.points, last = a.points
    from answers a where a.game_id = p.game_id and a.pid = p.pid and a.game_id = p_game and a.q = v_q;

  -- compact result the stage and phones can show without pulling every row
  select jsonb_build_object(
      'counts', (select jsonb_agg(c order by i) from (select i, count(a.pid) c from generate_series(0,3) i left join answers a on a.game_id=p_game and a.q=v_q and a.role='player' and a.choice=i group by i) t),
      'got',    (select count(*) from answers where game_id=p_game and q=v_q and role='player' and correct),
      'tot',    (select count(*) from answers where game_id=p_game and q=v_q and role='player'),
      'aud_got',(select count(*) from answers where game_id=p_game and q=v_q and role='audience' and correct),
      'aud_tot',(select count(*) from answers where game_id=p_game and q=v_q and role='audience'),
      'fastest',(select name from players where game_id=p_game and pid=fastest_pid),
      'top',    (select jsonb_agg(jsonb_build_object('pid',pid,'name',name,'score',score,'last',last) order by score desc, joined_at asc)
                   from (select * from players where game_id=p_game and role='player' order by score desc, joined_at asc limit 10) t),
      'aud_top',(select jsonb_agg(jsonb_build_object('name',name,'score',score) order by score desc, joined_at asc)
                   from (select * from players where game_id=p_game and role='audience' order by score desc, joined_at asc limit 3) t),
      'n_players',(select count(*) from players where game_id=p_game and role='player'),
      'n_audience',(select count(*) from players where game_id=p_game and role='audience')
  ) into res;

  update games set state = state || jsonb_build_object('phase','reveal','paused',false,'result',res), updated_at = now()
    where id = p_game returning state into s;
  return s;
end $$;

create or replace function public.host_reset(p_game text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  perform _check_pin(p_game, p_pin);
  delete from answers where game_id = p_game;
  delete from players where game_id = p_game;
  update games set state = jsonb_build_object('phase','lobby','q_index',-1,'round',0,'paused',false,'final_round',false,
      'settings', coalesce(state->'settings', '{"duration":20,"correct":500,"wrong":-250,"fastest":100,"mult":2}'::jsonb),
      'qv', coalesce((state->>'qv')::int,0)), updated_at = now()
    where id = p_game returning state into s;
  return s;
end $$;

-- ---------- the game itself ----------
insert into public.games (id, state) values ('ECHO',
  '{"phase":"lobby","q_index":-1,"round":0,"paused":false,"final_round":false,"qv":0,
    "settings":{"duration":20,"correct":500,"wrong":-250,"fastest":100,"mult":2}}'::jsonb)
  on conflict (id) do nothing;

insert into public.game_secrets (game_id, host_pin) values ('ECHO', '1001')   -- <<< CHANGE ME >>>  pick a 4-8 digit PIN you and Fox will both type
  on conflict (game_id) do update set host_pin = excluded.host_pin;

grant execute on function public.server_now(), public.join_game(text,text,text), public.submit_answer(text,text,int),
  public.host_set_state(text,text,jsonb), public.host_set_questions(text,text,jsonb), public.host_show_question(text,text),
  public.host_pause(text,text), public.host_resume(text,text), public.host_add_time(text,text,int), public.host_reveal(text,text),
  public.host_reset(text,text) to anon, authenticated;
