// The ONLY module that creates the Supabase client. Everything below
// src/lib/sync speaks domain types; everything network lives here or in
// siblings of this file.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// App shows a setup notice instead of crashing when env is missing.
export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url ?? "https://unconfigured.invalid", key ?? "unconfigured");
