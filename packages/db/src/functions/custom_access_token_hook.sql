-- public.custom_access_token_hook: Supabase Auth custom access token hook.
--
-- Registered via supabase/config.toml (or the Dashboard) so Supabase Auth
-- invokes it whenever an access token is minted or refreshed. Adds three
-- claims to the JWT:
--   - school_id    (uuid)        — drives every RLS policy
--   - roles        (text[])      — full set of roles assigned to the user
--   - active_role  (text)        — default role at login (user_roles.is_default)
--
-- The function is SECURITY-DEFINER-equivalent because supabase_auth_admin
-- is the only role granted EXECUTE on it; authenticated/anon/public are
-- explicitly REVOKEd. supabase_auth_admin already has access to public.users
-- and public.user_roles via Supabase's default grants.
--
-- See research §Pattern 2 and
-- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims        jsonb;
  v_user_id     uuid;
  v_school_id   uuid;
  v_roles       text[];
  v_active_role text;
begin
  v_user_id := (event ->> 'user_id')::uuid;

  select u.school_id
    into v_school_id
    from public.users u
   where u.id = v_user_id;

  select coalesce(array_agg(ur.role::text), array[]::text[])
    into v_roles
    from public.user_roles ur
   where ur.user_id = v_user_id;

  -- Pick the default role; fall back to the first role if none flagged.
  select ur.role::text
    into v_active_role
    from public.user_roles ur
   where ur.user_id = v_user_id
     and ur.is_default = true
   limit 1;

  if v_active_role is null and array_length(v_roles, 1) > 0 then
    v_active_role := v_roles[1];
  end if;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  if v_school_id is not null then
    claims := jsonb_set(claims, '{school_id}', to_jsonb(v_school_id));
  end if;
  claims := jsonb_set(claims, '{roles}', to_jsonb(v_roles));
  if v_active_role is not null then
    claims := jsonb_set(claims, '{active_role}', to_jsonb(v_active_role));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Lock down execution: only Supabase Auth's internal admin role may call it.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
