import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UtensilsCrossed, ShieldCheck, Wallet, CalendarRange, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 selection:bg-primary/10 selection:text-primary">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-lg">
              <UtensilsCrossed className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-xl tracking-tight text-slate-900">MMS</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href={user ? "/dashboard" : "/login"}>
              <Button variant="ghost" className="font-semibold">
                {user ? "Dashboard" : "Login"}
              </Button>
            </Link>
            {!user && (
              <Link href="/login">
                <Button className="font-bold shadow-lg shadow-primary/20">
                  Join Now
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/15 text-secondary text-xs font-bold uppercase tracking-wider mb-6">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Zero-Cost Mess Management
          </div>
          <h1 className="text-5xl lg:text-7xl font-black text-slate-900 tracking-tight mb-6">
            Manage your hostel mess <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              effortlessly and transparently.
            </span>
          </h1>
          <p className="text-lg lg:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            MMS helps hostel groups track meals, expenses, and payments with absolute clarity. 
            No more spreadsheets. No more confusion.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/dashboard">
              <Button size="lg" className="h-14 px-8 text-lg font-bold rounded-2xl shadow-xl shadow-primary/25 hover:scale-[1.02] transition-transform">
                Get Started <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-200" />
              ))}
              <div className="pl-4 flex flex-col items-start justify-center">
                <p className="text-xs font-bold text-slate-900">Used by 50+ students</p>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className="text-amber-400 text-[10px]">★</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="border-0 bg-slate-50/50 shadow-none hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
              <CardContent className="p-8">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
                  <UtensilsCrossed className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Meal Attendance</h3>
                <p className="text-slate-600 leading-relaxed">
                  Simple toggle system for daily meals. Automatic cut-offs at 9 AM and 5 PM keep planning precise.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-slate-50/50 shadow-none hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
              <CardContent className="p-8">
                <div className="w-14 h-14 bg-secondary/15 rounded-2xl flex items-center justify-center mb-6 text-secondary group-hover:scale-110 transition-transform">
                  <Wallet className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Balance Tracking</h3>
                <p className="text-slate-600 leading-relaxed">
                  Real-time wallet system. Add funds via UPI, upload screenshots, and get notified when balance is low.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-slate-50/50 shadow-none hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
              <CardContent className="p-8">
                <div className="w-14 h-14 bg-accent/20 rounded-2xl flex items-center justify-center mb-6 text-accent-foreground group-hover:scale-110 transition-transform">
                  <CalendarRange className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Duty Roster</h3>
                <p className="text-slate-600 leading-relaxed">
                  Fair assignment of Bazar and Water duties using a prioritized circular queue algorithm.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="bg-slate-900 rounded-[32px] p-8 lg:p-12 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[80px] -mr-32 -mt-32" />
            <div className="relative z-10">
              <ShieldCheck className="w-12 h-12 text-secondary mx-auto mb-6" />
              <h2 className="text-3xl lg:text-4xl font-bold mb-6">Transparency is our priority.</h2>
              <p className="text-slate-400 text-lg mb-8">
                Every bazar log and transaction is verified by the manager. Everyone can see the live meal rate calculated based on actual expenses.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-2xl font-black text-white tracking-tighter">100%</p>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Secure</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-2xl font-black text-white tracking-tighter">Live</p>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Analytics</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-2xl font-black text-white tracking-tighter">0.0</p>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Fee</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-2xl font-black text-white tracking-tighter">PWA</p>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Offline</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-slate-600">
            <Link href="/login" className="hover:text-primary transition-colors">Login</Link>
            <Link href="/onboarding" className="hover:text-primary transition-colors">Setup Profile</Link>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms & Conditions</Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <Link href="/contact" className="hover:text-primary transition-colors">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
