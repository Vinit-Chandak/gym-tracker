import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  // Only manage the public schema; Supabase owns `auth`, `storage`, etc.
  schemaFilter: ["public"],
  // Supabase's predefined roles (authenticated, anon, service_role) already exist.
  entities: { roles: { provider: "supabase" } },
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
