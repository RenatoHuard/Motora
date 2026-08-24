-- =============================================================
-- Motora — Migration 002
-- Cria tabela de viagens com suporte a recorrência.
--
-- Execute no SQL Editor do Supabase APÓS a migration 001.
-- =============================================================

create table if not exists public.motora_trips (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  vehicle_id      uuid        references public.motora_vehicles(id) on delete set null,
  origin          text,
  destination     text,
  departure_date  date        not null,
  departure_time  time,
  recurrence      jsonb       not null default '{"type":"none"}',
  -- recurrence shape:
  --   { "type": "none" | "daily" | "weekly" | "biweekly" | "monthly",
  --     "weekdays": [0..6],     -- 0=Dom … 6=Sáb (para weekly/biweekly)
  --     "end": { "type": "never" | "date" | "count",
  --              "date": "YYYY-MM-DD",   -- se type="date"
  --              "count": 10 }           -- se type="count"
  --   }
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.motora_trips enable row level security;

create policy "Dono acessa suas viagens"
  on public.motora_trips for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists motora_trips_user_date
  on public.motora_trips (user_id, departure_date);

create index if not exists motora_trips_vehicle
  on public.motora_trips (vehicle_id);
