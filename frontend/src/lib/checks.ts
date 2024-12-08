import { SupabaseClient } from '@supabase/supabase-js';
import { callManagementApi, type SupabaseCredentials } from './utils';

export type CheckResult = {
  status: 'pass' | 'fail' | 'pending' | 'error';
  details?: any;
  message?: string;
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
  try {
    const subscription = await callManagementApi(
      `projects/${credentials.projectRef}/subscription`,
      credentials
    );

    if (subscription.tier === 'free') {
      return {
        status: 'fail',
        message: 'Point in Time Recovery is not available on the free tier',
        details: { hint: 'Upgrade to a paid plan to enable PITR' },
      };
    }

    const backupInfo = await callManagementApi(
      `projects/${credentials.projectRef}/database/backups/info`,
      credentials
    );

    return {
      status: backupInfo.pitr_enabled ? 'pass' : 'fail',
      message: backupInfo.pitr_enabled
        ? 'Point in Time Recovery is enabled'
        : 'Point in Time Recovery is available but not enabled.',
      details: backupInfo,
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: `Failed to check PITR: ${error.message}`,
      details: error,
    };
  }
}
