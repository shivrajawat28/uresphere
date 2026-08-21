-- 0017_remove_chat_notifications.sql
-- Removes chat notifications to stop standard chat messages from generating entries.
-- Reverts the trigger and function created in 0015.

DROP TRIGGER IF EXISTS on_chat_message_inserted ON public.chat_messages;
DROP FUNCTION IF EXISTS public.notify_chat_message();
