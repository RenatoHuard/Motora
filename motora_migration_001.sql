-- =============================================================
-- Motora — Migration 001
-- Cria tabela normalizada de poltronas (motora_seats)
-- e simplifica a coluna floors em motora_vehicles.
--
-- Execute este script no SQL Editor do Supabase.
-- ATENÇÃO: o último UPDATE apaga os dados de assentos
-- armazenados no formato antigo (coluna floors).
-- Recrie os veículos após rodar.
-- =============================================================

-- 1. Tabela normalizada de poltronas
create table if not exists public.motora_seats (
  id          uuid        primary key default gen_random_uuid(),
  vehicle_id  uuid        not null references public.motora_vehicles(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  floor_num   smallint    not null default 0,        -- 0 = 1º andar, 1 = 2º andar
  row_num     smallint    not null,                  -- fileira (começa em 1)
  side        text        not null check (side in ('left', 'right')),
  col_idx     smallint    not null,                  -- posição dentro do lado (começa em 0)
  label       text        not null,                  -- rótulo visível da poltrona
  seat_exists boolean     not null default true,     -- false = gap (poltrona removida)
  active      boolean     not null default true,     -- false = ocupada
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Row Level Security
alter table public.motora_seats enable row level security;

create policy "Dono acessa seus assentos"
  on public.motora_seats for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Índice de consulta (vehicle → andar → fileira → coluna)
create index if not exists motora_seats_lookup
  on public.motora_seats (vehicle_id, floor_num, row_num, col_idx);

-- 4. Limpar dados antigos de assentos da coluna floors em motora_vehicles.
--    A partir de agora floors guarda apenas metadados do andar:
--    [{ "rowLayout": "2+2", "seatType": "conventional" }, ...]
--    Os assentos em si ficam em motora_seats.
update public.motora_vehicles
set floors = '[]'::jsonb;
