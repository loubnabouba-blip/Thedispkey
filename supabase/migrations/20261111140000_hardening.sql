-- Opvolging van de Supabase-beveiligingscheck (function_search_path_mutable):
-- vaste search_path op de twee hulpfuncties zonder SECURITY DEFINER.
alter function public._gm_tier_n(text) set search_path = '';
alter function public._gm_roll_tier(jsonb, boolean) set search_path = public;
