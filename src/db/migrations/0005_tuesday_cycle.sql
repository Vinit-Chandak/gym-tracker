-- Correct the unused starter plan without rewriting an active programme version.
-- Plans with any session, slot event or linked run are deliberately left intact.
DO $$
DECLARE
  source_program programs%ROWTYPE;
  source_day program_days%ROWTYPE;
  source_exercise program_exercises%ROWTYPE;
  new_program_id uuid;
  new_day_id uuid;
  new_exercise_id uuid;
  next_version integer;
BEGIN
  FOR source_program IN
    SELECT p.* FROM programs p
    WHERE p.slug = 'strength-aesthetics-hybrid-8wk'
      AND p.status = 'active' AND p.start_date = DATE '2026-09-08'
      AND p.start_day_index = 2 AND p.weeks = 8
      AND NOT EXISTS (SELECT 1 FROM workout_sessions s WHERE s.program_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM program_slot_events e WHERE e.program_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM runs r JOIN program_runs pr ON pr.id = r.program_run_id
        WHERE pr.program_id = p.id
      )
    FOR UPDATE OF p
  LOOP
    new_program_id := gen_random_uuid();
    SELECT coalesce(max(version), 0) + 1 INTO next_version FROM programs
      WHERE user_id = source_program.user_id AND slug = source_program.slug;
    UPDATE programs SET status = 'archived', updated_at = now() WHERE id = source_program.id;
    INSERT INTO programs SELECT (jsonb_populate_record(NULL::programs,
      to_jsonb(source_program) || jsonb_build_object(
        'id', new_program_id, 'version', next_version, 'start_day_index', 1,
        'end_date', '2026-11-02', 'created_at', now(), 'updated_at', now()
      ))).*;

    FOR source_day IN SELECT * FROM program_days WHERE program_id = source_program.id LOOP
      new_day_id := gen_random_uuid();
      INSERT INTO program_days SELECT (jsonb_populate_record(NULL::program_days,
        to_jsonb(source_day) || jsonb_build_object(
          'id', new_day_id, 'program_id', new_program_id,
          'day_of_week', (source_day.day_index % 7) + 1, 'created_at', now()
        ))).*;
      FOR source_exercise IN SELECT * FROM program_exercises WHERE program_day_id = source_day.id LOOP
        new_exercise_id := gen_random_uuid();
        INSERT INTO program_exercises SELECT (jsonb_populate_record(NULL::program_exercises,
          to_jsonb(source_exercise) || jsonb_build_object(
            'id', new_exercise_id, 'program_day_id', new_day_id,
            'created_at', now(), 'updated_at', now()
          ))).*;
        INSERT INTO program_exercise_fallbacks
          SELECT (jsonb_populate_record(NULL::program_exercise_fallbacks,
            to_jsonb(f) || jsonb_build_object(
              'id', gen_random_uuid(), 'program_exercise_id', new_exercise_id, 'created_at', now()
            ))).*
          FROM program_exercise_fallbacks f WHERE f.program_exercise_id = source_exercise.id;
      END LOOP;
    END LOOP;
    INSERT INTO program_runs SELECT (jsonb_populate_record(NULL::program_runs,
      to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(), 'program_id', new_program_id,
        'day_of_week', (r.day_of_week % 7) + 1, 'created_at', now()
      ))).* FROM program_runs r WHERE r.program_id = source_program.id;
  END LOOP;
END $$;
