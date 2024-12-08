'use client';

import { useState } from 'react';
import { createSupabaseClient, type ClientCredentials, type SupabaseCredentials } from '@/lib/supabase';
import { 
  checkMFA, 
  checkRLS, 
  checkPITR, 
  type CheckResult 
} from '@/lib/checks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import EvidenceLog from '@/components/EvidenceLog';

type Results = {
  mfa: CheckResult;
  rls: CheckResult;
  pitr: CheckResult;
};

type EvidenceEntry = {
  timestamp: string;
  check: string;
  status: string;
  details: string;
};

export default function ComplianceChecker() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState<SupabaseCredentials>({
    url: '',
    serviceRoleKey: '',
    managementApiKey: ''
  });
  const [results, setResults] = useState<Results>({
    mfa: { status: 'pending' },
    rls: { status: 'pending' },
    pitr: { status: 'pending' }
  });
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);

  const clearEvidence = () => {
    if (window.confirm('Are you sure you want to clear all evidence logs?')) {
      setEvidence([]);
    }
  };

  const extractProjectRef = (url: string): string | null => {
    const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
    return match ? match[1] : null;
  };

  const validateCredentials = (): boolean => {
    const projectRef = extractProjectRef(credentials.url);
    if (!credentials.url.includes('supabase.co') || !projectRef) {
      setError('Invalid Project URL. Must be a Supabase URL (e.g., https://project.supabase.co)');
      return false;
    }
    if (!credentials.serviceRoleKey.startsWith('eyJ')) {
      setError('Invalid Service Role Key. Must start with "eyJ"');
      return false;
    }
    if (!credentials.managementApiKey.startsWith('sbp_')) {
      setError('Invalid Management API Key. Must start with "sbp_"');
      return false;
    }
    setError('');
    return true;
  };

  const handleRunChecks = async () => {
    if (!validateCredentials()) return;

    const projectRef = extractProjectRef(credentials.url)!;
    try {
      setLoading(true);
      setError('');

      const supabase = createSupabaseClient({
        url: credentials.url,
        serviceRoleKey: credentials.serviceRoleKey,
      });

      const [mfaResult, rlsResult, pitrResult] = await Promise.all([
        checkMFA(supabase).catch(e => ({
          status: 'error' as const,
          message: `MFA Check Error: ${e.message}`,
          details: e.details,
        })),
        checkRLS(supabase).catch(e => ({
          status: 'error' as const,
          message: `RLS Check Error: ${e.message}`,
          details: e.details,
        })),
        checkPITR({ ...credentials, projectRef }).catch(e => ({
          status: 'error' as const,
          message: `PITR Check Error: ${e.message}`,
          details: e.details,
        })),
      ]);

      const timestamp = new Date().toISOString();
      setEvidence(prev => [
        ...prev,
        { timestamp, check: 'MFA', status: mfaResult.status, details: mfaResult.message || '' },
        { timestamp, check: 'RLS', status: rlsResult.status, details: rlsResult.message || '' },
        { timestamp, check: 'PITR', status: pitrResult.status, details: pitrResult.message || '' },
      ]);
      setResults({ mfa: mfaResult, rls: rlsResult, pitr: pitrResult });
    } catch (error: any) {
      setError(`Failed to run checks: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

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
      );
    }

    return result.message && <p className="mt-2 text-sm text-gray-600">{result.message}</p>;
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-8 card-override">
          <CardHeader>
            <CardTitle className="text-white">Supabase Project Credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-white">Project URL</label>
              <Input
                value={credentials.url}
                onChange={(e) => setCredentials(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://your-project.supabase.co"
                className="input-override font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-white">Service Role Key</label>
              <Input
                type="password"
                value={credentials.serviceRoleKey}
                onChange={(e) => setCredentials(prev => ({ ...prev, serviceRoleKey: e.target.value }))}
                placeholder="eyJhbG..."
                className="input-override font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-white">Management API Key</label>
              <Input
                type="password"
                value={credentials.managementApiKey}
                onChange={(e) => setCredentials(prev => ({ ...prev, managementApiKey: e.target.value }))}
                placeholder="sbp_..."
                className="input-override font-mono"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="card-override">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Compliance Status</CardTitle>
            <Button
              onClick={handleRunChecks}
              disabled={loading || !credentials.url || !credentials.serviceRoleKey || !credentials.managementApiKey}
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
                <div
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    result.status === 'pass'
                      ? 'bg-green-900/50 text-green-200'
                      : result.status === 'fail'
                      ? 'bg-red-900/50 text-red-200'
                      : result.status === 'error'
                      ? 'bg-yellow-900/50 text-yellow-200'
                      : 'bg-gray-700/50 text-gray-200'
                  }`}
                >
                  Status: {result.status}
                </div>
                {renderCheckDetails(result)}
              </div>
            ))}
          </CardContent>
        </Card>

        <EvidenceLog evidence={evidence} onClearEvidence={clearEvidence} />
      </div>
    </div>
  );
}
