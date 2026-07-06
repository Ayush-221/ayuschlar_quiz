import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase environment variables are missing! Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

// Resilient initialization for build time
const finalUrl = supabaseUrl || 'https://placeholder-url-for-build.supabase.co';
const finalKey = supabaseKey || 'placeholder-key-for-build';

export const supabase = createClient(finalUrl, finalKey, {
  auth: {
    persistSession: false, // Server-side client, no session persistence needed
  },
});
