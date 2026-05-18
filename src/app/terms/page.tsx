import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UtensilsCrossed, ArrowLeft, ShieldCheck, Scale, AlertTriangle, Layers } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "Terms and Conditions",
  description: "Read the SaaS licensing, terms of service, and user responsibilities for the MMS multi-tenant platform.",
};

export default async function TermsPage() {
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
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4" id="terms-title">
            Platform Terms of Service
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Please read these terms carefully. By purchasing, creating, or participating in a mess group hosted on MMS, you agree to these platform licensing rules.
          </p>
          <p className="text-xs text-slate-500 mt-4">Last updated: May 19, 2026</p>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-grow max-w-4xl w-full mx-auto px-4 py-12">
        <div className="space-y-8">
          <Card className="border-0 shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
            <CardContent className="p-8 md:p-12 space-y-8">
              {/* SaaS Concept */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <Layers className="w-4 h-4" />
                  <span>SaaS Agreement</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">1. Platform Licensing & Service Scope</h2>
                <p className="text-slate-600 leading-relaxed">
                  MMS is a multi-tenant Software-as-a-Service (SaaS) platform. We license access to the product to individual mess managers, hostel groups, and organizers (&quot;Tenants&quot;) to host and coordinate their respective dining groups. 
                </p>
                <p className="text-slate-600 leading-relaxed">
                  Your agreement is for the use of the platform itself. By registering an account, purchasing access, or joining an existing tenant group, you accept these terms.
                </p>
              </div>

              <hr className="border-slate-100" />

              {/* Subscriptions & Sales */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <Scale className="w-4 h-4" />
                  <span>Subscription and Sales</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">2. Platform Access, Billing, & Selling</h2>
                <p className="text-slate-600 leading-relaxed">
                  We sell software access to mess administrators to manage their groups. As the platform provider:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                  <li>
                    <strong>SaaS Licenses:</strong> Access to create and run a mess on the MMS platform is governed by subscription plans, flat licensing fees, or active paywalls configured at the platform level.
                  </li>
                  <li>
                    <strong>Reselling & Group Management:</strong> Mess managers are permitted to purchase workspace access and share/invite active student members within their authorized tenant space.
                  </li>
                  <li>
                    <strong>Refunds:</strong> Platform subscription payments made to MMS are subject to our platform refund policies. Any funds deposited by students *inside* a specific tenant&apos;s digital wallet for local groceries or meal balances are governed solely by that specific mess manager, as those funds do not pass through the MMS platform billing system.
                  </li>
                </ul>
              </div>

              <hr className="border-slate-100" />

              {/* Tenant Independence */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Tenant Isolation</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">3. Independent Tenant Responsibility Disclaimer</h2>
                <p className="text-slate-600 leading-relaxed font-semibold text-slate-800">
                  MMS hosts independent, isolated mess tenants. We are a software tool provider, not a dining entity or payment clearing house.
                </p>
                <p className="text-slate-600 leading-relaxed">
                  The respective mess manager has absolute administrative authority and liability over their mess group. The MMS platform is not liable for:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                  <li>Disputes between managers and members regarding meal calculations, cut-offs, or duty rotations.</li>
                  <li>Unverified ledger sheets or rejected UPI screenshot approvals within an individual group.</li>
                  <li>Inner-mess financial discrepancies, defaults, or local wallet refund issues.</li>
                </ul>
              </div>

              <hr className="border-slate-100" />

              {/* Acceptable Use */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Acceptable Use</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">4. Platform Use Guidelines</h2>
                <p className="text-slate-600 leading-relaxed">
                  To maintain performance and reliability across all tenant groups:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-slate-600">
                  <li>Users must not upload corrupted media, false receipts, or duplicate image payloads that stress multi-tenant storage nodes.</li>
                  <li>Any script or automation designed to manipulate meal toggles or bypass algorithmic prioritized roster duties is strictly prohibited.</li>
                  <li>Managers must enforce fair conduct, keeping member rosters transparent and ensuring transaction inputs represent accurate cooperative expenses.</li>
                </ul>
              </div>

              <hr className="border-slate-100" />

              {/* Limitation of Liability */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider">
                  <Scale className="w-4 h-4" />
                  <span>Limitation of Liability</span>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900">5. Limitation of Liability</h2>
                <p className="text-slate-600 leading-relaxed">
                  Under no circumstances shall the MMS platform developers, host platforms, or owners be liable for any direct, indirect, incidental, or consequential damages resulting from the use or inability to use the platform. This includes database downtime, data loss, mathematical variations in expense logs, or student group financial management failures. The platform is provided &quot;as is&quot; without warranties of any kind.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Support Info Box */}
          <div className="bg-primary/5 rounded-[24px] border border-primary/10 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h4 className="font-extrabold text-slate-900 text-lg mb-1">Questions about SaaS Licenses?</h4>
              <p className="text-slate-600 text-sm">Clear up any questions regarding multi-tenant hosting, subscriptions, and platform boundaries.</p>
            </div>
            <Link href="/contact">
              <Button className="font-bold whitespace-nowrap">Contact Support</Button>
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
            <Link href="/privacy" className="hover:text-primary">Privacy Policy</Link>
            <Link href="/contact" className="hover:text-primary">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
