-- ============================================================================
-- Cleanup of RT live-verification test data (scripts/verify-feedback-flow.mjs)
--
-- Created during live verification on 2026-08-16:
--   - 1 feedback submission:  "RT feedback 202608161534"
--     id = 0b35a15f-bcc4-43d8-ba6e-50350a350cd4
--   - 1 admin reply on it
--   - notifications created by the feedback actions:
--       feedback_submitted (to Sphere admins)
--       feedback_reply     (to the owner)
--       feedback_status    (to the owner)
--
-- Why this must run in the SQL Editor: migration 0012 intentionally defines
-- NO delete policy on public.feedback / public.feedback_replies, so neither
-- users nor admins can delete feedback through the API. The postgres role in
-- the SQL Editor bypasses RLS. The RT chat groups were already deleted via the
-- super-admin API (groups_delete_admin policy + cascade).
--
-- All statements are scoped to the exact verification rows — nothing else is
-- touched. Safe to run as-is; idempotent (deleting already-gone rows is a no-op).
-- ============================================================================

begin;

-- 1. The admin reply on the test feedback
delete from public.feedback_replies
where feedback_id = '0b35a15f-bcc4-43d8-ba6e-50350a350cd4';

-- 2. The test feedback submission itself
delete from public.feedback
where id = '0b35a15f-bcc4-43d8-ba6e-50350a350cd4';

-- 3. Notifications emitted by the verification run for this submission.
--    Scoped by type + the test subject so real notifications are untouched.
delete from public.notifications
where type in ('feedback_submitted', 'feedback_reply', 'feedback_status')
  and body like '%RT feedback 202608161534%';

commit;

-- Optional sanity check afterwards (should return 0 rows):
--   select count(*) from public.feedback where subject like 'RT feedback%';
--   select count(*) from public.feedback_replies
--     where feedback_id = '0b35a15f-bcc4-43d8-ba6e-50350a350cd4';
--   select count(*) from public.notifications
--     where type in ('feedback_submitted', 'feedback_reply', 'feedback_status')
--       and body like '%RT feedback 202608161534%';
