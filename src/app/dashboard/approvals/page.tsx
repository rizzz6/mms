'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, CheckCircle2, XCircle, ExternalLink, IndianRupee, ShoppingBag, ReceiptText, ChevronRight, UserPlus, UserMinus, UserCheck } from 'lucide-react'
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

interface PendingMember {
  id: string
  full_name: string
  joined_at: string
  email?: string
}

// --- Main Component ---

export default function ApprovalsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<'payments' | 'bazar' | 'members'>('payments')
  const [transactions, setTransactions] = useState<PendingTransaction[]>([])
  const [bazarLogs, setBazarLogs] = useState<PendingBazarLog[]>([])
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  // Rejection State
  const [rejectTarget, setRejectTarget] = useState<PendingTransaction | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data: profile } = await supabase.from('profiles').select('mess_id').eq('id', user.id).single()
      if (!profile?.mess_id) return

      // 1. Fetch Transactions (for this mess)
      const { data: txns } = await supabase
        .from('transactions')
        .select('*, profiles(full_name)')
        .eq('mess_id', profile.mess_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      
      setTransactions((txns as PendingTransaction[]) || [])

      // 2. Fetch Bazar Logs (for this mess)
      const { data: bzrs } = await supabase
        .from('bazar_logs')
        .select('*, profiles!shopper_id(full_name)')
        .eq('mess_id', profile.mess_id)
        .eq('verified', false)
        .order('date', { ascending: true })

      setBazarLogs((bzrs as PendingBazarLog[]) || [])

      // 3. Fetch Pending Members (for this mess)
      const { data: members } = await supabase
        .from('profiles')
        .select('id, full_name, joined_at')
        .eq('mess_id', profile.mess_id)
        .eq('status', 'pending')
        .order('joined_at', { ascending: true })
      
      setPendingMembers((members as PendingMember[]) || [])
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
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
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
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
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
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setProcessing(null)
    }
  }

  const handleMemberAction = async (memberId: string, action: 'approved' | 'rejected') => {
    setProcessing(memberId)
    try {
      if (action === 'rejected') {
        const { error } = await supabase
          .from('profiles')
          .update({ status: 'rejected', mess_id: null })
          .eq('id', memberId)
        if (error) throw error
        toast.success('Member request denied')
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({ status: 'approved' })
          .eq('id', memberId)
        if (error) throw error
        toast.success('Member approved!')
      }
      fetchData()
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Premium Header */}
      <div className="bg-white px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm border-b border-slate-100 mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 shadow-sm active:scale-90 transition-all"
            onClick={() => router.back()}
          >
            <ChevronRight className="w-5 h-5 text-slate-600 rotate-180" />
          </Button>
          <div className="flex gap-2">
            <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Verification</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Approval Center</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">
        {/* Premium Tab Switcher */}
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
          <button 
            onClick={() => setActiveTab('payments')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
              activeTab === 'payments' ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <IndianRupee className="w-3.5 h-3.5" />
            Payments
            {transactions.length > 0 && (
              <span className={`ml-1 h-5 min-w-[20px] px-1 text-[9px] font-black flex items-center justify-center rounded-full ${
                activeTab === 'payments' ? 'bg-white text-primary' : 'bg-red-500 text-white'
              }`}>
                {transactions.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('bazar')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
              activeTab === 'bazar' ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Bazar
            {bazarLogs.length > 0 && (
              <span className={`ml-1 h-5 min-w-[20px] px-1 text-[9px] font-black flex items-center justify-center rounded-full ${
                activeTab === 'bazar' ? 'bg-white text-primary' : 'bg-red-500 text-white'
              }`}>
                {bazarLogs.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('members')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
              activeTab === 'members' ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Members
            {pendingMembers.length > 0 && (
              <span className={`ml-1 h-5 min-w-[20px] px-1 text-[9px] font-black flex items-center justify-center rounded-full ${
                activeTab === 'members' ? 'bg-white text-primary' : 'bg-red-500 text-white'
              }`}>
                {pendingMembers.length}
              </span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-primary" />
              </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading requests...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTab === 'payments' ? (
              <>
                {transactions.length === 0 ? (
                  <div className="text-center py-24 bg-white rounded-[2rem] border border-dashed border-slate-200">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ReceiptText className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">All clear! No pending payments</p>
                  </div>
                ) : (
                  transactions.map((txn) => (
                    <Card key={txn.id} className="border-0 shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden group active:scale-[0.98] transition-all">
                      <div className="p-6 space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-xl">
                              {txn.profiles.full_name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-800">{txn.profiles.full_name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(txn.created_at))}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-primary">₹{txn.amount}</p>
                            <Badge variant="outline" className="text-[9px] font-black tracking-tighter bg-slate-50 border-slate-100">
                              ID: {txn.txn_id?.slice(-6) || 'N/A'}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {txn.proof_url && (
                            <a href={txn.proof_url} target="_blank" rel="noreferrer" className="flex-1">
                              <Button variant="outline" className="w-full h-12 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 bg-slate-50 hover:bg-slate-100 border-slate-200">
                                <ExternalLink className="w-3.5 h-3.5" /> View Proof
                              </Button>
                            </a>
                          )}
                          <Button 
                            variant="ghost" 
                            className="w-12 h-12 rounded-xl text-red-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100"
                            onClick={() => setRejectTarget(txn)}
                            disabled={processing === txn.id}
                          >
                            <XCircle className="w-5 h-5" />
                          </Button>
                          <Button 
                            className="flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200 active:scale-95 transition-all"
                            onClick={() => handleApprove(txn)}
                            disabled={processing === txn.id}
                          >
                            {processing === txn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve Now"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </>
            ) : activeTab === 'bazar' ? (
              <>
                {bazarLogs.length === 0 ? (
                  <div className="text-center py-24 bg-white rounded-[2rem] border border-dashed border-slate-200">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ShoppingBag className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">All logs verified</p>
                  </div>
                ) : (
                  bazarLogs.map((log) => (
                    <Card key={log.id} className="border-0 shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
                      <div className="p-6 space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 font-black text-xl">
                              {log.profiles.full_name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-800">{log.profiles.full_name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(log.date))}
                              </p>
                            </div>
                          </div>
                          <p className="text-2xl font-black text-orange-600">₹{log.amount}</p>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Purchased Items</p>
                          <p className="text-xs font-bold text-slate-600 leading-relaxed">
                            {log.items}
                          </p>
                        </div>

                        <Button 
                          className="w-full h-12 rounded-xl text-[10px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-95 transition-all gap-2" 
                          onClick={() => handleVerifyBazar(log)}
                          disabled={processing === log.id}
                        >
                          {processing === log.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Verify Entry</>}
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </>
            ) : (
              <>
                {pendingMembers.length === 0 ? (
                  <div className="text-center py-24 bg-white rounded-[2rem] border border-dashed border-slate-200">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <UserPlus className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">No join requests</p>
                  </div>
                ) : (
                  pendingMembers.map((member) => (
                    <Card key={member.id} className="border-0 shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
                      <div className="p-6 space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-[1.5rem] bg-blue-50 flex items-center justify-center text-blue-600 font-black text-2xl border border-blue-100 shadow-inner">
                            {member.full_name.charAt(0)}
                          </div>
                          <div className="flex-1">
                            <p className="text-lg font-black text-slate-800 leading-tight">{member.full_name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              Requested {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(member.joined_at))}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <Button 
                            variant="ghost" 
                            className="flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100"
                            onClick={() => handleMemberAction(member.id, 'rejected')}
                            disabled={processing === member.id}
                          >
                            <UserMinus className="w-4 h-4 mr-2" /> Deny
                          </Button>
                          <Button 
                            className="flex-[1.5] h-12 rounded-xl text-[10px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-95 transition-all flex gap-2"
                            onClick={() => handleMemberAction(member.id, 'approved')}
                            disabled={processing === member.id}
                          >
                            {processing === member.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserCheck className="w-4 h-4" /> Approve Member</>}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Premium Rejection Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-[90vw] rounded-[2.5rem] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="bg-red-500 p-8 text-white flex flex-col items-center text-center space-y-4">
            <div className="bg-white/20 p-4 rounded-full backdrop-blur-md">
              <XCircle className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-black uppercase tracking-tight">Reject Payment?</h2>
              <p className="text-sm font-medium opacity-90 leading-tight">
                Are you sure you want to reject <span className="font-black">₹{rejectTarget?.amount}</span> from <span className="font-black">{rejectTarget?.profiles.full_name}</span>?
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4 bg-white">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Reason for Rejection</p>
              <Textarea 
                placeholder="Explain why this was rejected..." 
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="rounded-2xl border-slate-100 focus:ring-red-500 min-h-[100px] text-xs font-bold p-4 bg-slate-50"
              />
            </div>
            
            <div className="flex gap-3">
              <Button 
                variant="ghost" 
                className="flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400"
                onClick={() => setRejectTarget(null)}
              >
                Cancel
              </Button>
              <Button 
                className="flex-[2] h-12 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200 active:scale-95 transition-all"
                onClick={handleReject}
                disabled={processing === rejectTarget?.id}
              >
                {processing === rejectTarget?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
