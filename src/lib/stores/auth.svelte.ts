// Auth session state + login/logout. Supabase persists the session in
// localStorage and auto-refreshes: each device logs in once.
import { supabase } from "../sync/supabase";

class AuthStore {
  userEmail = $state<string | null>(null);
  ready = $state(false);
}

export const auth = new AuthStore();

export const initAuth = async (): Promise<void> => {
  supabase.auth.onAuthStateChange((_event, session) => {
    auth.userEmail = session?.user?.email ?? null;
  });
  const { data } = await supabase.auth.getSession();
  auth.userEmail = data.session?.user?.email ?? null;
  auth.ready = true;
};

export const login = async (email: string, password: string): Promise<string | null> => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
};

export const logout = async (): Promise<void> => {
  await supabase.auth.signOut();
};
