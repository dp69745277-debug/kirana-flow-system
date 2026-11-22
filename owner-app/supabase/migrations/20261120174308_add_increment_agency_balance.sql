/*
# Add increment_agency_balance helper

1. New Function
- `increment_agency_balance(p_agency_id uuid, p_delta numeric)` — SECURITY DEFINER,
  atomically adds `p_delta` to an agency's payable balance. Used when stock is
  purchased on credit ("Added to Agency Balance").

2. Security
- Executable by `authenticated` only. RLS on `agencies` still constrains which
  agencies a caller may touch because the function verifies membership of the
  agency's store before applying the change.
*/

CREATE OR REPLACE FUNCTION public.increment_agency_balance(p_agency_id uuid, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.agencies a
    WHERE a.id = p_agency_id
      AND EXISTS (
        SELECT 1 FROM public.store_users su
        WHERE su.store_id = a.store_id
          AND su.auth_user_id = auth.uid()
          AND su.is_active = true
      )
  ) THEN
    RAISE EXCEPTION 'Agency not found or not permitted';
  END IF;

  UPDATE public.agencies
     SET balance = balance + p_delta
   WHERE id = p_agency_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_agency_balance(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_agency_balance(uuid, numeric) TO authenticated;