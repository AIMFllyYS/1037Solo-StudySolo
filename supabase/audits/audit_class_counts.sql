SELECT
  (SELECT count(*) FROM public.ss_class_sessions) AS sessions,
  (SELECT count(*) FROM public.ss_class_transcripts) AS transcript_segments,
  (SELECT count(*) FROM public.ss_class_outlines) AS outlines,
  (SELECT count(*) FROM public.ss_class_renders) AS renders,
  (SELECT count(*) FROM public.ss_class_chats) AS chats;
