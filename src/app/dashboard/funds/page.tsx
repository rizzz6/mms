'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Copy, Check, QrCode, CreditCard, Upload, History, ExternalLink, IndianRupee, Wallet, ChevronRight, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

// --- Types ---

type TransactionStatus = 'pending' | 'approved' | 'rejected'

interface TransactionRecord {
  id: string
  amount: number
  txn_id: string | null
  proof_url: string | null
  status: TransactionStatus
  created_at: string
}

interface Mess {
  name: string
  upi_id: string | null
  qr_code_url: string | null
}

// --- Main Component ---

export default function FundsPage() {
  const router = useRouter()
  const [manager, setManager] = useState<Mess | null>(null)
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  
  // Form State
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [txnId, setTxnId] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    try {
      // 2. Fetch User Transactions
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('mess_id').eq('id', user.id).single()
        if (!profile?.mess_id) return

        // 1. Fetch Mess Info (for payment details)
        const { data: messData } = await supabase
          .from('messes')
          .select('name, upi_id, qr_code_url')
          .eq('id', profile.mess_id)
          .single()
        
        if (messData) setManager(messData)

        // 2. Fetch User Transactions
        const { data: txns } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('mess_id', profile.mess_id)
          .order('created_at', { ascending: false })
        
        setTransactions(txns || [])

        // 3. Fetch Total Mess Balance
        const { data: profilesData } = await supabase.from('profiles').select('balance').eq('mess_id', profile.mess_id)
        if (profilesData) {
          const sum = profilesData.reduce((acc, curr) => acc + Number(curr.balance), 0)
          setTotalBalance(sum)
        }
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData()
  }, [fetchData])

  const copyToClipboard = () => {
    if (!manager?.upi_id) return
    navigator.clipboard.writeText(manager.upi_id)
    setCopied(true)
    toast.success('UPI ID copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setProofFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || isNaN(Number(amount))) return toast.error('Enter a valid amount')
    if (!proofFile) return toast.error('Upload a payment screenshot')

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // 1. Upload to Storage
      const fileExt = proofFile.name.split('.').pop()
      const fileName = `proofs/${user.id}-${Date.now()}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('payments')
        .upload(fileName, proofFile)

      if (uploadError) throw uploadError

      // 2. Get URL
      const { data: { publicUrl } } = supabase.storage
        .from('payments')
        .getPublicUrl(fileName)

      const { data: profile } = await supabase.from('profiles').select('mess_id').eq('id', user.id).single()

      // 3. Insert Record
      const { error: insertError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          mess_id: profile?.mess_id,
          amount: Number(amount),
          txn_id: txnId || null,
          proof_url: publicUrl,
          status: 'pending'
        })

      if (insertError) throw insertError

      toast.success('Payment proof submitted successfully!')
      setAmount('')
      setTxnId('')
      setProofFile(null)
      setShowForm(false)
      fetchData()
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
            onClick={() => router.back()}
          >
            <ChevronRight className="w-5 h-5 text-slate-600 rotate-180" />
          </Button>
          <div className="flex gap-2">
            <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Financials</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Funds & Billing</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">
        {/* Total Mess Balance Widget */}
        <Card className="border-0 shadow-xl shadow-primary/20 bg-gradient-to-br from-primary to-blue-700 text-white rounded-[2rem] overflow-hidden group">
          <CardContent className="p-8 relative">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all" />
            <div className="relative z-10 space-y-2">
              <div className="flex items-center gap-2 text-white/70">
                <Wallet className="w-4 h-4" />
                <h2 className="text-[10px] font-black uppercase tracking-widest">Total Mess Balance</h2>
              </div>
              <p className="text-5xl font-black tracking-tighter">₹{totalBalance}</p>
              <div className="flex items-center gap-2 pt-2">
                <Badge className="bg-white/20 text-white border-0 text-[8px] font-black uppercase px-2">Live Pool</Badge>
                <p className="text-[10px] text-white/60 font-medium tracking-tight">Combined balance of all active members</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scan & Pay Card */}
        <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[2rem] bg-white overflow-hidden">
          <div className="bg-slate-50/50 p-6 flex flex-col items-center text-center border-b border-slate-100">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Quick Deposit</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pay via UPI or Scan QR</p>
            
            <div className="mt-6 relative">
              {manager?.qr_code_url ? (
                <div className="bg-white p-4 rounded-[2rem] shadow-xl shadow-slate-200 border border-slate-100 w-48 h-48 relative overflow-hidden active:scale-105 transition-all cursor-zoom-in">
                  <Image src={manager.qr_code_url} alt="QR" fill className="p-2 object-contain" />
                </div>
              ) : (
                <div className="bg-slate-100 w-48 h-48 rounded-[2rem] flex flex-col items-center justify-center border-2 border-dashed border-slate-200">
                  <QrCode className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-[8px] font-black text-slate-400 uppercase">QR Not Uploaded</p>
                </div>
              )}
            </div>
          </div>

          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Manager UPI ID</p>
              <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-100 group active:bg-slate-100 transition-all cursor-pointer" onClick={copyToClipboard}>
                <div className="flex items-center gap-3 truncate">
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-primary shadow-sm">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black text-slate-700 truncate">{manager?.upi_id || 'Not Set'}</span>
                </div>
                <div className="bg-white w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center shadow-sm">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                </div>
              </div>
            </div>

            <Button 
              className={`w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 flex gap-2 ${
                showForm ? 'bg-slate-100 text-slate-400 hover:bg-slate-200' : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'
              }`}
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? 'Cancel Submission' : <><Upload className="w-4 h-4" /> Submit Proof</>}
            </Button>
          </CardContent>
        </Card>

        {/* Submission Form */}
        {showForm && (
          <Card className="border-0 shadow-2xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 space-y-6">
              <div className="space-y-1">
                <h3 className="text-xl font-black uppercase tracking-tight">Payment Details</h3>
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Verify your transaction below</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Amount Paid</Label>
                  <div className="relative group">
                    <Input 
                      id="amount"
                      type="number" 
                      placeholder="0.00" 
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-14 rounded-2xl pl-12 text-lg font-black focus:border-primary transition-all" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                    <div className="absolute left-4 top-4 bg-white/10 w-6 h-6 rounded-lg flex items-center justify-center">
                      <IndianRupee className="w-3.5 h-3.5 text-white/60" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="txnid" className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">UTR / Transaction ID</Label>
                  <Input 
                    id="txnid"
                    placeholder="Reference Number" 
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-12 rounded-2xl font-bold focus:border-primary transition-all" 
                    value={txnId}
                    onChange={(e) => setTxnId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Proof of Payment</Label>
                  <div className={`relative flex flex-col items-center justify-center gap-3 bg-white/5 border-2 border-dashed rounded-[2rem] p-8 transition-all ${
                    proofFile ? 'border-green-500/50 bg-green-500/5' : 'border-white/10 hover:border-white/20'
                  }`}>
                    {proofFile ? (
                      <div className="text-center animate-in zoom-in-95">
                        <div className="bg-green-500/20 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Check className="w-6 h-6 text-green-400" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-tight mb-2 truncate max-w-[200px]">{proofFile.name}</p>
                        <Button type="button" variant="ghost" className="h-8 text-[9px] font-black uppercase text-red-400 hover:text-red-500 hover:bg-red-500/10" onClick={() => setProofFile(null)}>Remove Image</Button>
                      </div>
                    ) : (
                      <Label htmlFor="proof-upload" className="cursor-pointer flex flex-col items-center group">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-all mb-3">
                          <Upload className="w-6 h-6 text-white/40" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Select Screenshot</span>
                        <Input id="proof-upload" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                      </Label>
                    )}
                  </div>
                </div>

                <Button type="submit" className="w-full h-14 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all mt-4" disabled={submitting}>
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Verification'}
                </Button>
              </form>
            </div>
          </Card>
        )}

        {/* Transaction History */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Transaction History</h3>
            <div className="h-px flex-1 bg-slate-200 mx-4" />
            <History className="w-4 h-4 text-slate-300" />
          </div>
          
          <div className="space-y-3">
            {transactions.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-[2rem] border border-dashed border-slate-200">
                <ReceiptText className="w-10 h-10 text-slate-100 mx-auto mb-3" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">No payment history</p>
              </div>
            ) : (
              transactions.map((txn) => (
                <Card key={txn.id} className="border-0 shadow-lg shadow-slate-200/50 rounded-3xl overflow-hidden group">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${
                        txn.status === 'approved' ? 'bg-green-50 text-green-600' :
                        txn.status === 'rejected' ? 'bg-red-50 text-red-600' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        <IndianRupee className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-black text-sm text-slate-800">₹{txn.amount}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                          {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(txn.created_at))}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[8px] font-black uppercase px-2 h-6 border-0 ${
                        txn.status === 'approved' ? 'bg-green-500 text-white' :
                        txn.status === 'rejected' ? 'bg-red-500 text-white' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {txn.status}
                      </Badge>
                      {txn.proof_url && (
                        <a href={txn.proof_url} target="_blank" rel="noreferrer">
                          <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100">
                            <ExternalLink className="w-4 h-4 text-slate-400" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
