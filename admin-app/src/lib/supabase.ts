import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://csfcnektkkxgzvinjayn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzZmNuZWt0a2t4Z3p2aW5qYXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NTI3MzIsImV4cCI6MjEwODQyODczMn0.YBcjf1vZTshtgJO_bBt6ctio8FR-wa-SuAZBpdrxYd8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
