import { createClient } from '@supabase/supabase-js';

export type ClientCredentials = {
  url: string;
  serviceRoleKey: string;
};

export type SupabaseCredentials = ClientCredentials & {
  managementApiKey: string;
};

export const createSupabaseClient = ({ url, serviceRoleKey }: ClientCredentials) => {
  if (!url || !serviceRoleKey) {
    throw new Error('Missing required client credentials: `url` or `serviceRoleKey`');
  }
  return createClient(url, serviceRoleKey);
};

export const callManagementApi = async (
  endpoint: string,
  { managementApiKey }: Pick<SupabaseCredentials, 'managementApiKey'>,
  options: RequestInit = {}
) => {
  if (!managementApiKey) {
    throw new Error('Missing required management API key');
  }

  const response = await fetch(`https://api.supabase.com/v1/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${managementApiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call failed: ${response.status} ${response.statusText}. ${errorText}`);
  }

  return response.json();
};
