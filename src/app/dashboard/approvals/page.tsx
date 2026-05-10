'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, CheckCircle2, XCircle, ExternalLink, IndianRupee, ShoppingBag, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'

// --- Types ---

interface PendingTransaction {
  id: string
  amount: number
  txn_id: string | null
  proof_url: string | null
  created_at: string
  user_id: string
  profiles: { full_name: string }
}

interface PendingBazarLog {
  id: string
  amount: number
  items: string
  date: string
  shopper_id: string
  profiles: { full_name: string }
}

// --- Main Component ---

export default function ApprovalsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<'payments' | 'bazar'>('payments')
  const [transactions, setTransactions] = useState<PendingTransaction[]>([])
  const [bazarLogs, setBazarLogs] = useState<PendingBazarLog[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  // Rejection State
  const [rejectTarget, setRejectTarget] = useState<PendingTransaction | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Fetch Transactions
      const { data: txns } = await supabase
        .from('transactions')
        .select('*, profiles(full_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      
      setTransactions((txns as any) || [])

      // 2. Fetch Bazar Logs
      const { data: bzrs } = await supabase
        .from('bazar_logs')
        .select('*, profiles!shopper_id(full_name)')
        .eq('verified', false)
        .order('date', { ascending: true })

      setBazarLogs((bzrs as any) || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push('/login')

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      
      if (profile?.role !== 'manager') {
        toast.error('Access denied. Manager only.')
        router.push('/dashboard')
        return
      }

      fetchData()
    }
    checkRole()
  }, [supabase, router, fetchData])

  const handleApprove = async (txn: PendingTransaction) => {
    setProcessing(txn.id)
    try {
      // 1. Update Transaction Status
      const { error: txnError } = await supabase
        .from('transactions')
        .update({ status: 'approved' })
        .eq('id', txn.id)
      
      if (txnError) throw txnError

      // 2. Fetch & Increment Balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', txn.user_id)
        .single()
      
      if (profileError) throw profileError

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ balance: (profile?.balance || 0) + txn.amount })
        .eq('id', txn.user_id)
      
      if (updateError) throw updateError

      toast.success(`Approved ₹${txn.amount} for ${txn.profiles.full_name}`)
      fetchData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async () => {
    if (!rejectTarget) return
    setProcessing(rejectTarget.id)
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'rejected' })
        .eq('id', rejectTarget.id)
      
      if (error) throw error

      toast.success('Payment rejected')
      setRejectTarget(null)
      fetchData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setProcessing(null)
    }
  }

  const handleVerifyBazar = async (log: PendingBazarLog) => {
    setProcessing(log.id)
    try {
      const { error } = await supabase
        .from('bazar_logs')
        .update({ verified: true })
        .eq('id', log.id)
      
      if (error) throw error

      toast.success(`Bazar entry verified`)
      fetchData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div className="flex items-center space-x-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← Back
        </Button>
        <h1 className="text-xl font-bold">Approval Center</h1>
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-slate-100 p-1 rounded-xl">
        <button 
          onClick={() => setActiveTab('payments')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'payments' ? 'bg-white shadow-sm text-primary' : 'text-slate-500'
          }`}
        >
          <IndianRupee className="w-3.5 h-3.5" />
          Payments
          {transactions.length > 0 && (
            <Badge variant="destructive" className="ml-1 h-4 min-w-[16px] px-1 text-[8px] flex items-center justify-center">
              {transactions.length}
            </Badge>
          )}
        </button>
        <button 
          onClick={() => setActiveTab('bazar')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'bazar' ? 'bg-white shadow-sm text-primary' : 'text-slate-500'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          Bazar
          {bazarLogs.length > 0 && (
            <Badge variant="destructive" className="ml-1 h-4 min-w-[16px] px-1 text-[8px] flex items-center justify-center">
              {bazarLogs.length}
            </Badge>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {activeTab === 'payments' ? (
            <>
              {transactions.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  <ReceiptText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No pending payments</p>
                </div>
              ) : (
                transactions.map((txn) => (
                  <Card key={txn.id} className="border-0 shadow-md overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold text-slate-700">{txn.profiles.full_name}</p>
                          <p className="text-[10px] text-slate-500">
                            {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(txn.created_at))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-primary">₹{txn.amount}</p>
                          <p className="text-[9px] font-mono text-slate-400">TXN: {txn.txn_id || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="p-3 flex gap-2">
                        {txn.proof_url && (
                          <a href={txn.proof_url} target="_blank" rel="noreferrer" className="flex-1">
                            <Button variant="outline" size="sm" className="w-full text-xs gap-2">
                              <ExternalLink className="w-3 h-3" /> Proof
                            </Button>
                          </a>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="flex-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setRejectTarget(txn)}
                          disabled={processing === txn.id}
                        >
                          <XCircle className="w-3 h-3 mr-1" /> Reject
                        </Button>
                        <Button 
                          size="sm" 
                          className="flex-1 text-xs bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove(txn)}
                          disabled={processing === txn.id}
                        >
                          {processing === txn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" /> Approve</>}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </>
          ) : (
            <>
              {bazarLogs.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No pending bazar logs</p>
                </div>
              ) : (
                bazarLogs.map((log) => (
                  <Card key={log.id} className="border-0 shadow-md">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-sm font-bold">{log.profiles.full_name}</CardTitle>
                          <CardDescription className="text-[10px]">
                            {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(log.date))}
                          </CardDescription>
                        </div>
                        <p className="text-lg font-black text-orange-600">₹{log.amount}</p>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg mb-3">
                        {log.items}
                      </p>
                      <Button 
                        size="sm" 
                        className="w-full text-xs gap-2" 
                        onClick={() => handleVerifyBazar(log)}
                        disabled={processing === log.id}
                      >
                        {processing === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3" /> Verify & Close</>}
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </>
          )}
        </div>
      )}

      {/* Rejection Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-[90vw] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reject Payment?</DialogTitle>
            <DialogDescription>
              This will mark the payment as rejected. You can add a note for the member.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-xs font-bold mb-2">Member: {rejectTarget?.profiles.full_name}</p>
            <p className="text-xs font-bold mb-4">Amount: ₹{rejectTarget?.amount}</p>
            <Textarea 
              placeholder="Reason for rejection (optional)" 
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              className="resize-none"
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="ghost" onClick={() => setRejectTarget(null)} className="flex-1">Cancel</Button>
            <Button variant="destructive" onClick={handleReject} className="flex-1" disabled={processing === rejectTarget?.id}>
              {processing === rejectTarget?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
