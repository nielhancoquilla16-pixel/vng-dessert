ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS qr_token TEXT,
  ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qr_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_method TEXT;

UPDATE public.orders
SET verification_required = (
  NOT (
    LOWER(COALESCE(delivery_method, 'pickup')) = 'delivery'
    AND LOWER(COALESCE(payment_method, 'cash')) = 'cash'
  )
)
WHERE verification_required IS DISTINCT FROM (
  NOT (
    LOWER(COALESCE(delivery_method, 'pickup')) = 'delivery'
    AND LOWER(COALESCE(payment_method, 'cash')) = 'cash'
  )
);

UPDATE public.orders
SET qr_token = CONCAT('VNGQR-', UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 20)))
WHERE verification_required = TRUE
  AND qr_token IS NULL;

UPDATE public.orders
SET qr_generated_at = COALESCE(qr_generated_at, created_at, TIMEZONE('utc', NOW()))
WHERE qr_token IS NOT NULL;

UPDATE public.orders
SET qr_used_at = COALESCE(qr_used_at, qr_claimed_at)
WHERE qr_used_at IS NULL
  AND qr_claimed_at IS NOT NULL;

UPDATE public.orders
SET verified_at = COALESCE(verified_at, qr_used_at, qr_claimed_at)
WHERE verified_at IS NULL
  AND (qr_used_at IS NOT NULL OR qr_claimed_at IS NOT NULL);

UPDATE public.orders
SET verification_method = 'manual'
WHERE verification_method IS NULL
  AND verified_at IS NOT NULL;

UPDATE public.orders
SET qr_token = NULL,
    qr_generated_at = NULL,
    qr_used_at = NULL
WHERE verification_required = FALSE;

ALTER TABLE IF EXISTS public.orders
  DROP CONSTRAINT IF EXISTS orders_verification_method_check;

ALTER TABLE IF EXISTS public.orders
  ADD CONSTRAINT orders_verification_method_check
  CHECK (
    verification_method IS NULL
    OR verification_method IN ('qr', 'order_id', 'manual')
  );

CREATE UNIQUE INDEX IF NOT EXISTS orders_qr_token_unique_idx
ON public.orders (qr_token)
WHERE qr_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_qr_used_at_idx
ON public.orders (qr_used_at);
