-- ============================================================================
-- UreSphere — Add muted column to notification_preferences (migration 0027)
-- ============================================================================

alter table public.notification_preferences
add column if not exists muted boolean not null default false;
