-- =============================================================
-- Motora — Migration 005
-- Introduz o conceito de Linha (rota fixa com veículo e
-- passageiros fixos). Uma Viagem pode ser gerada a partir
-- de uma Linha, herdando veículo e passageiros.
--
-- Execute no SQL Editor do Supabase.
-- =============================================================

-- 1. Tabela de Linhas
create table if not exists public.motora_lines (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  name            text        not null,
  vehicle_id      uuid        references public.motora_vehicles(id) on delete set null,
  origin          text,
  destination     text,
  departure_time  time,
  recurrence      jsonb       not null default '{"type":"none"}',
  notes           text,
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.motora_lines enable row level security;

create policy "Dono acessa suas linhas"
  on public.motora_lines for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists motora_lines_user
  on public.motora_lines (user_id);

-- 2. Passageiros fixos por linha
create table if not exists public.motora_line_passengers (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  line_id       uuid        not null references public.motora_lines(id) on delete cascade,
  passenger_id  uuid        not null references public.motora_passengers(id) on delete cascade,
  seat_id       uuid,
  seat_label    text,
  floor_num     smallint    not null default 0,
  created_at    timestamptz not null default now(),
  unique (line_id, passenger_id),
  unique (line_id, seat_id)
);

alter table public.motora_line_passengers enable row level security;

create policy "Dono acessa passageiros da linha"
  on public.motora_line_passengers for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists motora_line_passengers_line
  on public.motora_line_passengers (line_id);

-- 3. Vincular viagens a linhas e permitir substituição de veículo
alter table public.motora_trips
  add column if not exists line_id               uuid references public.motora_lines(id) on delete set null,
  add column if not exists substitute_vehicle_id uuid references public.motora_vehicles(id) on delete set null;

create index if not exists motora_trips_line
  on public.motora_trips (line_id)
  where line_id is not null;
