-- Deleting an account failed at COMMIT with "permission denied for table activities".
--
-- Auth owns the delete: `admin.auth.admin.deleteUser` runs it as `supabase_auth_admin`, and the
-- `auth.users` foreign key cascades the whole account out of `public`. Removing a detail row
-- fires the deferred constraint trigger below, which reads `public.activities` to check whether
-- its parent survived the same transaction — and `supabase_auth_admin` has no rights there. The
-- COMMIT aborted, Auth answered 500, and the account was left exactly where it was.
--
-- Every other function in this schema that reads a table from a trigger or a policy is already
-- `SECURITY DEFINER SET search_path = public`, including `activity_detail_count` two lines below
-- the query that failed. These two were written without it. Neither takes anything but the row
-- being written, both filter on the owner, and both only raise; running them as the owner cannot
-- widen what a caller may see, and is what lets the invariant be checked at all.
CREATE OR REPLACE FUNCTION public.assert_activity_detail() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target uuid;
  owner uuid;
  found integer;
BEGIN
  IF TG_TABLE_NAME = 'activities' THEN
    target := NEW.id;
    owner := NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD.activity_id;
    owner := OLD.user_id;
  ELSE
    target := NEW.activity_id;
    owner := NEW.user_id;
  END IF;
  IF target IS NULL THEN
    RETURN NULL;
  END IF;
  -- A parent deleted in this same transaction has nothing left to be consistent about.
  IF NOT EXISTS (SELECT 1 FROM public.activities a WHERE a.id = target AND a.user_id = owner) THEN
    RETURN NULL;
  END IF;
  found := public.activity_detail_count(target, owner);
  IF found <> 1 THEN
    RAISE EXCEPTION 'activity % must have exactly one typed detail, found %', target, found
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

-- Fires only on insert and update, so no cascade reaches it, but it reads the same table under
-- the same conditions and is left the same latent failure for any writer without rights.
CREATE OR REPLACE FUNCTION public.assert_activity_detail_sport() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent_sport public.activity_sport;
BEGIN
  IF NEW.activity_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT a.sport INTO parent_sport FROM public.activities a
    WHERE a.id = NEW.activity_id AND a.user_id = NEW.user_id;
  IF parent_sport IS NOT NULL AND parent_sport <> 'strength' THEN
    RAISE EXCEPTION 'workout session % cannot be the detail of a % activity', NEW.id, parent_sport
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$;
