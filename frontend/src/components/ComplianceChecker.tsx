'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { createSupabaseClient, type SupabaseCredentials } from '@/lib/supabase';
import { 
  checkMFA, 
  checkRLS, 
  checkPITR, 
  type CheckResult,
  type JSONValue 
} from '@/lib/checks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import EvidenceLog from '@/components/EvidenceLog';
import { getChatCompletion, createUserMessage } from '@/lib/gpt';

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

type KeyField = 'serviceRoleKey' | 'managementApiKey';

type ValidationErrors = {
  url: string;
  serviceRoleKey: string;
  managementApiKey: string;
};

const INITIAL_RESULTS: Results = {
  mfa: { status: 'pending', message: 'MFA check pending...', details: null },
  rls: { status: 'pending', message: 'RLS check pending...', details: null },
  pitr: { status: 'pending', message: 'PITR check pending...', details: null }
};

const INITIAL_CREDENTIALS: SupabaseCredentials = {
  url: '',
  serviceRoleKey: '',
  managementApiKey: ''
};

const INITIAL_VALIDATION_ERRORS: ValidationErrors = {
  url: '',
  serviceRoleKey: '',
  managementApiKey: ''
};

export default function ComplianceChecker() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState<SupabaseCredentials>(INITIAL_CREDENTIALS);
  const [showKeys, setShowKeys] = useState({
    serviceRoleKey: false,
    managementApiKey: false
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(INITIAL_VALIDATION_ERRORS);
  const [results, setResults] = useState<Results>(INITIAL_RESULTS);
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<{ user: string; bot?: string }[]>([]);
  const [currentChatInput, setCurrentChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const extractProjectRef = (url: string): string | null => {
    const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
    return match ? match[1] : null;
  };

  const validateField = (field: string, value: string): string => {
    switch (field) {
      case 'url':
        if (value && !value.includes('supabase.co')) {
          return 'Must be a valid Supabase URL (e.g., https://project.supabase.co)';
        }
        break;
      case 'serviceRoleKey':
        if (value && !value.startsWith('eyJ')) {
          return 'Service Role Key must start with "eyJ"';
        }
        break;
      case 'managementApiKey':
        if (value && !value.startsWith('sbp_')) {
          return 'Management API Key must start with "sbp_"';
        }
        break;
    }
    return '';
  };

  const handleInputChange = (field: string, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    setValidationErrors(prev => ({
      ...prev,
      [field]: validateField(field, value)
    }));
  };

  const toggleKeyVisibility = (field: KeyField) => {
    setShowKeys(prev => ({ ...prev, [field]: !prev[field] }));
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

  const clearEvidence = () => {
    if (window.confirm('Are you sure you want to clear all evidence logs?')) {
      setEvidence([]);
    }
  };

  const clearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      setChatMessages([]);
      setCurrentChatInput('');
    }
  };

  const handleRunChecks = async () => {
    if (!validateCredentials()) return;
    try {
      setLoading(true);
      setError('');

      const supabase = createSupabaseClient({
        url: credentials.url,
        serviceRoleKey: credentials.serviceRoleKey,
      });

      const createErrorResult = (e: Error): CheckResult => ({
        status: 'error',
        message: e.message,
        details: {
          message: e.message,
          stack: e.stack || '',
          name: e.name
        } as JSONValue
      });

      const [mfaResult, rlsResult, pitrResult] = await Promise.all([
        checkMFA(supabase).catch((e: Error) => createErrorResult(e)),
        checkRLS(supabase).catch((e: Error) => createErrorResult(e)),
        checkPITR({ ...credentials }).catch((e: Error) => createErrorResult(e)),
      ]);

      const timestamp = new Date().toISOString();
      setEvidence(prev => [
        ...prev,
        { timestamp, check: 'MFA', status: mfaResult.status, details: mfaResult.message },
        { timestamp, check: 'RLS', status: rlsResult.status, details: rlsResult.message },
        { timestamp, check: 'PITR', status: pitrResult.status, details: pitrResult.message },
      ]);
      setResults({ mfa: mfaResult, rls: rlsResult, pitr: pitrResult });
    } catch (error) {
      setError(`Failed to run checks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendChat = async () => {
    if (!currentChatInput.trim()) return;

    const userMessage = { user: currentChatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setCurrentChatInput('');
    setChatLoading(true);

    try {
      const botResponse = await getChatCompletion([
        createUserMessage(currentChatInput),
      ]);
      setChatMessages(prev => [...prev, { user: currentChatInput, bot: botResponse.content }]);
    } catch (error) {
      console.error('Error fetching chat response:', error);
      setChatMessages(prev => [...prev, { user: currentChatInput, bot: 'Error processing your request.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Render functions
  const renderCheckDetails = (result: CheckResult) => {
    if (result.status === 'error') {
      return (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            {result.message}
            <details className="mt-2">
              <summary className="cursor-pointer">Technical Details</summary>
              <pre className="mt-2 whitespace-pre-wrap text-sm">
                {JSON.stringify(result.details, null, 2)}
              </pre>
            </details>
          </AlertDescription>
        </Alert>
      );
    }

    return <p className="mt-2 text-sm text-gray-400">{result.message}</p>;
  };

  const renderCheckStatus = (key: string, result: CheckResult) => (
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
  );

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* Credentials Card */}
        <Card className="mb-8 card-override">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Supabase Project Credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Project URL Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Project URL</label>
              <div className="relative">
                <Input
                  className="input-override w-full"
                  value={credentials.url}
                  onChange={(e) => handleInputChange('url', e.target.value)}
                  placeholder="https://your-project.supabase.co"
                />
                {validationErrors.url && (
                  <Alert variant="destructive" className="mt-1">
                    <AlertDescription>{validationErrors.url}</AlertDescription>
                  </Alert>
                )}
              </div>
            </div>

            {/* Service Role Key Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Service Role Key</label>
              <div className="relative">
                <div className="flex">
                  <Input
                    className="input-override flex-grow"
                    type={showKeys.serviceRoleKey ? 'text' : 'password'}
                    value={credentials.serviceRoleKey}
                    onChange={(e) => handleInputChange('serviceRoleKey', e.target.value)}
                    placeholder="eyJhbG..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-2"
                    onClick={() => toggleKeyVisibility('serviceRoleKey')}
                  >
                    {showKeys.serviceRoleKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {validationErrors.serviceRoleKey && (
                  <Alert variant="destructive" className="mt-1">
                    <AlertDescription>{validationErrors.serviceRoleKey}</AlertDescription>
                  </Alert>
                )}
              </div>
            </div>

            {/* Management API Key Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white">Management API Key</label>
              <div className="relative">
                <div className="flex">
                  <Input
                    className="input-override flex-grow"
                    type={showKeys.managementApiKey ? 'text' : 'password'}
                    value={credentials.managementApiKey}
                    onChange={(e) => handleInputChange('managementApiKey', e.target.value)}
                    placeholder="sbp_..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-2"
                    onClick={() => toggleKeyVisibility('managementApiKey')}
                  >
                    {showKeys.managementApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {validationErrors.managementApiKey && (
                  <Alert variant="destructive" className="mt-1">
                    <AlertDescription>{validationErrors.managementApiKey}</AlertDescription>
                  </Alert>
                )}
              </div>
            </div>

            <Button
              className="button-override w-full mt-4"
              onClick={handleRunChecks}
              disabled={loading || !credentials.url || !credentials.serviceRoleKey || !credentials.managementApiKey}
            >
              {loading ? 'Running Checks...' : 'Run Checks'}
            </Button>
          </CardContent>
        </Card>

        {/* Results Card */}
        <Card className="card-override">
          <CardHeader>
            <CardTitle className="text-white">Compliance Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(results).map(([key, result]) => renderCheckStatus(key, result))}
          </CardContent>
        </Card>

        {/* Evidence Log */}
        <EvidenceLog evidence={evidence} onClearEvidence={clearEvidence} />

        {/* Chat Card */}
        <Card className="mt-8 card-override">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Assistant Chatbot</CardTitle>
            <Button 
              onClick={clearChat}
              className="button-override"
            >
              Clear Chat
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-gray-800/30">
                 <p className="text-white"><strong>User:</strong> {msg.user}</p>
                  {msg.bot && <p className="text-gray-300 mt-2"><strong>Assistant:</strong> {msg.bot}</p>}
                </div>
              ))}
              <div className="mt-4 flex gap-2">
                <Input
                  className="input-override flex-grow"
                  value={currentChatInput}
                  onChange={(e) => setCurrentChatInput(e.target.value)}
                  placeholder="Ask me anything..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                />
                <Button 
                  onClick={handleSendChat} 
                  disabled={chatLoading}
                  className="button-override"
                >
                  {chatLoading ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}