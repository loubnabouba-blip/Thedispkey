/* Supabase-koppeling voor account, synchronisatie en gamificatie.
   - url: project-URL (Supabase-dashboard > Project Settings > API).
   - key: de publishable key (sb_publishable_...) of de legacy anon key. Deze sleutel is
     bedoeld voor de browser; de beveiliging zit in de RLS-policies en SECURITY DEFINER-functies
     uit supabase/migrations/. Zet hier NOOIT de service_role- of secret key neer.
   Zolang key leeg is, draait de app volledig lokaal zoals voorheen. */
window.DK_SUPABASE = {
  url: 'https://axdbdoinogjfsjejqrox.supabase.co',
  key: ''
};
