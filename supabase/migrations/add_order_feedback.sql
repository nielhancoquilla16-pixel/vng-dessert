ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS feedback_token TEXT,
  ADD COLUMN IF NOT EXISTS feedback_token_generated_at TIMESTAMPTZ;

UPDATE public.orders
SET feedback_token = CONCAT('VNGFB-', UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 24))),
    feedback_token_generated_at = COALESCE(feedback_token_generated_at, NULLIF(status_timestamps->>'confirmed', '')::TIMESTAMPTZ, created_at, TIMEZONE('utc', NOW()))
WHERE feedback_token IS NULL
  AND LOWER(COALESCE(order_status, 'pending')) NOT IN ('pending', 'cancelled', 'refunded');

UPDATE public.orders
SET feedback_token = NULL,
    feedback_token_generated_at = NULL
WHERE LOWER(COALESCE(order_status, 'pending')) IN ('pending', 'cancelled', 'refunded');

UPDATE public.orders
SET qr_token = NULL,
    qr_generated_at = NULL,
    qr_used_at = NULL
WHERE LOWER(COALESCE(order_status, 'pending')) IN ('pending', 'cancelled', 'refunded');

UPDATE public.orders
SET qr_token = CONCAT('VNGQR-', UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 20))),
    qr_generated_at = COALESCE(qr_generated_at, NULLIF(status_timestamps->>'confirmed', '')::TIMESTAMPTZ, created_at, TIMEZONE('utc', NOW()))
WHERE COALESCE(verification_required, TRUE) = TRUE
  AND qr_token IS NULL
  AND LOWER(COALESCE(order_status, 'pending')) NOT IN ('pending', 'cancelled', 'refunded');

CREATE UNIQUE INDEX IF NOT EXISTS orders_feedback_token_unique_idx
ON public.orders (feedback_token)
WHERE feedback_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  customer_name TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'invalid')),
  invalid_reason TEXT,
  purchased_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  transaction_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS order_feedback_order_id_idx
ON public.order_feedback (order_id);

CREATE INDEX IF NOT EXISTS order_feedback_submitted_at_idx
ON public.order_feedback (submitted_at DESC);

CREATE INDEX IF NOT EXISTS order_feedback_rating_idx
ON public.order_feedback (rating);

-- Completed-order feedback workflow. This block is intentionally idempotent so it
-- also upgrades databases where the first feedback migration was already applied.
ALTER TABLE IF EXISTS public.order_feedback
  ADD COLUMN IF NOT EXISTS product_rating INTEGER,
  ADD COLUMN IF NOT EXISTS service_rating INTEGER,
  ADD COLUMN IF NOT EXISTS fulfillment_rating INTEGER,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.order_feedback
  DROP CONSTRAINT IF EXISTS order_feedback_status_check,
  DROP CONSTRAINT IF EXISTS order_feedback_product_rating_check,
  DROP CONSTRAINT IF EXISTS order_feedback_service_rating_check,
  DROP CONSTRAINT IF EXISTS order_feedback_fulfillment_rating_check;

UPDATE public.order_feedback
SET product_rating = COALESCE(product_rating, rating),
    service_rating = COALESCE(service_rating, rating),
    fulfillment_rating = COALESCE(fulfillment_rating, rating),
    status = CASE
      WHEN LOWER(COALESCE(status, '')) = 'invalid' THEN 'acknowledged'
      WHEN LOWER(COALESCE(status, '')) IN ('new', 'viewed', 'acknowledged') THEN LOWER(status)
      ELSE 'new'
    END;

ALTER TABLE IF EXISTS public.order_feedback
  ALTER COLUMN status SET DEFAULT 'new',
  ADD CONSTRAINT order_feedback_status_check
    CHECK (status IN ('new', 'viewed', 'acknowledged')),
  ADD CONSTRAINT order_feedback_product_rating_check
    CHECK (product_rating IS NULL OR product_rating BETWEEN 1 AND 5),
  ADD CONSTRAINT order_feedback_service_rating_check
    CHECK (service_rating IS NULL OR service_rating BETWEEN 1 AND 5),
  ADD CONSTRAINT order_feedback_fulfillment_rating_check
    CHECK (fulfillment_rating IS NULL OR fulfillment_rating BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS order_feedback_status_submitted_at_idx
ON public.order_feedback (status, submitted_at DESC);

CREATE OR REPLACE FUNCTION public.touch_order_feedback_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_feedback_updated_at ON public.order_feedback;
CREATE TRIGGER set_order_feedback_updated_at
BEFORE UPDATE ON public.order_feedback
FOR EACH ROW EXECUTE FUNCTION public.touch_order_feedback_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_duplicate_order_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Serialize submissions for one order before checking for an existing row.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.order_id::TEXT));

  IF EXISTS (
    SELECT 1
    FROM public.order_feedback
    WHERE order_id = NEW.order_id
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Feedback has already been submitted for this order.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_order_feedback ON public.order_feedback;
CREATE TRIGGER prevent_duplicate_order_feedback
BEFORE INSERT ON public.order_feedback
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_order_feedback();

ALTER TABLE public.order_feedback REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_feedback'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_feedback;
  END IF;
END $$;
