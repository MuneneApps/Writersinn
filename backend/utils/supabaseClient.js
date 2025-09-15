// backend/utils/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Load env variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // server only

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

// create supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false } // server-side sessions only
});
