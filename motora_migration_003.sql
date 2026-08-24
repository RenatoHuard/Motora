-- =============================================================
-- Motora — Migration 003
-- Cria tabelas de passageiros e atribuição de poltronas.
--
-- Execute no SQL Editor do Supabase APÓS as migrations 001 e 002.
-- =============================================================

-- 1. Passageiros
create table if not exists public.motora_passengers (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  email       text,
  phone       text,
  photo_url   text,
  type        text        not null default 'avulso' check (type in ('fixo', 'avulso')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.motora_passengers enable row level security;

create policy "Dono acessa seus passageiros"
  on public.motora_passengers for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists motora_passengers_user
  on public.motora_passengers (user_id);

-- 2. Atribuição passageiro ↔ viagem ↔ poltrona
create table if not exists public.motora_trip_passengers (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  trip_id       uuid        not null references public.motora_trips(id) on delete cascade,
  passenger_id  uuid        not null references public.motora_passengers(id) on delete cascade,
  seat_id       uuid,                -- referencia motora_seats.id
  seat_label    text,                -- desnormalizado para exibição rápida
  floor_num     smallint    not null default 0,
  created_at    timestamptz not null default now(),
  -- uma poltrona por passageiro por viagem, e um passageiro por poltrona por viagem
  unique (trip_id, passenger_id),
  unique (trip_id, seat_id)
);

alter table public.motora_trip_passengers enable row level security;

create policy "Dono acessa suas atribuições"
  on public.motora_trip_passengers for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists motora_trip_passengers_trip
  on public.motora_trip_passengers (trip_id);

create index if not exists motora_trip_passengers_passenger
  on public.motora_trip_passengers (passenger_id);
