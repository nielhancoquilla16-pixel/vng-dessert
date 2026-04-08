-- Repair site_content sync so admin/staff saves persist across devices and realtime feeds.

INSERT INTO public.site_content (id, src, title, text)
VALUES
  (1, 'adverVideo', 'Advertise Video', 'Watch how V&G prepares creamy leche flan and why customers keep coming back.'),
  (2, 'promoVideo', 'Promotional Video', 'Catch the latest V&G promos and seasonal dessert highlights in this feature video.')
ON CONFLICT (id) DO NOTHING;

UPDATE public.site_content
SET src = CASE id
  WHEN 1 THEN 'adverVideo'
  WHEN 2 THEN 'promoVideo'
  ELSE src
END
WHERE src IS NULL
   OR BTRIM(src) = ''
   OR LOWER(BTRIM(src)) IN ('#', 'about:blank', 'null', 'undefined');

UPDATE public.site_content
SET title = CASE id
  WHEN 1 THEN 'Advertise Video'
  WHEN 2 THEN 'Promotional Video'
  ELSE title
END
WHERE title IS NULL
   OR BTRIM(title) = '';

UPDATE public.site_content
SET text = CASE id
  WHEN 1 THEN 'Watch how V&G prepares creamy leche flan and why customers keep coming back.'
  WHEN 2 THEN 'Catch the latest V&G promos and seasonal dessert highlights in this feature video.'
  ELSE text
END
WHERE text IS NULL
   OR BTRIM(text) = ''
   OR LOWER(BTRIM(text)) IN ('#', 'n/a', 'na', 'none', 'null', 'undefined');

ALTER TABLE public.site_content REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'site_content'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'site_content'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.site_content;
  END IF;
END $$;

DROP POLICY IF EXISTS "site_content_select_public" ON public.site_content;
CREATE POLICY "site_content_select_public"
  ON public.site_content
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "site_content_insert_authenticated" ON public.site_content;
DROP POLICY IF EXISTS "site_content_insert_admin_staff" ON public.site_content;
CREATE POLICY "site_content_insert_admin_staff"
  ON public.site_content
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS "site_content_update_authenticated" ON public.site_content;
DROP POLICY IF EXISTS "site_content_update_admin_staff" ON public.site_content;
CREATE POLICY "site_content_update_admin_staff"
  ON public.site_content
  FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'staff'))
  WITH CHECK (public.get_my_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS "site_content_delete_admin_staff" ON public.site_content;
CREATE POLICY "site_content_delete_admin_staff"
  ON public.site_content
  FOR DELETE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'staff'));
