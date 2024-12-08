'use client'

import { useState } from 'react'
import { createSupabaseClient, type SupabaseCredentials } from '@/lib/supabase'
import { 
  checkMFA, 
  checkRLS, 
  checkPITR, 
  enableMFA,
  enableRLS,
  enablePITR,
  type CheckResult 
} from '@/lib/checks'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Results = {
  mfa: CheckResult
  rls: CheckResult
  pitr: CheckResult
}

type EvidenceEntry = {
  timestamp: string
  check: string
  status: string
  details: string
}

export default function ComplianceChecker() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fixing, setFixing] = useState(false)
  const [credentials, setCredentials] = useState<SupabaseCredentials>({
    url: '',
    serviceRoleKey: '',
    projectRef: '',
    managementApiKey: ''
  })
  const [results, setResults] = useState<Results>({
    mfa: { status: 'pending' },
    rls: { status: 'pending' },
    pitr: { status: 'pending' }
  })
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([])

  const validateCredentials = () => {
    if (!credentials.url.includes('supabase.co')) {
      setError('Invalid Project URL. Must be a Supabase URL (e.g., https://project.supabase.co)')
      return false
    }
    if (!credentials.serviceRoleKey.startsWith('eyJ')) {
      setError('Invalid Service Role Key. Must start with "eyJ"')
      return false
    }
    if (!credentials.projectRef) {
      setError('Project Reference is required')
      return false
    }
    if (!credentials.managementApiKey.startsWith('sbp_')) {
      setError('Invalid Management API Key. Must start with "sbp_"')
      return false
    }
    setError('')
    return true
  }
  const extractProjectRef = (url: string) => {
    try {
      const subdomain = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
      if (subdomain) {
        setCredentials(prev => ({ ...prev, projectRef: subdomain }))
      }
    } catch (e) {
      console.error('Failed to extract project ref from URL')
    }
  }

  const handleUrlChange = (url: string) => {
    setCredentials(prev => ({ ...prev, url }))
    extractProjectRef(url)
  }

  const handleRunChecks = async () => {
    if (!validateCredentials()) return
    
    try {
      setLoading(true)
      setError('')
      const supabase = createSupabaseClient(credentials)
      
      const [mfaResult, rlsResult, pitrResult] = await Promise.all([
        checkMFA(supabase).catch(e => ({ 
          status: 'error' as const, 
          message: `MFA Check Error: ${e.message}`,
          details: e.details 
        })),
        checkRLS(supabase).catch(e => ({ 
          status: 'error' as const, 
          message: `RLS Check Error: ${e.message}`,
          details: e.details
        })),
        checkPITR(credentials).catch(e => ({ 
          status: 'error' as const, 
          message: `PITR Check Error: ${e.message}`,
          details: e.details
        }))
      ])

      const timestamp = new Date().toISOString()
      const newEvidence = [
        {
          timestamp,
          check: 'MFA',
          status: mfaResult.status,
          details: mfaResult.message || ''
        },
        {
          timestamp,
          check: 'RLS',
          status: rlsResult.status,
          details: rlsResult.message || ''
        },
        {
          timestamp,
          check: 'PITR',
          status: pitrResult.status,
          details: pitrResult.message || ''
        }
      ]

      setEvidence(prev => [...prev, ...newEvidence])
      setResults({
        mfa: mfaResult,
        rls: rlsResult,
        pitr: pitrResult
      })
    } catch (error: any) {
      setError(`Failed to run checks: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const renderCheckDetails = (result: CheckResult) => {
    if (result.status === 'error') {
      return (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            {result.message || 'An error occurred during the check'}
            {result.details && (
              <details className="mt-2">
                <summary className="cursor-pointer">Technical Details</summary>
                <pre className="mt-2 whitespace-pre-wrap text-sm">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              </details>
            )}
          </AlertDescription>
        </Alert>
      )
    }

    return result.message && (
      <p className="mt-2 text-sm text-gray-600">{result.message}</p>
    )
  }

  const getTroubleshootingTips = (key: string, result: CheckResult) => {
    if (result.status !== 'error') return null

    const tips: Record<string, string[]> = {
      mfa: [
        'Ensure the auth_users() function is created in your database',
        'Check if your service role key has the correct permissions',
        'Verify that auth schema is accessible'
      ],
      rls: [
        'Ensure your service role key has access to information_schema',
        'Check if the database user has sufficient privileges',
        'Verify table permissions are correctly set'
      ],
      pitr: [
        'Verify your project reference is correct',
        'Ensure your service role key has admin access',
        'Check if your project subscription supports PITR'
      ]
    }

    return tips[key] && (
      <div className="mt-4 bg-blue-50 p-4 rounded-md">
        <h4 className="text-sm font-medium text-blue-800 mb-2">Troubleshooting Tips:</h4>
        <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
          {tips[key].map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-8 card-override">
          <CardHeader>
            <CardTitle className="text-white">Supabase Project Credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-base font-semibold mb-1 text-white">Project URL</label>
              <Input
                value={credentials.url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="input-override font-mono"
              />
            </div>
            
            <div>
              <label className="block text-base font-semibold mb-1 text-white">Service Role Key</label>
              <Input
                type="password"
                value={credentials.serviceRoleKey}
                onChange={(e) => setCredentials(prev => ({ ...prev, serviceRoleKey: e.target.value }))}
                placeholder="eyJhbG..."
                className="input-override font-mono"
              />
            </div>

            <div>
              <label className="block text-base font-semibold mb-1 text-white">Project Reference</label>
              <Input
                value={credentials.projectRef}
                onChange={(e) => setCredentials(prev => ({ ...prev, projectRef: e.target.value }))}
                placeholder="Found in project URL or settings"
                className="input-override font-mono"
              />
              <p className="text-sm mt-1 text-gray-300">
                This is the subdomain from your project URL
              </p>
            </div>

            <div>
              <label className="block text-base font-semibold mb-1 text-white">Management API Key</label>
              <Input
                type="password"
                value={credentials.managementApiKey}
                onChange={(e) => setCredentials(prev => ({ ...prev, managementApiKey: e.target.value }))}
                placeholder="sbp_..."
                className="input-override font-mono"
              />
              <p className="text-sm mt-1 text-gray-300">
                Found at https://supabase.com/dashboard/account/tokens
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-override">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Compliance Status</CardTitle>
            <Button
              onClick={handleRunChecks}
              disabled={loading || !credentials.url || !credentials.serviceRoleKey || !credentials.projectRef || !credentials.managementApiKey}
              className="button-override"
            >
              {loading ? 'Running Checks...' : 'Run Checks'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(results).map(([key, result]) => (
              <div key={key} className="border border-gray-700 rounded-lg p-4 bg-gray-800/30">
                <h3 className="text-lg font-bold text-white mb-2">
                  {key === 'mfa' && 'Multi-Factor Authentication (MFA)'}
                  {key === 'rls' && 'Row Level Security (RLS)'}
                  {key === 'pitr' && 'Point in Time Recovery (PITR)'}
                </h3>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
                  ${result.status === 'pass' ? 'bg-green-900/50 text-green-200' : 
                    result.status === 'fail' ? 'bg-red-900/50 text-red-200' :
                    result.status === 'error' ? 'bg-yellow-900/50 text-yellow-200' :
                    'bg-gray-700/50 text-gray-200'}`
                }>
                  Status: {result.status}
                </div>
                
                {result.message && (
                  <p className="mt-3 text-gray-300">{result.message}</p>
                )}

                {result.details && (
                  <div className="mt-4">
                    <details className="group">
                      <summary className="text-gray-300 cursor-pointer hover:text-yellow-500">
                        View Technical Details
                      </summary>
                      <pre className="mt-2 p-4 bg-gray-900/50 rounded-md overflow-auto text-gray-300 border border-gray-700">
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}