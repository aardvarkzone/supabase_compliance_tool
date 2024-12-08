import { createClient } from '@supabase/supabase-js'

export type SupabaseCredentials = {
  url: string
  serviceRoleKey: string  // Changed from 'key'
  projectRef: string
  managementApiKey: string
}

export const createSupabaseClient = (credentials: SupabaseCredentials) => {
  return createClient(credentials.url, credentials.serviceRoleKey)
}

// Helper function for Management API calls
export const callManagementApi = async (
  endpoint: string, 
  credentials: SupabaseCredentials, 
  options: RequestInit = {}
) => {
  const response = await fetch(`https://api.supabase.com/v1/${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${credentials.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }

  return response.json();
}