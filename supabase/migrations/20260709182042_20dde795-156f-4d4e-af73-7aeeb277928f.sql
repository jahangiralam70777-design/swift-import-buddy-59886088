-- Fix: allow authenticated users to call has_role via PostgREST RPC.
-- The function is SECURITY DEFINER with a locked search_path, so granting
-- EXECUTE is safe — it only reveals whether the caller (or the uuid passed)
-- has a given role, which is required by every admin server function.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;