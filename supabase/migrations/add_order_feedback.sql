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
