'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  UtensilsCrossed, 
  ArrowLeft, 
  Mail, 
  CheckCircle2, 
  Loader2, 
  Send, 
  HelpCircle, 
  ChevronDown 
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    messCode: "",
    inquiryType: "",
    message: ""
  });
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.inquiryType || !formData.message) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setLoading(true);

    // Simulate sending message to cooperative database/support desk
    await new Promise((resolve) => setTimeout(resolve, 1500));

    toast.success("Message sent successfully! Our student support team will contact you shortly.");
    setFormData({
      name: "",
      email: "",
      messCode: "",
      inquiryType: "",
      message: ""
    });
    setLoading(false);
  };

  const faqs = [
    {
      q: "My wallet deposit was rejected. What should I do?",
      a: "Deposits can be rejected if the uploaded UPI transaction screenshot is duplicate, blurry, or does not match a verified transfer in the mess manager's accounts. Please contact your mess manager directly to verify the ledger, or resubmit the inquiry here with your Mess Code and transaction reference."
    },
    {
      q: "How does the duty roster assign Water and Bazar duties?",
      a: "Duties are calculated using a prioritized circular queue algorithm based on when members last performed a duty, their active status, and total meals consumed. If you use the 'Absent' toggle in Settings before a roster run, you are excluded from assignments."
    },
    {
      q: "Can I get a refund of my remaining wallet balance?",
      a: "Wallet refunds are handled directly by your specific Mess Manager since the funds are kept in the group's shared account, not by the MMS software platform developers. Request a balance payout from your manager in the dashboard."
    },
    {
      q: "Is there any platform usage fee for members or managers?",
      a: "No! MMS is completely open-source, student-made, and free. There are zero subscription charges or transaction fees."
    }
  ];

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
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4" id="contact-title">
            Contact Support & Feedback
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Need technical assistance, want to report a bug, or have a suggestion? Get in touch with our student developer team.
          </p>
        </div>
      </section>

      {/* Main Content Grid */}
      <main className="flex-grow max-w-6xl w-full mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Form Card */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-0 shadow-xl shadow-slate-200/50 bg-white rounded-[2rem] overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                <CardTitle className="text-xl font-extrabold text-slate-900">Send us a Message</CardTitle>
                <CardDescription className="text-slate-500">
                  Please submit details below and we will respond as fast as possible.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  
                  {/* Name and Email */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Full Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="name"
                        placeholder="e.g. John Doe"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        className="h-12 rounded-xl bg-slate-50/50 border-slate-100 focus:border-primary font-semibold px-4"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Email Address <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="e.g. john@university.edu"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        className="h-12 rounded-xl bg-slate-50/50 border-slate-100 focus:border-primary font-semibold px-4"
                      />
                    </div>
                  </div>

                  {/* Mess Code and Inquiry Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="messCode" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Mess Code <span className="text-slate-400 lowercase">(optional)</span>
                      </Label>
                      <Input
                        id="messCode"
                        placeholder="e.g. ABCDEF"
                        value={formData.messCode}
                        onChange={(e) => setFormData({ ...formData, messCode: e.target.value.toUpperCase() })}
                        maxLength={6}
                        className="h-12 rounded-xl bg-slate-50/50 border-slate-100 focus:border-primary font-bold uppercase px-4 tracking-wider"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inquiryType" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Inquiry Category <span className="text-red-500">*</span>
                      </Label>
                      <Select 
                        value={formData.inquiryType} 
                        onValueChange={(val) => setFormData({ ...formData, inquiryType: val || "" })}
                      >
                        <SelectTrigger className="h-12 rounded-xl bg-slate-50/50 border-slate-100 focus:border-primary font-semibold px-4">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-slate-100 shadow-xl">
                          <SelectItem value="technical" className="font-semibold text-slate-700">Technical Issue & Bugs</SelectItem>
                          <SelectItem value="billing" className="font-semibold text-slate-700">Billing & Verification Disputes</SelectItem>
                          <SelectItem value="feedback" className="font-semibold text-slate-700">Feedback & Suggestions</SelectItem>
                          <SelectItem value="general" className="font-semibold text-slate-700">General Questions</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Message body */}
                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Detailed Message <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="message"
                      placeholder="Write your details, issue description, or recommendations here..."
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      required
                      className="rounded-xl bg-slate-50/50 border-slate-100 focus:border-primary font-semibold p-4 resize-none"
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 text-white flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Sending message...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Send Message</span>
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Sidebar (SLA & FAQ) */}
          <div className="space-y-6">
            
            {/* SLA / Info Card */}
            <Card className="border-0 shadow-lg shadow-slate-200/50 bg-slate-900 text-white rounded-[2rem] overflow-hidden">
              <CardContent className="p-8 space-y-6">
                <h3 className="text-lg font-extrabold tracking-tight">Direct Channels</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-2.5 rounded-xl text-primary-foreground">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Support Email</h4>
                      <p className="font-bold text-sm text-slate-200">rizvialam2005@gmail.com</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-2.5 rounded-xl text-primary-foreground">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Response SLA</h4>
                      <p className="font-bold text-sm text-slate-200">Guaranteed within 24 Hours</p>
                    </div>
                  </div>
                </div>
                <hr className="border-white/10" />
                <p className="text-xs text-slate-400 leading-relaxed italic">
                  Note: MMS is cooperatively maintained by student developers. If you have an immediate payment query, please contact your hostel mess manager directly before writing to support.
                </p>
              </CardContent>
            </Card>

            {/* Visual FAQ Card */}
            <Card className="border-0 shadow-xl shadow-slate-200/50 bg-white rounded-[2rem] overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6 flex flex-row items-center gap-2">
                <HelpCircle className="w-5 h-5 text-primary" />
                <div>
                  <CardTitle className="text-sm font-extrabold text-slate-900">FAQ Summary</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {faqs.map((faq, index) => (
                    <div key={index} className="border-b border-slate-100 last:border-b-0 pb-3 last:pb-0">
                      <button
                        onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                        className="w-full flex items-center justify-between gap-2 text-left font-bold text-xs text-slate-800 hover:text-primary transition-colors py-1"
                      >
                        <span>{faq.q}</span>
                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${activeFaq === index ? "rotate-180 text-primary" : ""}`} />
                      </button>
                      {activeFaq === index && (
                        <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed animate-in fade-in duration-300">
                          {faq.a}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

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
            <Link href="/privacy" className="hover:text-primary">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
