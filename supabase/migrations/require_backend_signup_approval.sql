-- Enable this function as Authentication > Hooks > Before User Created.
-- The caller cannot forge a usable approval: only the service role can create
-- it in audit_logs, and consumption is atomic, bound to the email and expires.
begin;
create or replace function public.require_backend_signup_approval(event jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  signup_email text := lower(trim(event->'user'->>'email'));
  approval text := event->'user'->'user_metadata'->>'registration_approval';
  trusted_metadata jsonb := coalesce(event->'user'->'app_metadata', '{}'::jsonb);
  consumed_id uuid;
begin
  -- Staff/admin provisioning uses service-role-only app_metadata, never the
  -- editable user_metadata.role field supplied by a customer.
  if trusted_metadata->>'provisioned_by_backend' = 'true'
     and trusted_metadata->>'application_role' in ('admin', 'staff') then
    return '{}'::jsonb;
  end if;
  if signup_email is null or signup_email !~ '^[a-z0-9]+(\.[a-z0-9]+)*(\+[a-z0-9]+([._-][a-z0-9]+)*)?@gmail\.com$'
     or approval is null or length(approval) <> 36 then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Please register through the shop signup page using your usual Gmail address.'));
  end if;
  delete from public.audit_logs
  where action = 'customer_signup_approved'
    and metadata->>'approval' = approval
    and metadata->>'email' = signup_email
    and created_at > now() - interval '10 minutes'
  returning id into consumed_id;
  if consumed_id is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Please register through the shop signup page using your usual Gmail address.'));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke execute on function public.require_backend_signup_approval(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.require_backend_signup_approval(jsonb) to supabase_auth_admin;
commit;
