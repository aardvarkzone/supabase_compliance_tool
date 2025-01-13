import ComplianceChecker from '@/components/ComplianceChecker'

export default function Home() {
  return (
    <div className="min-h-screen bg-[#121826]">
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-white mb-8 text-center">
          Supabase Compliance Checker
        </h1>
        <ComplianceChecker />
      </main>
    </div>
  )
}