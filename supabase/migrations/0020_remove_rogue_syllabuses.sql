-- ============================================================================
-- Uresphere — Remove rogue syllabus subjects (migration 0020)
--
-- Deletes any subjects that were manually created as "Syllabus" placeholders
-- before the dedicated academic_syllabuses table was introduced.
-- ============================================================================

delete from public.subjects
where name ilike 'Syllabus%';
