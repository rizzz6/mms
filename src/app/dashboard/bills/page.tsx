'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { 
  ChevronRight, Calendar, CreditCard, Download, AlertTriangle, 
  Loader2, IndianRupee, ArrowRightLeft, FileSpreadsheet, Trash2
} from 'lucide-react'
import { getPenalties, forgivePenalty } from '@/app/actions/penalties'

interface BillingCycle {
  id: string
  billing_month: string
  total_expense: number
  total_member_meals: number
  total_guest_meals: number
  guest_meal_rate: number
  meal_rate: number
}

interface MonthlyBill {
  id: string
  billing_cycle_id: string
  user_id: string
  meals_eaten: number
  bill_amount: number
  balance_before: number
  balance_after: number
  created_at: string
  billing_cycles: BillingCycle
}

export default function MemberBillsHistoryPage() {
  const [profile, setProfile] = useState<any | null>(null)
  const [bills, setBills] = useState<MonthlyBill[]>([])
  const [penalties, setPenalties] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [waivingId, setWaivingId] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Fetch user profile
      const { data: profileData, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

      if (profileErr) {
        toast.error('Failed to load profile balance')
      } else {
        setProfile(profileData)
      }

      // Fetch monthly bills history
      const { data: billsData, error: billsErr } = await supabase
      .from('monthly_bills')
      .select('*, billing_cycles(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

      if (billsErr) {
        toast.error('Failed to load billing history')
      } else {
        setBills((billsData as unknown as MonthlyBill[]) || [])
      }

      // Fetch penalties log (managers view all penalties, regular members view their own)
      if (profileData) {
        const penaltyRes = await getPenalties(profileData.role === 'manager' ? undefined : user.id)
        if (penaltyRes.success) {
          setPenalties(penaltyRes.penalties || [])
        }
      }

      setIsLoading(false)
    }

    fetchData()
  }, [supabase])

  const getFormattedMonth = (monthStr: string) => {
    if (!monthStr) return ''
    const [y, m] = monthStr.split('-')
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(Number(y), Number(m) - 1, 1))
  }

  const handleDownloadPDF = (billId: string, type: 'summary' | 'detailed') => {
    // Open the print layout inside a new window
    window.open(`/dashboard/bills/${billId}/print?type=${type}`, '_blank')
  }

  const handleWaivePenalty = async (penaltyId: string) => {
    if (!confirm('Are you sure you want to waive and refund this penalty?')) return
    setWaivingId(penaltyId)
    try {
      const res = await forgivePenalty(penaltyId)
      if (res.success) {
        toast.success('Penalty waived and balance refunded!')
        // Reload penalties and balance
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
          setProfile(prof)
          const pRes = await getPenalties(prof?.role === 'manager' ? undefined : user.id)
          if (pRes.success) setPenalties(pRes.penalties || [])
        }
      } else {
        toast.error(res.error || 'Failed to waive penalty')
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred waiving penalty')
    } finally {
      setWaivingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading Billing History...</p>
      </div>
    )
  }

  const isBalanceNegative = profile?.balance < 0
  const isBalanceLow = profile?.balance >= 0 && profile?.balance < 200

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Premium Header */}
      <div className="bg-white px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm border-b border-slate-100 mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 shadow-sm active:scale-90 transition-all"
            onClick={() => window.location.href = '/dashboard'}
          >
            <ChevronRight className="w-5 h-5 text-slate-600 rotate-180" />
          </Button>
          <Badge variant="secondary" className="bg-primary/10 text-primary border-0 font-bold uppercase text-[9px] px-3 py-1 rounded-full">
            {bills.length} Months Billed
          </Badge>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Member Statements</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Billing & Reports</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">
        {/* Dynamic Warning Banners based on Balance */}
        {isBalanceNegative && (
          <div className="bg-red-50 border border-red-100 rounded-3xl p-5 flex items-start gap-4 shadow-sm animate-pulse">
            <div className="bg-red-100 p-3 rounded-2xl text-red-600 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-black text-red-800 uppercase tracking-tight">Unpaid Dues / Negative Balance!</p>
              <p className="text-xs text-red-600 leading-normal">
                Your current deposit balance is **-₹{Math.abs(profile.balance)}**. Please top up immediately. The manager will communicate with you offline or by call to settle.
              </p>
            </div>
          </div>
        )}

        {isBalanceLow && (
          <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5 flex items-start gap-4 shadow-sm">
            <div className="bg-amber-100 p-3 rounded-2xl text-amber-600 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-black text-amber-800 uppercase tracking-tight">Low Available Deposit Balance</p>
              <p className="text-xs text-amber-600 leading-normal">
                Your available balance (₹{profile.balance}) is low. Add cash to avoid falling into unpaid dues during next month&apos;s closing.
              </p>
            </div>
          </div>
        )}

        {/* Current Active Deposit card */}
        <Card className="border-0 shadow-xl overflow-hidden bg-primary text-white relative rounded-[2.5rem]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
          
          <div className="p-8 relative z-10 space-y-6">
            <div className="flex items-center space-x-4">
              <div className="bg-white/10 p-3 rounded-[1.5rem] backdrop-blur-md border border-white/10 shadow-inner">
                <CreditCard className="w-6 h-6 text-accent" />
              </div>
              <div>
                <p className="text-white/60 text-[9px] uppercase font-black tracking-widest">Active Deposit</p>
                <h2 className="text-2xl font-black tracking-tight text-white">{profile?.full_name}</h2>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-2xl p-4 backdrop-blur-md border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-white/50 tracking-wider">Available Balance</span>
                <p className={`text-3xl font-black tracking-tight mt-1 ${isBalanceNegative ? 'text-red-400' : 'text-accent'}`}>
                  ₹{profile?.balance || 0}
                </p>
              </div>
              <div className="bg-white/10 p-2.5 rounded-xl text-white">
                <IndianRupee className="w-6 h-6 text-accent" />
              </div>
            </div>
          </div>
        </Card>

        {/* Fines & Penalties list */}
        {penalties.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 px-1">
              {profile?.role === 'manager' ? 'Active Mess Fines' : 'My Fines & Penalties'}
            </h2>
            <div className="space-y-2">
              {penalties.map((p) => (
                <Card key={p.id} className="border-0 shadow-sm bg-white rounded-2xl overflow-hidden border-l-4 border-l-amber-500">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-50 p-2.5 rounded-xl text-amber-600">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-xs uppercase tracking-tight">
                            {p.reason.replace('_', ' ')}
                          </span>
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-0 font-bold uppercase text-[7px] px-1.5 py-0.2">
                            {profile?.role === 'manager' ? p.full_name : 'Fined'}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 leading-normal font-medium max-w-[200px]">
                          {p.description}
                        </p>
                        <p className="text-[8px] text-slate-400 mt-0.5 font-medium">
                          {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(p.created_at))}
                          {profile?.role === 'manager' && ` • Issued by ${p.manager_name}`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Amount</span>
                        <span className="text-sm font-black text-amber-600">-₹{p.amount}</span>
                      </div>
                      {profile?.role === 'manager' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-xl border border-amber-200 hover:bg-red-50 text-red-500 shadow-sm active:scale-95 transition-all"
                          onClick={() => handleWaivePenalty(p.id)}
                          disabled={waivingId === p.id}
                        >
                          {waivingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Billings History List */}
        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 px-1">
            Archived Bills History
          </h2>

          {bills.map((bill) => (
            <Card key={bill.id} className="border-0 shadow-sm bg-white overflow-hidden rounded-2xl">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-600">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">
                        {getFormattedMonth(bill.billing_cycles?.billing_month)}
                      </h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                        {bill.meals_eaten} meals @ ₹{bill.billing_cycles?.meal_rate}/meal
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Total Bill</p>
                    <p className="text-lg font-black text-slate-900 mt-0.5">₹{bill.bill_amount}</p>
                  </div>
                </div>

                {/* Audit balance logs */}
                <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 divide-x divide-slate-100 text-center">
                  <div>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Balance Before</span>
                    <span className="text-xs font-bold text-slate-600">₹{bill.balance_before}</span>
                  </div>
                  <div>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Balance After</span>
                    <span className={`text-xs font-black ${bill.balance_after < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      ₹{bill.balance_after}
                    </span>
                  </div>
                </div>

                {/* PDF Generation Actions */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleDownloadPDF(bill.id, 'summary')}
                    className="h-9 rounded-xl font-bold text-[10px] uppercase gap-1.5 border-slate-200"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-500" />
                    Summary PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleDownloadPDF(bill.id, 'detailed')}
                    className="h-9 rounded-xl font-bold text-[10px] uppercase gap-1.5 border-slate-200"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                    Detailed PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {bills.length === 0 && (
            <div className="text-center py-20 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
              <ArrowRightLeft className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">No Billing Cycles Archived Yet</p>
              <p className="text-slate-300 text-[10px] font-medium leading-normal mt-1 max-w-xs mx-auto">
                Once the manager finalizes a billing cycle at the end of the month, your statements will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
