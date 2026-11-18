import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleStatusRequest } from './handler.mjs';

Deno.serve((request: Request) => handleStatusRequest(request, {
  makeUserDb(authorization: string) {
    return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
  },
  makeAdminDb() {
    return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
}));
