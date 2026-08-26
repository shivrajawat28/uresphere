-- Migration: 0032_group_messages_deletion.sql
-- Description: Alters the group_messages body constraint to allow 0-length strings so deleted message bodies can be blanked.

alter table public.group_messages drop constraint if exists group_messages_body_check;
alter table public.group_messages
  add constraint group_messages_body_check
  check (char_length(body) between 0 and 1000);
