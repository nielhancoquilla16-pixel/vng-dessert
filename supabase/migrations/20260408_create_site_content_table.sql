-- Create site_content table for storing homepage videos and captions.
CREATE TABLE IF NOT EXISTS public.site_content (
  id INTEGER PRIMARY KEY,
  src TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE IF EXISTS public.site_content
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW());

CREATE INDEX IF NOT EXISTS site_content_updated_at_idx
ON public.site_content (updated_at);

-- Enable realtime payload updates for all row changes.
ALTER TABLE public.site_content REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
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

DROP TRIGGER IF EXISTS update_site_content_updated_at ON public.site_content;
CREATE TRIGGER update_site_content_updated_at
BEFORE UPDATE ON public.site_content
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.site_content (id, src, title, text)
VALUES
  (1, 'adverVideo', 'Advertise Video', 'Watch how V&G prepares creamy leche flan and why customers keep coming back.'),
  (2, 'promoVideo', 'Promotional Video', 'Catch the latest V&G promos and seasonal dessert highlights in this feature video.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_content_select_public" ON public.site_content;
CREATE POLICY "site_content_select_public"
  ON public.site_content
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "site_content_insert_admin_staff" ON public.site_content;
CREATE POLICY "site_content_insert_admin_staff"
  ON public.site_content
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS "site_content_insert_authenticated" ON public.site_content;

DROP POLICY IF EXISTS "site_content_update_admin_staff" ON public.site_content;
CREATE POLICY "site_content_update_admin_staff"
  ON public.site_content
  FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'staff'))
  WITH CHECK (public.get_my_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS "site_content_update_authenticated" ON public.site_content;

DROP POLICY IF EXISTS "site_content_delete_admin_staff" ON public.site_content;
CREATE POLICY "site_content_delete_admin_staff"
  ON public.site_content
  FOR DELETE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'staff'));
