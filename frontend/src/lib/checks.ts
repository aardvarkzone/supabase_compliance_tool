import { SupabaseClient } from '@supabase/supabase-js';
import { callManagementApi, type SupabaseCredentials } from './utils';

export type CheckResult = {
  status: 'pass' | 'fail' | 'pending' | 'error';
  details?: any;
  message?: string;
};

type SubscriptionResponse = {
  tier: string;
  [key: string]: any;
};

type BackupInfo = {
  pitr_enabled: boolean;
  [key: string]: any;
};

const extractProjectRef = (url: string): string | null => {
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : null;
};

export async function checkMFA(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;

    const userMFAStatus = users.map(user => ({
      email: user.email,
      mfaEnabled: Boolean(user.factors?.length),
    }));

    const allEnabled = userMFAStatus.every(user => user.mfaEnabled);
    const enabledCount = userMFAStatus.filter(user => user.mfaEnabled).length;

    return {
      status: allEnabled ? 'pass' : 'fail',
      details: userMFAStatus,
      message: allEnabled
        ? `MFA is enabled for all ${userMFAStatus.length} users`
        : `MFA is enabled for ${enabledCount} out of ${userMFAStatus.length} users`,
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: `Failed to check MFA status: ${error.message}`,
      details: error,
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
        details: [],
      };
    }

    const allEnabled = data.every((table: any) => table.rls_enabled);
    const enabledCount = data.filter((table: any) => table.rls_enabled).length;

    return {
      status: allEnabled ? 'pass' : 'fail',
      details: data,
      message: allEnabled
        ? `RLS is enabled on all ${data.length} tables`
        : `RLS is enabled on ${enabledCount} out of ${data.length} tables`,
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: 'Failed to check RLS: ' + error.message,
      details: error,
    };
  }
}

export async function checkPITR(credentials: SupabaseCredentials): Promise<CheckResult> {
  const projectRef = extractProjectRef(credentials.url);
  if (!projectRef) {
    return {
      status: 'error',
      message: 'Invalid Supabase URL. Unable to extract project reference.',
      details: { url: credentials.url },
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
        },
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
        },
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
        },
      };
    } catch (error) {
      return {
        status: 'fail',
        message: 'Point in Time Recovery is available but not configured. You can enable it in your project settings.',
        details: {
          tier: subscription.tier,
          recommendation: 'Configure PITR in project settings',
          error: error instanceof Error ? error.message : 'Unknown error'
        },
      };
    }
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to check PITR status. Please verify your credentials and try again.',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        recommendation: 'Verify your Management API key and project URL'
      },
    };
  }
}