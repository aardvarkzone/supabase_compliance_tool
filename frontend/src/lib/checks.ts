import { SupabaseClient } from '@supabase/supabase-js';
import { callManagementApi, type SupabaseCredentials } from './utils';

// Type Definitions
export type JSONValue = 
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

export type CheckResult = {
  status: 'pass' | 'fail' | 'pending' | 'error';
  details: JSONValue;
  message: string;
};

export type TableInfo = {
  table_name: string;
  rls_enabled: boolean;
  schema: string;
};

type UserMFAStatus = {
  email: string | null | undefined;
  mfaEnabled: boolean;
};

type SubscriptionResponse = {
  tier: string;
  [key: string]: JSONValue;
};

type BackupInfo = {
  pitr_enabled: boolean;
  [key: string]: JSONValue;
};

// Helper Functions
const extractProjectRef = (url: string): string | null => {
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : null;
};

const safeJsonValue = (error: unknown): JSONValue => {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack || '',
    };
  }
  return String(error);
};

// Main Check Functions
export async function checkMFA(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;

    const userMFAStatus: UserMFAStatus[] = users.map(user => ({
      email: user.email,
      mfaEnabled: Boolean(user.factors?.length),
    }));

    const allEnabled = userMFAStatus.every(user => user.mfaEnabled);
    const enabledCount = userMFAStatus.filter(user => user.mfaEnabled).length;

    return {
      status: allEnabled ? 'pass' : 'fail',
      details: userMFAStatus as JSONValue,
      message: allEnabled
        ? `MFA is enabled for all ${userMFAStatus.length} users`
        : `MFA is enabled for ${enabledCount} out of ${userMFAStatus.length} users`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to check MFA status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: safeJsonValue(error),
    };
  }
}

export async function checkRLS(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    const { data, error } = await supabase.rpc('get_tables_info');
    if (error || !data) {
      return {
        status: 'pass',
        message: 'No public tables found or RLS configuration not needed yet.',
        details: [] as JSONValue
      };
    }

    // Type the table structure but still allow flexible data
    type TableData = {
      rls_enabled: boolean;
      [key: string]: unknown;
    };

    const tableData = data as TableData[];
    const allEnabled = tableData.every(table => table.rls_enabled);
    const enabledCount = tableData.filter(table => table.rls_enabled).length;

    return {
      status: allEnabled ? 'pass' : 'fail',
      details: data as JSONValue,
      message: allEnabled
        ? `RLS is enabled on all ${tableData.length} tables`
        : `RLS is enabled on ${enabledCount} out of ${tableData.length} tables`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      status: 'error',
      message: 'Failed to check RLS: ' + errorMessage,
      details: { error: errorMessage } as JSONValue
    };
  }
}

export async function checkPITR(credentials: SupabaseCredentials): Promise<CheckResult> {
  const projectRef = extractProjectRef(credentials.url);
  if (!projectRef) {
    return {
      status: 'error',
      message: 'Invalid Supabase URL. Unable to extract project reference.',
      details: { url: credentials.url } as JSONValue,
    };
  }

  try {
    let subscription: SubscriptionResponse;
    
    try {
      subscription = await callManagementApi(
        `projects/${projectRef}/subscription`,
        credentials
      ) as SubscriptionResponse;
    } catch (error) {
      return {
        status: 'fail',
        message: 'Point in Time Recovery (PITR) is not available on the free tier. Upgrade to Pro plan or higher to enable this feature.',
        details: {
          currentTier: 'free',
          recommendation: 'Upgrade to Pro plan or higher',
          learnMore: 'https://supabase.com/pricing'
        } as JSONValue,
      };
    }

    if (subscription.tier.toLowerCase() === 'free') {
      return {
        status: 'fail',
        message: 'Point in Time Recovery (PITR) is not available on the free tier. Upgrade to Pro plan or higher to enable this feature.',
        details: {
          currentTier: 'free',
          recommendation: 'Upgrade to Pro plan or higher',
          learnMore: 'https://supabase.com/pricing'
        } as JSONValue,
      };
    }

    try {
      const backupInfo = await callManagementApi(
        `projects/${projectRef}/database/backups/info`,
        credentials
      ) as BackupInfo;

      return {
        status: backupInfo.pitr_enabled ? 'pass' : 'fail',
        message: backupInfo.pitr_enabled
          ? 'Point in Time Recovery is enabled'
          : 'Point in Time Recovery is available but not enabled. You can enable it in your project settings.',
        details: {
          ...backupInfo,
          tier: subscription.tier,
          configuration: backupInfo.pitr_enabled ? 'enabled' : 'disabled'
        } as JSONValue,
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Point in Time Recovery is available but not configured. You can enable it in your project settings.',
        details: {
          tier: subscription.tier,
          recommendation: 'Configure PITR in project settings',
          error: error instanceof Error ? error.message : String(error)
        } as JSONValue,
      };
    }
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to check PITR status. Please verify your credentials and try again.',
      details: safeJsonValue(error),
    };
  }
}