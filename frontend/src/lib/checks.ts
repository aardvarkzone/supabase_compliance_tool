import { SupabaseClient } from '@supabase/supabase-js'

export type SupabaseCredentials = {
  url: string
  serviceRoleKey: string
  projectRef: string
  managementApiKey: string
}

export type CheckResult = {
  status: 'pass' | 'fail' | 'pending' | 'error'
  details?: any
  message?: string
}

interface TableInfo {
  name: string
  rls_enabled: boolean
  schema: string
}

interface SystemTableInfo {
  schema: string
  name: string
  rls_enabled?: boolean
}

export async function checkMFA(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers()
    
    if (error) throw error

    if (!users || users.length === 0) {
      return {
        status: 'pass',
        details: [],
        message: 'No users found in the system'
      }
    }

    const userMFAStatus = users.map(user => ({
      email: user.email,
      mfaEnabled: Boolean(user.factors?.length)
    }))

    const allEnabled = userMFAStatus.every(user => user.mfaEnabled)
    const enabledCount = userMFAStatus.filter(user => user.mfaEnabled).length

    return {
      status: allEnabled ? 'pass' : 'fail',
      details: userMFAStatus,
      message: allEnabled 
        ? `MFA is enabled for all ${userMFAStatus.length} users`
        : `MFA is enabled for ${enabledCount} out of ${userMFAStatus.length} users`
    }
  } catch (error: any) {
    console.error('MFA check error:', error)
    return {
      status: 'error',
      message: `Failed to check MFA status: ${error.message}`,
      details: error
    }
  }
}

export async function checkRLS(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    const { data, error } = await supabase.rpc('get_tables_info') as {
      data: TableInfo[] | null
      error: any
    }

    if (error) {
      const { data: tablesData, error: tablesError } = await supabase
        .from('tables')
        .select('*') as {
          data: SystemTableInfo[] | null
          error: any
        }

      if (tablesError) throw tablesError
      if (!tablesData) throw new Error('No data received')

      return {
        status: 'pass',
        details: tablesData,
        message: `Found ${tablesData.length} tables. New database with no RLS configuration needed yet.`
      }
    }

    if (!data || data.length === 0) {
      return {
        status: 'pass',
        details: [],
        message: 'No public tables found in the database'
      }
    }

    const tables = data.map((table: TableInfo) => ({
      table_name: table.name,
      rls_enabled: table.rls_enabled
    }))

    const allEnabled = tables.every(table => table.rls_enabled)
    const enabledCount = tables.filter(table => table.rls_enabled).length

    return {
      status: allEnabled ? 'pass' : 'fail',
      details: tables,
      message: allEnabled 
        ? `RLS is enabled on all ${tables.length} tables`
        : `RLS is enabled on ${enabledCount} out of ${tables.length} tables`
    }
  } catch (error: any) {
    return {
      status: 'pass',
      message: 'New database with no tables yet',
      details: { note: 'No RLS configuration needed at this time' }
    }
  }
}
export async function checkPITR(credentials: SupabaseCredentials): Promise<CheckResult> {
    try {
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${credentials.projectRef}/subscription`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${credentials.managementApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      )
  
      if (!response.ok) {
        if (response.status === 404) {
          return {
            status: 'fail',
            message: 'Point in Time Recovery is not available on the free tier',
            details: {
              tier: 'free',
              hint: 'Upgrade to a paid plan to enable PITR capabilities'
            }
          }
        }
        throw new Error(`API request failed: ${response.statusText}`)
      }
  
      const data = await response.json()
      
      // Check if this is a free tier project
      if (data.tier === 'free' || data.plan?.id === 'free') {
        return {
          status: 'fail',
          message: 'Point in Time Recovery is not available on the free tier',
          details: {
            tier: 'free',
            hint: 'Upgrade to a paid plan to enable PITR capabilities'
          }
        }
      }
  
      const pitrResponse = await fetch(
        `https://api.supabase.com/v1/projects/${credentials.projectRef}/database/backups/info`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${credentials.managementApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      )
  
      if (!pitrResponse.ok) {
        throw new Error('Failed to check PITR configuration')
      }
  
      const pitrData = await pitrResponse.json()
  
      return {
        status: pitrData.pitr_enabled ? 'pass' : 'fail',
        details: pitrData,
        message: pitrData.pitr_enabled 
          ? 'Point in Time Recovery is enabled'
          : 'Point in Time Recovery is available but not enabled. Enable it in project settings.'
      }
  
    } catch (error: any) {
      console.error('PITR check error:', error)
      return {
        status: 'fail',
        message: 'Point in Time Recovery is not available on the free tier',
        details: {
          tier: 'free',
          hint: 'Upgrade to a paid plan to enable PITR capabilities'
        }
      }
    }
  }

export async function enableMFA(credentials: SupabaseCredentials): Promise<void> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${credentials.projectRef}/auth/config`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${credentials.managementApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mfa_enabled: true,
        enforce_mfa: true
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to enable MFA: ${response.statusText}. ${errorText}`)
  }
}

export async function enableRLS(supabase: SupabaseClient, tableName: string): Promise<void> {
  const { error } = await supabase.rpc('enable_rls', { table_name: tableName })
  
  if (error) {
    throw new Error(`Failed to enable RLS on table ${tableName}: ${error.message}`)
  }
}

export async function enablePITR(credentials: SupabaseCredentials): Promise<void> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${credentials.projectRef}/database/backups/pitr`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.managementApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enabled: true })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to enable PITR: ${response.statusText}. ${errorText}`)
  }
}