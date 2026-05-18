'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { 
  ChevronRight, TrendingUp, Utensils, Receipt, Users, User,
  AlertTriangle, CheckCircle, RefreshCw, Loader2, Sparkles, FileText, ArrowDownRight, ArrowUpRight
} from 'lucide-react'
import { previewBillingCycle, closeBillingCycle } from '@/app/actions/billing'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"

interface MemberBill {
  user_id: string
  full_name: string
  meals_eaten: number
  bill_amount: number
  balance_before: number
  balance_after: number
}

interface BillingStats {
  monthStart: string
  monthEnd?: string
  totalExpense: number
  totalMemberMeals: number
  totalGuestMeals: number
  guestMealRate: number
  netExpense?: number
  mealRate: number
  memberBills: MemberBill[]
}

export default function ManagerBillingPage() {
  const [selectedMonth, setSelectedMonth] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isClosed, setIsClosed] = useState(false)
  const [stats, setStats] = useState<BillingStats | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [myRole, setMyRole] = useState<string | null>(null)

  const supabase = createClient()

  // Initialize with current month
  useEffect(() => {
    const today = new Date()
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    setSelectedMonth(currentMonthStr)
  }, [])

  // Fetch role and billing preview
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      setMyRole(profile?.role || null)
    }
    init()
  }, [supabase])

  // Fetch stats when selectedMonth updates
  const fetchStats = async (month: string) => {
    if (!month) return
    setIsLoading(true)
    const res = await previewBillingCycle(month)
    if (res.success && res.stats) {
      setStats(res.stats as BillingStats)
      setIsClosed(res.isClosed || false)
    } else {
      toast.error(res.error || 'Failed to fetch billing data')
    }
    setIsLoading(false)
  }

  useEffect(() => {
    if (selectedMonth && myRole === 'manager') {
      fetchStats(selectedMonth)
    }
  }, [selectedMonth, myRole])

  const handleRecalculate = () => {
    if (selectedMonth) {
      fetchStats(selectedMonth)
      toast.success('Recalculated latest billing data!')
    }
  }

  const handleCloseMonth = async () => {
    setIsProcessing(true)
    setShowConfirmDialog(false)
    
    const res = await closeBillingCycle(selectedMonth)
    
    if (res.success) {
      toast.success(`Billing for ${getFormattedMonth(selectedMonth)} finalized successfully!`)
      // Refresh page details
      fetchStats(selectedMonth)
    } else {
      toast.error(res.error || 'Failed to close billing cycle')
    }
    setIsProcessing(false)
  }

  const getFormattedMonth = (monthStr: string) => {
    if (!monthStr) return ''
    const [y, m] = monthStr.split('-')
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(Number(y), Number(m) - 1, 1))
  }

  if (myRole !== null && myRole !== 'manager') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center bg-slate-50">
        <AlertTriangle className="w-12 h-12 text-slate-300 mb-4" />
        <h1 className="text-xl font-bold text-slate-800">Access Denied</h1>
        <p className="text-sm text-slate-500 max-w-xs">Only Mess Managers can access the Billing Center.</p>
        <Button className="mt-6" onClick={() => window.location.href = '/dashboard'}>Go Back</Button>
      </div>
    )
  }

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
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Select Month:</span>
            <input 
              type="month" 
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Financial Center</p>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Billing Center</h1>
            {stats && (
              <Badge className={`border-0 font-black text-[9px] uppercase px-3 py-1 rounded-full ${isClosed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700 animate-pulse'}`}>
                {isClosed ? 'BILLED & ARCHIVED' : 'OPEN / ACTIVE PREVIEW'}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Calculating Billing Statistics...</p>
          </div>
        ) : stats ? (
          <>
            {/* Master Stats Cards */}
            <Card className="border-0 shadow-sm overflow-hidden bg-white rounded-[2rem] border border-slate-100">
              <CardHeader className="p-5 pb-2 border-b border-slate-50">
                <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Monthly Summary Statistics ({getFormattedMonth(selectedMonth)})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-2 divide-x divide-y border-b border-slate-50">
                  <div className="p-5 space-y-1 bg-slate-50/50">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Utensils className="w-3.5 h-3.5" />
                      <p className="text-[9px] font-black uppercase tracking-wider">Meal Rate</p>
                    </div>
                    <p className="text-2xl font-black text-primary">
                      ₹{stats.mealRate}
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium">per member meal</p>
                  </div>
                  <div className="p-5 space-y-1">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Receipt className="w-3.5 h-3.5" />
                      <p className="text-[9px] font-black uppercase tracking-wider">Total Expense</p>
                    </div>
                    <p className="text-2xl font-black text-slate-900">₹{stats.totalExpense}</p>
                    <p className="text-[9px] text-slate-400 font-medium">verified bazar logs</p>
                  </div>
                  <div className="p-5 space-y-1">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Users className="w-3.5 h-3.5" />
                      <p className="text-[9px] font-black uppercase tracking-wider">Member Meals</p>
                    </div>
                    <p className="text-xl font-bold text-slate-700">{stats.totalMemberMeals}</p>
                    <p className="text-[9px] text-slate-400 font-medium">total meals eaten</p>
                  </div>
                  <div className="p-5 space-y-1 bg-slate-50/50">
                    <div className="flex items-center gap-2 text-slate-400">
                      <User className="w-3.5 h-3.5" />
                      <p className="text-[9px] font-black uppercase tracking-wider">Guest Meals</p>
                    </div>
                    <p className="text-xl font-bold text-slate-700">{stats.totalGuestMeals}</p>
                    <p className="text-[9px] text-slate-400 font-medium">₹{stats.guestMealRate} rate contribution</p>
                  </div>
                </div>

                {!isClosed && (
                  <div className="p-4 bg-slate-50 flex items-center justify-between">
                    <p className="text-[9px] text-slate-400 font-medium flex items-center gap-1.5 italic">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      Estimates based on current active logs.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRecalculate}
                      className="h-8 rounded-xl font-black text-[10px] uppercase gap-1.5 active:scale-95 border-slate-200"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Recalculate
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Member List Preview */}
            <div className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 px-1">
                {isClosed ? 'Archived Bills Deducted' : 'Estimated Member Billing Preview'}
              </h2>

              {stats.memberBills.map((mb) => {
                const isNegative = mb.balance_after < 0
                return (
                  <Card 
                    key={mb.user_id} 
                    className={`border-0 shadow-sm bg-white overflow-hidden rounded-2xl ${!isClosed && isNegative ? 'ring-2 ring-red-100 bg-red-50/10' : ''}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-2xl shrink-0 ${isClosed ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-500'}`}>
                          {isClosed ? <CheckCircle className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-800 truncate">{mb.full_name}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[9px] border-0 px-2 py-0.5 rounded-md font-bold">
                              {mb.meals_eaten} Meals
                            </Badge>
                            {!isClosed && isNegative && (
                              <Badge variant="outline" className="border-red-500 text-red-600 text-[9px] bg-red-50 font-black px-2 py-0.5 rounded-md uppercase">
                                INSUFFICIENT DEPOSIT
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-tight leading-none mb-1">Final Bill</p>
                          <p className="text-lg font-black text-slate-900 leading-none">
                            ₹{mb.bill_amount}
                          </p>
                        </div>
                      </div>

                      {/* Details Area */}
                      <div className="mt-3 pt-3 border-t border-slate-50 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Before Balance</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-bold text-slate-600">₹{mb.balance_before}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">After Balance</p>
                          <div className="flex items-center gap-1 justify-end mt-0.5">
                            <ArrowDownRight className={`w-3.5 h-3.5 ${isNegative ? 'text-red-500' : 'text-green-500'}`} />
                            <span className={`text-xs font-black ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
                              ₹{mb.balance_after}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Bottom Actions */}
            {!isClosed && (
              <div className="pt-4">
                <Card className="border-0 shadow-lg bg-slate-900 text-white rounded-[2rem] p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full -mr-32 -mt-32 blur-3xl" />
                  
                  <div className="relative z-10 space-y-4">
                    <div className="flex items-start gap-4">
                      <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md text-amber-400 border border-white/10 shrink-0">
                        <Sparkles className="w-6 h-6 animate-pulse" />
                      </div>
                      <div>
                        <h3 className="font-black text-lg tracking-tight">Bill and Close Month</h3>
                        <p className="text-xs text-slate-300 mt-1">
                          This will finalize calculations, automatically deduct bills from each member&apos;s available deposit, and send push notifications.
                        </p>
                      </div>
                    </div>

                    <Button 
                      onClick={() => setShowConfirmDialog(true)}
                      className="w-full h-12 bg-white text-slate-950 font-black rounded-xl hover:bg-slate-100 text-xs uppercase tracking-wider"
                    >
                      Close & Bill {getFormattedMonth(selectedMonth)} 🚀
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm italic">Failed to calculate billing statistics.</p>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Permanently Deduct & Close Month?
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              You are about to close the billing cycle for <b>{getFormattedMonth(selectedMonth)}</b>. This action is **permanent** and will immediately subtract each member&apos;s bill amount from their active profile balance.
            </DialogDescription>
          </DialogHeader>

          {stats && (
            <div className="py-2 space-y-2 border-y border-slate-100 my-2">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Total Billed Expense:</span>
                <span className="font-bold">₹{stats.totalExpense}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Calculated Meal Rate:</span>
                <span className="font-bold">₹{stats.mealRate}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Total Member Meals:</span>
                <span className="font-bold">{stats.totalMemberMeals}</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowConfirmDialog(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button 
              onClick={handleCloseMonth} 
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm & Bill Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
