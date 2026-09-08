-- Bridge to Supabase Auth. `auth.users` and the `authenticated` / `service_role` roles are
-- provided by Supabase (and stubbed by src/db/test/pglite.ts for tests).

-- 1. profiles.id mirrors auth.users.id; deleting the auth user removes all of their data.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

-- 2. Create the profile row automatically on sign-up.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email, ''), '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
--> statement-breakpoint

-- 3. Keep the profile email in step with Supabase Auth.
CREATE OR REPLACE FUNCTION public.handle_auth_user_email_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email, updated_at = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_email_change();
--> statement-breakpoint

-- 4. Table privileges for the roles the app switches to. RLS still decides which rows.
--    The anonymous role gets nothing: the app has no public data.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
