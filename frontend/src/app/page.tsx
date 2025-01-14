import ComplianceChecker from '@/components/ComplianceChecker'

export default function Home() {
  return (
    <div className="min-h-screen bg-[#121826]">
      <main className="container mx-auto px-4 py-8">
        <header className="text-center py-4">
          <h1 className="text-2xl font-bold text-white">Supabase Compliance Checker</h1>
          <p className="mt-2 text-gray-400">
            <a
              href="https://github.com/aardvarkzone/supabase_compliance_tool"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              View this project on GitHub
            </a>
          </p>
        </header>
        <ComplianceChecker />
      </main>
    </div>
  )
}