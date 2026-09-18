/*
 * Supabase client for the RadIA browser app.
 *
 * IMPORTANT:
 * - Put only the Supabase project URL and the publishable/anon key here.
 * - NEVER put the service_role key in frontend code.
 */

const SUPABASE_URL = 'https://bdlttuikdwzprpalolqo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_76l11yc5Y9QWBr8Hxg7v6w_QCJpNMRT';

if (!window.supabase) {
  console.error('Supabase JS SDK não foi carregado.');
} else {
  window.radiaSupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
}
