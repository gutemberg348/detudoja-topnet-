-- Converte os IDs restantes do projeto de UUID para INT autoincrementavel,
-- preservando dados, relacionamentos e a posicao fisica da coluna id.

BEGIN;

CREATE TEMP TABLE _dtj_id_map (
  table_name text NOT NULL,
  old_id uuid NOT NULL,
  new_id integer NOT NULL,
  PRIMARY KEY (table_name, old_id),
  UNIQUE (table_name, new_id)
) ON COMMIT DROP;

CREATE TEMP TABLE _dtj_fk_defs AS
SELECT
  conrelid::regclass::text AS table_name,
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace;

CREATE TEMP TABLE _dtj_fk_column_refs AS
SELECT
  child_table.relname AS table_name,
  child_col.attname AS column_name,
  parent_table.relname AS referenced_table_name
FROM pg_constraint fk
JOIN pg_class child_table ON child_table.oid = fk.conrelid
JOIN pg_namespace child_ns ON child_ns.oid = child_table.relnamespace
JOIN pg_class parent_table ON parent_table.oid = fk.confrelid
JOIN LATERAL unnest(fk.conkey) WITH ORDINALITY AS child_key(attnum, ord) ON true
JOIN LATERAL unnest(fk.confkey) WITH ORDINALITY AS parent_key(attnum, ord) ON parent_key.ord = child_key.ord
JOIN pg_attribute child_col ON child_col.attrelid = child_table.oid AND child_col.attnum = child_key.attnum
WHERE fk.contype = 'f'
  AND child_ns.nspname = 'public'
  AND array_length(fk.conkey, 1) = 1;

CREATE TEMP TABLE _dtj_id_tables AS
SELECT c.table_name
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema
 AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name = 'id'
  AND c.udt_name = 'uuid'
  AND t.table_type = 'BASE TABLE'
ORDER BY c.table_name;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT table_name FROM _dtj_id_tables LOOP
    EXECUTE format(
      'INSERT INTO _dtj_id_map (table_name, old_id, new_id)
       SELECT %L, id, row_number() OVER (ORDER BY id)::integer
       FROM %I',
      item.table_name,
      item.table_name
    );
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.dtj_int_id(target_table text, old_value uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  mapped_id integer;
BEGIN
  IF old_value IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT new_id
    INTO mapped_id
  FROM _dtj_id_map
  WHERE table_name = target_table
    AND old_id = old_value;

  IF mapped_id IS NULL THEN
    RAISE EXCEPTION 'Nao foi encontrado mapa de ID para %.%', target_table, old_value;
  END IF;

  RETURN mapped_id;
END;
$$;

CREATE FUNCTION pg_temp.dtj_any_int_id(old_value uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  mapped_id integer;
BEGIN
  IF old_value IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT new_id
    INTO mapped_id
  FROM _dtj_id_map
  WHERE old_id = old_value
  ORDER BY table_name
  LIMIT 1;

  RETURN mapped_id;
END;
$$;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT table_name, conname FROM _dtj_fk_defs LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', item.table_name, item.conname);
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
  target_table text;
BEGIN
  FOR item IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.udt_name = 'uuid'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  LOOP
    IF item.column_name = 'id' THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', item.table_name, item.column_name);
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE integer USING pg_temp.dtj_int_id(%L, %I)',
        item.table_name,
        item.column_name,
        item.table_name,
        item.column_name
      );
    ELSE
      SELECT referenced_table_name
        INTO target_table
      FROM _dtj_fk_column_refs
      WHERE table_name = item.table_name
        AND column_name = item.column_name
      LIMIT 1;

      IF target_table IS NULL AND item.table_name = 'configuracoes_sistema' AND item.column_name = 'atualizado_por_admin_id' THEN
        target_table := 'administradores';
      END IF;

      IF target_table IS NULL AND item.table_name = 'lancamentos_carteira' AND item.column_name = 'origem_id' THEN
        EXECUTE format(
          'ALTER TABLE %I ALTER COLUMN %I TYPE integer USING pg_temp.dtj_any_int_id(%I)',
          item.table_name,
          item.column_name,
          item.column_name
        );
      ELSIF target_table IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE %I ALTER COLUMN %I TYPE integer USING pg_temp.dtj_int_id(%L, %I)',
          item.table_name,
          item.column_name,
          target_table,
          item.column_name
        );
      ELSE
        RAISE EXCEPTION 'Coluna UUID sem mapeamento: %.%', item.table_name, item.column_name;
      END IF;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
  sequence_name text;
BEGIN
  FOR item IN
    SELECT table_name
    FROM _dtj_id_tables
    ORDER BY table_name
  LOOP
    sequence_name := item.table_name || '_id_seq';

    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', sequence_name);
    EXECUTE format('ALTER SEQUENCE %I OWNED BY %I.id', sequence_name, item.table_name);
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN id SET DEFAULT nextval(%L::regclass)',
      item.table_name,
      sequence_name
    );
    EXECUTE format(
      'SELECT setval(%L::regclass, COALESCE((SELECT MAX(id) FROM %I), 0) + 1, false)',
      sequence_name,
      item.table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT table_name, conname, definition FROM _dtj_fk_defs ORDER BY table_name, conname LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', item.table_name, item.conname, item.definition);
  END LOOP;
END $$;

COMMIT;
