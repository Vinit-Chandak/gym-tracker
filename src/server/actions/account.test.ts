import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteUser: vi.fn(), signOut: vi.fn(), forgetProfile: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { admin: { deleteUser: mocks.deleteUser } } }),
}));
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "signed-in-user", email: "athlete@example.test" }),
}));
vi.mock("@/lib/env", () => ({
  getSupabasePublicEnv: () => ({ url: "https://auth.example.test", anonKey: "public" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("@/server/queries/request-profile", () => ({ forgetProfile: mocks.forgetProfile }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { redirect } from "next/navigation";
import { canDeleteSignIn, deleteAccountAction } from "./account";

const confirmation = () => {
  const form = new FormData();
  form.set("confirm", "DELETE");
  return form;
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-admin-credential");
});
afterEach(() => vi.unstubAllEnvs());

it("refuses deletion without an admin credential and never reports success", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  expect(await canDeleteSignIn()).toBe(false);
  expect((await deleteAccountAction({}, confirmation())).error).toMatch(/have not been changed/);
  expect(mocks.deleteUser).not.toHaveBeenCalled();
  expect(mocks.forgetProfile).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
it("deletes only the current Auth account, then clears the session", async () => {
  mocks.deleteUser.mockResolvedValue({ error: null });
  await deleteAccountAction({}, confirmation());
  expect(mocks.deleteUser).toHaveBeenCalledExactlyOnceWith("signed-in-user");
  expect(mocks.forgetProfile).toHaveBeenCalledWith("signed-in-user");
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(redirect).toHaveBeenCalledWith("/login?deleted=1");
});
it("leaves deletion incomplete when Auth refuses or its outcome is uncertain", async () => {
  mocks.deleteUser.mockResolvedValue({ error: { status: 503 } });
  expect((await deleteAccountAction({}, confirmation())).error).toMatch(/could not be deleted/);
  mocks.deleteUser.mockRejectedValue(new Error("connection lost"));
  expect((await deleteAccountAction({}, confirmation())).error).toMatch(/Could not confirm/);
  expect(mocks.forgetProfile).not.toHaveBeenCalled();
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
it("requires the existing explicit deletion confirmation", async () => {
  expect((await deleteAccountAction({}, new FormData())).error).toMatch(/Type DELETE/);
  expect(mocks.deleteUser).not.toHaveBeenCalled();
});
