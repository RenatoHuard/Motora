-- =============================================================
-- Motora — Migration 004
-- Gera assentos em motora_seats para veículos que ainda não
-- os possuem, a partir dos metadados em seat_classes e
-- rows_per_floor. Também restaura a coluna floors com os
-- metadados por andar (rowLayout, seatType).
--
-- Execute no SQL Editor do Supabase.
-- É seguro re-executar: veículos que já têm assentos são
-- ignorados (RAISE NOTICE).
-- =============================================================

DO $$
DECLARE
  v           RECORD;
  fi          INT;       -- índice do andar (0-based)
  ri          INT;       -- índice da fileira (0-based)
  ci          INT;       -- índice da coluna (0-based)
  row_layout  TEXT;
  label_scheme TEXT;
  rows_count  INT;
  row_num     INT;       -- 1-based
  left_cols   TEXT[];
  right_cols  TEXT[];
  left_len    INT;
  right_len   INT;
  per_row     INT;
  col         TEXT;
  seat_label  TEXT;
  n           INT;
  aisle_first INT;
  floor_count INT;
  rpf_json    JSONB;
BEGIN
  FOR v IN SELECT * FROM public.motora_vehicles ORDER BY created_at LOOP

    -- ── Ignorar veículos que já têm assentos ──────────────
    IF EXISTS (SELECT 1 FROM public.motora_seats WHERE vehicle_id = v.id LIMIT 1) THEN
      RAISE NOTICE '[%] já tem assentos — ignorado', v.name;
      CONTINUE;
    END IF;

    -- ── Validar configuração ───────────────────────────────
    IF v.seat_classes IS NULL
       OR NOT (v.seat_classes ? 'rowLayouts')
       OR jsonb_array_length(v.seat_classes->'rowLayouts') = 0 THEN
      RAISE NOTICE '[%] sem rowLayouts em seat_classes — ignorado', v.name;
      CONTINUE;
    END IF;

    floor_count  := jsonb_array_length(v.seat_classes->'rowLayouts');
    label_scheme := COALESCE(v.seat_classes->>'labelScheme', 'num_letter');

    -- Normaliza rows_per_floor para JSONB independente do tipo real da coluna
    BEGIN
      rpf_json := to_jsonb(v.rows_per_floor);
    EXCEPTION WHEN OTHERS THEN
      rpf_json := '[]'::jsonb;
    END;

    RAISE NOTICE '[%] gerando assentos — % andar(es), esquema: %',
      v.name, floor_count, label_scheme;

    -- ── Loop por andar ────────────────────────────────────
    FOR fi IN 0..floor_count-1 LOOP

      row_layout := COALESCE(v.seat_classes->'rowLayouts'->>fi, '2+2');

      -- Número de fileiras deste andar
      BEGIN
        rows_count := (rpf_json->fi)::int;
      EXCEPTION WHEN OTHERS THEN
        rows_count := NULL;
      END;
      IF rows_count IS NULL OR rows_count <= 0 THEN
        rows_count := 10;
        RAISE NOTICE '  andar %: rows_per_floor não encontrado — usando 10 fileiras', fi;
      END IF;

      -- Colunas por lado conforme layout
      CASE row_layout
        WHEN '1+2' THEN
          left_cols  := ARRAY['A'];
          right_cols := ARRAY['B','C'];
        WHEN '1+1' THEN
          left_cols  := ARRAY['A'];
          right_cols := ARRAY['B'];
        ELSE  -- '2+2' e qualquer outro
          left_cols  := ARRAY['A','B'];
          right_cols := ARRAY['C','D'];
      END CASE;

      left_len  := array_length(left_cols,  1);
      right_len := array_length(right_cols, 1);
      per_row   := left_len + right_len;

      -- ── Loop por fileira ──────────────────────────────
      FOR ri IN 0..rows_count-1 LOOP
        row_num := ri + 1;

        -- Lado esquerdo
        FOR ci IN 0..left_len-1 LOOP
          col := left_cols[ci + 1];  -- arrays PL/pgSQL são 1-based

          CASE label_scheme
            WHEN 'letter_num' THEN
              seat_label := col || row_num::text;
            WHEN 'sequential_left' THEN
              seat_label := (ri * per_row + ci + 1)::text;
            WHEN 'sequential_right' THEN
              seat_label := (ri * per_row + right_len + ci + 1)::text;
            WHEN 'odd_even' THEN
              -- lado esquerdo: contagem começa pelo corredor
              aisle_first := left_len - 1 - ci;
              n := ri * left_len + aisle_first + 1;
              seat_label := (2 * n)::text;          -- 2, 4, 6…
            ELSE  -- 'num_letter' (padrão)
              seat_label := row_num::text || col;
          END CASE;

          INSERT INTO public.motora_seats
            (id, vehicle_id, user_id, floor_num, row_num, side, col_idx, label, seat_exists, active)
          VALUES
            (gen_random_uuid(), v.id, v.user_id, fi, row_num, 'left', ci, seat_label, true, true);
        END LOOP;

        -- Lado direito
        FOR ci IN 0..right_len-1 LOOP
          col := right_cols[ci + 1];

          CASE label_scheme
            WHEN 'letter_num' THEN
              seat_label := col || row_num::text;
            WHEN 'sequential_left' THEN
              seat_label := (ri * per_row + left_len + ci + 1)::text;
            WHEN 'sequential_right' THEN
              seat_label := (ri * per_row + ci + 1)::text;
            WHEN 'odd_even' THEN
              n := ri * right_len + ci + 1;
              seat_label := (2 * n - 1)::text;       -- 1, 3, 5…
            ELSE  -- 'num_letter'
              seat_label := row_num::text || col;
          END CASE;

          INSERT INTO public.motora_seats
            (id, vehicle_id, user_id, floor_num, row_num, side, col_idx, label, seat_exists, active)
          VALUES
            (gen_random_uuid(), v.id, v.user_id, fi, row_num, 'right', ci, seat_label, true, true);
        END LOOP;

      END LOOP;  -- fileiras
    END LOOP;  -- andares

    -- ── Restaurar coluna floors com metadados ─────────────
    UPDATE public.motora_vehicles
    SET
      floors = (
        SELECT jsonb_agg(
          jsonb_build_object(
            'rowLayout', v.seat_classes->'rowLayouts'->s.i,
            'seatType',  COALESCE(v.seat_classes->'seatTypes'->s.i, '"conventional"'::jsonb)
          )
          ORDER BY s.i
        )
        FROM generate_series(0, floor_count - 1) s(i)
      ),
      total_seats = (
        SELECT COUNT(*) FROM public.motora_seats
        WHERE vehicle_id = v.id AND seat_exists = true
      )
    WHERE id = v.id;

    RAISE NOTICE '[%] concluído — % assentos criados', v.name,
      (SELECT COUNT(*) FROM public.motora_seats WHERE vehicle_id = v.id);

  END LOOP;
END $$;
