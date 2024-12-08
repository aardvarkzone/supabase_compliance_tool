import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type EvidenceEntry = {
  timestamp: string
  check: string
  status: string
  details: string
}

interface EvidenceLogProps {
  evidence: EvidenceEntry[]
  onClearEvidence: () => void
}

const EvidenceLog = ({ evidence, onClearEvidence }: EvidenceLogProps) => {
  const downloadAsJson = (evidence: EvidenceEntry[]) => {
    const dataStr = JSON.stringify(evidence, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `compliance-evidence-${new Date().toISOString()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const downloadAsCsv = (evidence: EvidenceEntry[]) => {
    const headers = ['Timestamp', 'Check', 'Status', 'Details']
    const csvData = evidence.map(entry => [
      entry.timestamp,
      entry.check,
      entry.status,
      entry.details
    ])
    
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => 
        `"${String(cell).replace(/"/g, '""')}"`
      ).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `compliance-evidence-${new Date().toISOString()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return 'bg-green-900/50 text-green-200'
      case 'fail': return 'bg-red-900/50 text-red-200'
      case 'error': return 'bg-yellow-900/50 text-yellow-200'
      default: return 'bg-gray-700/50 text-gray-200'
    }
  }

  if (evidence.length === 0) return null;

  return (
    <Card className="mt-8 card-override">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white">Evidence Log</CardTitle>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadAsCsv(evidence)}
            className="button-override"
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadAsJson(evidence)}
            className="button-override"
          >
            Export JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearEvidence}
            className="text-red-400 hover:text-red-300 border-red-800 hover:bg-red-950"
          >
            Clear Log
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {evidence.map((entry, index) => (
            <div key={index} className="p-3 rounded-md bg-gray-800/30 border border-gray-700">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-400">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
                <span className="text-gray-500">•</span>
                <span className="font-medium text-gray-200">{entry.check}</span>
                <span className="text-gray-500">•</span>
                <span className={`px-2 py-0.5 rounded-full ${getStatusColor(entry.status)}`}>
                  {entry.status}
                </span>
              </div>
              <p className="mt-1 text-gray-400">{entry.details}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default EvidenceLog;