-- Phase 2: custom_access_token_hook rejects non-active users (PER-02).
--
-- Phase 1 minted tokens for every user row unconditionally. Phase 2 adds
-- a lifecycle `status` column (pending / active / inactive / rejected)
-- to public.users and self-registration flows that create 'pending' rows
-- BEFORE auth.users exists. The hook must refuse to mint claims for any
-- user whose shadow row is not currently 'active' so pending / inactive
-- / rejected users cannot log in even if an auth.users row somehow
-- exists for them. The hook RAISES 'account_not_active' so Supabase Auth
-- surfaces a clear error the login UX can translate (Research Pattern 8
-- §2, Pitfall 5).
--
-- The claims shape for active users is IDENTICAL to Phase 1 — this is a
-- non-breaking change for existing sessions.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
   where u.id = v_user_id
     and u.status = 'active';

  if v_school_id is null then
    raise exception 'account_not_active'
      using hint = 'Your account is not active. Contact a school administrator.';
  end if;

  select coalesce(array_agg(ur.role::text), array[]::text[])
    into v_roles
    from public.user_roles ur
   where ur.user_id = v_user_id;

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
