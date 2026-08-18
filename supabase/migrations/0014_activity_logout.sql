-- ============================================================================
-- Uresphere — 48-hour inactivity logout (migration 0014)
--
-- Adds `profiles.last_activity_at`, the server-side record of the last time
-- the user meaningfully used the app. The app:
--   * refreshes it (throttled, client-side) whenever the authenticated user
--     returns to / uses the application — initial load, refresh, focus,
--     visibility change, and throttled interaction;
--   * checks it in `requireMember` before allowing access to any protected
--     page. When the timestamp is 48+ hours old the session is expired via
--     Supabase signOut and the user is redirected to /auth/login.
--
-- The value lives in the profiles table (RLS-gated, own-row writes only), so
-- it is not an easily-manipulated client-only value and it survives browser
-- close / reopen. `NULL` means "never recorded yet" — treated as active.
--
-- All changes are additive / idempotent. No RLS policy is created, altered,
-- or weakened: the existing `profiles_update_own` policy (using
-- `id = auth.uid()`) already covers the activity write.
-- ============================================================================

alter table public.profiles
  add column if not exists last_activity_at timestamptz;
