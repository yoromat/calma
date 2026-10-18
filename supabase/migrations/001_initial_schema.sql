-- ============================================================
-- CALMA · Esquema inicial + RLS + lógica de karma
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- TABLAS
-- ============================================================

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique,
  bio           text,
  limit_text    text default 'Respeto los tiempos y los "no".',
  avatar_color  text default '#6b3fa0',
  city          text,
  age           smallint check (age is null or (age >= 18 and age <= 99)),
  tags          text[] default '{}',
  mood          text not null default 'neutro'
                check (mood in ('sereno','jugueton','melancolico','cansado','neutro','enfadado')),
  energia       smallint not null default 7 check (energia between 0 and 10),
  karma_score   integer not null default 100 check (karma_score between 0 and 100),
  strikes       integer not null default 0,
  polite_count  integer not null default 0,
  sent_count    integer not null default 0,
  sent_today    integer not null default 0,
  last_day      date default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.likes (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references public.profiles(id) on delete cascade,
  to_user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  user1_id      uuid not null references public.profiles(id) on delete cascade,
  user2_id      uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (user1_id, user2_id),
  check (user1_id < user2_id)
);

create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  receiver_id   uuid not null references public.profiles(id) on delete cascade,
  content       text not null check (char_length(content) <= 2000),
  karma_delta   integer not null default 0,
  is_flagged    boolean not null default false,
  created_at    timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create table public.memories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  about_user_id   uuid not null references public.profiles(id) on delete cascade,
  text            text not null,
  valence         smallint not null default 0 check (valence between -2 and 2),
  is_nucleo       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles(id) on delete cascade,
  reported_user_id  uuid not null references public.profiles(id) on delete cascade,
  reason            text,
  status            text not null default 'open'
                    check (status in ('open','resolved','dismissed')),
  created_at        timestamptz not null default now()
);

-- Índices
create index idx_likes_from on public.likes(from_user_id);
create index idx_likes_to on public.likes(to_user_id);
create index idx_matches_user1 on public.matches(user1_id);
create index idx_matches_user2 on public.matches(user2_id);
create index idx_messages_sender on public.messages(sender_id);
create index idx_messages_receiver on public.messages(receiver_id);
create index idx_messages_created on public.messages(created_at desc);
create index idx_memories_user on public.memories(user_id);
create index idx_memories_about on public.memories(about_user_id);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger memories_updated_at
  before update on public.memories
  for each row execute function public.set_updated_at();

-- Crear perfil al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reset diario
create or replace function public.reset_daily_counters()
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set sent_today = 0, last_day = current_date
  where last_day < current_date;
end;
$$;

-- Evaluar mensaje y karma
create or replace function public.evaluate_message()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_bad     boolean;
  v_polite  boolean;
  v_delta   integer := 0;
  v_karma   integer;
  v_strikes integer;
begin
  perform public.reset_daily_counters();

  v_bad := new.content ~* '\b(foto|fotos|nudes?|desnuda|desnudo|tetas|sexo|sexy|follar|follamos|cama|polla|frigid[ao]|zorra|puta)\b';
  v_polite := new.content ~* '\b(gracias|vale|entiendo|perdona|perdón|respeto|sin problema|de acuerdo|con calma|tranqui)\b';

  if v_bad then
    v_delta := -15;
    new.is_flagged := true;

    update public.profiles
    set karma_score = greatest(0, karma_score - 15),
        strikes = strikes + 1,
        sent_count = sent_count + 1,
        sent_today = sent_today + 1
    where id = new.sender_id
    returning karma_score, strikes into v_karma, v_strikes;

    if v_strikes >= 3 then
      update public.profiles
      set karma_score = least(karma_score, 19)
      where id = new.sender_id;
    end if;

  elsif v_polite then
    v_delta := 3;
    update public.profiles
    set karma_score = least(100, karma_score + 3),
        polite_count = polite_count + 1,
        sent_count = sent_count + 1,
        sent_today = sent_today + 1
    where id = new.sender_id;
  else
    update public.profiles
    set sent_count = sent_count + 1,
        sent_today = sent_today + 1
    where id = new.sender_id;
  end if;

  new.karma_delta := v_delta;
  return new;
end;
$$;

create trigger on_message_before_insert
  before insert on public.messages
  for each row execute function public.evaluate_message();

-- Match automático
create or replace function public.check_mutual_like()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_mutual boolean;
  v_u1 uuid;
  v_u2 uuid;
begin
  select exists (
    select 1 from public.likes
    where from_user_id = new.to_user_id and to_user_id = new.from_user_id
  ) into v_mutual;

  if v_mutual then
    if new.from_user_id < new.to_user_id then
      v_u1 := new.from_user_id; v_u2 := new.to_user_id;
    else
      v_u1 := new.to_user_id; v_u2 := new.from_user_id;
    end if;

    insert into public.matches (user1_id, user2_id)
    values (v_u1, v_u2)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_like_created
  after insert on public.likes
  for each row execute function public.check_mutual_like();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.likes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.reports enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "likes_select_own"
  on public.likes for select to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "likes_insert_own"
  on public.likes for insert to authenticated
  with check (auth.uid() = from_user_id);

create policy "matches_select_own"
  on public.matches for select to authenticated
  using (auth.uid() = user1_id or auth.uid() = user2_id);

create policy "messages_select_participants"
  on public.messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (auth.uid() = sender_id);

create policy "memories_select_own"
  on public.memories for select to authenticated
  using (auth.uid() = user_id);

create policy "memories_insert_own"
  on public.memories for insert to authenticated
  with check (auth.uid() = user_id);

create policy "memories_update_own"
  on public.memories for update to authenticated
  using (auth.uid() = user_id);

create policy "reports_insert_own"
  on public.reports for insert to authenticated
  with check (auth.uid() = reporter_id);

create policy "reports_select_own"
  on public.reports for select to authenticated
  using (auth.uid() = reporter_id);

-- Proteger campos de karma
create or replace function public.protect_karma_fields()
returns trigger language plpgsql as $$
begin
  if auth.uid() = old.id then
    new.karma_score  := old.karma_score;
    new.strikes      := old.strikes;
    new.polite_count := old.polite_count;
    new.sent_count   := old.sent_count;
    new.sent_today   := old.sent_today;
  end if;
  return new;
end;
$$;

create trigger protect_karma
  before update on public.profiles
  for each row execute function public.protect_karma_fields();
