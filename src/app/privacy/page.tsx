import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UtensilsCrossed, ArrowLeft, Shield, Eye, Lock, Database, Layers } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "Privacy Policy",
  description: "Learn how we isolate tenant workspaces, protect personal data, and secure individual mess databases on our SaaS platform.",
};

export default async function PrivacyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 selection:bg-primary/10 selection:text-primary">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-primary p-1.5 rounded-lg group-hover:scale-105 transition-transform">
              <UtensilsCrossed className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-xl tracking-tight text-slate-900">MMS</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="font-semibold text-slate-600 hover:text-primary gap-1">
                <ArrowLeft className="w-4 h-4" /> Back to Home
              </Button>
            </Link>
            <Link href={user ? "/dashboard" : "/login"}>
              <Button className="font-bold shadow-lg shadow-primary/20">
                {user ? "Dashboard" : "Login"}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Header */}
      <section className="relative pt-32 pb-16 overflow-hidden bg-slate-900 text-white">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px]" />
        </div>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4" id="privacy-title">
            Platform Privacy Policy
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Your privacy is crucial. Learn how MMS isolates workspace data across our multi-tenant SaaS infrastructure.
          </p>
          <p className="text-xs text-slate-500 mt-4">Last updated: May 19, 2026</p>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-grow max-w-4xl w-full mx-auto px-4 py-12">
        <div className="space-y-8">
          <Card className="border-0 shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
            <CardContent className="p-8 md:p-12 space-y-8">
              {/* SaaS Isolation concept */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <Layers className="w-4 h-4" />
                  <span>Workspace Segregation</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">1. Multi-Tenant Data Isolation</h2>
                <p className="text-slate-600 leading-relaxed">
                  MMS is built on a secure multi-tenant SaaS architecture. This means each mess group is hosted inside its own logically isolated partition (&quot;Tenant Workspace&quot;). 
                </p>
                <p className="text-slate-600 leading-relaxed font-semibold text-slate-800">
                  Data collected within your mess workspace is strictly confidential. It is mathematically and logically shielded so that other messes, groups, or external organizations hosted on the MMS platform can never view, retrieve, or query your operational data.
                </p>
              </div>

              <hr className="border-slate-100" />

              {/* Data Collected */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <Eye className="w-4 h-4" />
                  <span>Information We Collect</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">2. Types of Platform Data Processed</h2>
                <p className="text-slate-600 leading-relaxed">
                  To operate our multi-mess software features, billing access, and notifications, we process:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <h4 className="font-bold text-slate-900 text-sm mb-1">Platform Account Info</h4>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      We collect name, email address, profile credentials, and subscription status to license the software and maintain secure SaaS dashboard panels.
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <h4 className="font-bold text-slate-900 text-sm mb-1">Isolated Tenant Ledgers</h4>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Wallet balances, UPI proof of transfer screenshots, daily bazar expenses, and cooking costs uploaded by members of a specific mess.
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <h4 className="font-bold text-slate-900 text-sm mb-1">Attendance & Roster Logs</h4>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Meal attendance toggles and duty history data used by our prioritizer scheduling algorithm to compute local cost shares.
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <h4 className="font-bold text-slate-900 text-sm mb-1">Device Subscriptions</h4>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Granular Web Push notification endpoints to alert users of upcoming meal schedules, pending approvals, and ledger updates.
                    </p>
                  </div>
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* Data Ownership */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <Database className="w-4 h-4" />
                  <span>Data Custody</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">3. Workspace Data Ownership</h2>
                <p className="text-slate-600 leading-relaxed">
                  We believe in tenant data ownership. The records, expenses, receipts, and membership histories belong to the respective Tenant Mess. MMS only processes this information to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                  <li>Generate real-time analytics dashboards for that specific mess manager.</li>
                  <li>Automate cost calculation rates and execute the duty roster circular queue.</li>
                  <li>Verify deposits inside that isolated group boundary.</li>
                </ul>
                <p className="text-slate-600 leading-relaxed">
                  We never share, trade, or distribute your private database records with external marketing companies.
                </p>
              </div>

              <hr className="border-slate-100" />

              {/* Database Security & RLS */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <Lock className="w-4 h-4" />
                  <span>Infrastructure Security</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">4. Database Architecture & Supabase RLS</h2>
                <p className="text-slate-600 leading-relaxed">
                  MMS is deployed on a highly secure cloud platform with multi-layered tenant security:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                  <li>
                    <strong>Row Level Security (RLS):</strong> Our database runs strict RLS configurations on Supabase. This guarantees that query executions are bound by the user&apos;s active `mess_id`, ensuring no cross-workspace data leakage is physically possible.
                  </li>
                  <li>
                    <strong>Storage Segregation:</strong> Payment proof images and invoice files are kept in distinct storage paths, only retrievable by members validated as part of that specific workspace ID.
                  </li>
                </ul>
              </div>

              <hr className="border-slate-100" />

              {/* Your Choices */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <Shield className="w-4 h-4" />
                  <span>User Autonomy</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">5. Workspace Deletion & User Rights</h2>
                <p className="text-slate-600 leading-relaxed">
                  You maintain control of your platform details:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                  <li>
                    <strong>Account Deletion:</strong> You can choose to delete your platform profile. Platform-level personal markers (emails, platform billing records) are completely erased on request.
                  </li>
                  <li>
                    <strong>Tenant Deletion:</strong> Mess managers can dissolve their hosted workspace. Dissolving a mess workspace permanently purges all transactional ledgers, attendance tables, and duty rosters associated with that tenant from our live systems.
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Support Info Box */}
          <div className="bg-primary/5 rounded-[24px] border border-primary/10 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h4 className="font-extrabold text-slate-900 text-lg mb-1">Privacy or Security Concerns?</h4>
              <p className="text-slate-600 text-sm">Reach out immediately to discuss tenant database isolation or request platform-level data deletion.</p>
            </div>
            <Link href="/contact">
              <Button className="font-bold whitespace-nowrap">Contact Security Team</Button>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="bg-slate-900 p-1 rounded-md">
              <UtensilsCrossed className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">MMS</span>
          </div>
          <p className="text-slate-500 text-sm italic">
            Built for students, by students. &copy; {new Date().getFullYear()}
          </p>
          <div className="flex gap-6 text-sm font-semibold text-slate-600">
            <Link href="/terms" className="hover:text-primary">Terms & Conditions</Link>
            <Link href="/contact" className="hover:text-primary">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
