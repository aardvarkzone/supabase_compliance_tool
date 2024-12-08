import { createClient } from '@supabase/supabase-js';

export type SupabaseCredentials = {
  url: string;
  serviceRoleKey: string;
  managementApiKey: string;
  projectRef?: string; // Optional for functions that derive it dynamically
};

// Minimal credentials for creating a Supabase client
export type ClientCredentials = Pick<SupabaseCredentials, 'url' | 'serviceRoleKey'>;

// Create a Supabase client using minimal credentials
export const createSupabaseClient = ({ url, serviceRoleKey }: ClientCredentials) => {
  if (!url || !serviceRoleKey) {
    throw new Error('Missing required Supabase credentials: `url` or `serviceRoleKey`');
  }
  return createClient(url, serviceRoleKey);
};

// Call Supabase Management API with a valid management API key
export const callManagementApi = async (
  endpoint: string,
  { managementApiKey }: Pick<SupabaseCredentials, 'managementApiKey'>,
  options: RequestInit = {}
) => {
  if (!managementApiKey) {
    throw new Error('Missing required Supabase credential: `managementApiKey`');
  }

  try {
    const response = await fetch(`https://api.supabase.com/v1/${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${managementApiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(
        `Management API call failed: ${response.status} ${response.statusText}. Details: ${errorDetails}`
      );
    }

    return response.json();
  } catch (error: any) {
    throw new Error(`Error during Management API call: ${error.message}`);
  }
};
