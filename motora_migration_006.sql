-- =============================================================
-- Motora — Migration 006
-- Adiciona suporte a viagem de ida e volta na tabela de linhas.
-- =============================================================

alter table public.motora_lines
  add column if not exists round_trip  boolean not null default false,
  add column if not exists return_time time;
