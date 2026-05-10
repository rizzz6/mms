'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Loader2, Copy, Check, QrCode, CreditCard, Upload, History, ExternalLink, IndianRupee } from 'lucide-react'
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

// --- Main Component ---

export default function AddFundsPage() {
  const [manager, setManager] = useState<any>(null)
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
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
      // 1. Fetch Manager Info
      const { data: managerData } = await supabase
        .from('profiles')
        .select('full_name, upi_id, qr_code_url')
        .eq('role', 'manager')
        .single()
      
      if (managerData) setManager(managerData)

      // 2. Fetch User Transactions
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: txns } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        
        setTransactions(txns || [])
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()
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

      // 3. Insert Record
      const { error: insertError } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
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
    } catch (error: any) {
      toast.error(error.message)
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
    <div className="max-w-md mx-auto p-4 space-y-6 pb-20">
      <div className="flex items-center space-x-2">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          ← Back
        </Button>
        <h1 className="text-xl font-bold">Add Funds</h1>
      </div>

      {/* Step 1: Payment Details */}
      <Card className="border-0 shadow-lg overflow-hidden bg-white">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl font-bold">Scan & Pay</CardTitle>
          <CardDescription>Pay the Manager using QR or UPI ID</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex flex-col items-center">
          {manager?.qr_code_url ? (
            <div className="bg-white p-3 rounded-2xl border-4 border-slate-50 w-full max-w-[200px] aspect-square relative shadow-inner">
              <Image src={manager.qr_code_url} alt="QR" fill className="object-contain" />
            </div>
          ) : (
            <div className="bg-slate-50 w-full max-w-[200px] aspect-square rounded-2xl flex items-center justify-center border-2 border-dashed">
              <QrCode className="w-12 h-12 text-slate-200" />
            </div>
          )}

          <div className="w-full">
            <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between border">
              <div className="flex items-center gap-2 truncate">
                <CreditCard className="w-4 h-4 text-primary" />
                <span className="text-xs font-mono font-bold truncate">{manager?.upi_id || 'UPI Not Set'}</span>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copyToClipboard}>
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
              </Button>
            </div>
          </div>

          <Button 
            className="w-full font-bold shadow-md h-11" 
            variant={showForm ? "outline" : "default"}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel Submission' : 'Submit Payment Proof'}
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Submission Form (Collapsible) */}
      {showForm && (
        <Card className="border-0 shadow-xl bg-primary text-white">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Submission Form
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-white/80">Amount (₹)</Label>
                <div className="relative">
                  <Input 
                    id="amount"
                    type="number" 
                    placeholder="0.00" 
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40 h-11 pl-10" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                  <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="txnid" className="text-white/80">Transaction ID / UTR</Label>
                <Input 
                  id="txnid"
                  placeholder="Optional" 
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 h-11" 
                  value={txnId}
                  onChange={(e) => setTxnId(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white/80">Payment Screenshot</Label>
                <div className="flex flex-col items-center gap-3 bg-white/5 border border-white/20 rounded-xl p-4">
                  {proofFile ? (
                    <div className="text-center">
                      <p className="text-[10px] text-white/60 mb-2 truncate max-w-[200px]">{proofFile.name}</p>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setProofFile(null)}>Remove</Button>
                    </div>
                  ) : (
                    <Label htmlFor="proof-upload" className="cursor-pointer flex flex-col items-center">
                      <Upload className="w-8 h-8 mb-2 text-white/40" />
                      <span className="text-xs font-bold">Select Screenshot</span>
                      <Input id="proof-upload" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </Label>
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full bg-white text-primary hover:bg-slate-100 font-black h-11" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Submission'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Transaction History */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2 px-1 text-slate-500">
          <History className="w-4 h-4" />
          My Submissions
        </h3>
        
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-center py-8 text-xs text-slate-400 italic">No payments submitted yet.</p>
          ) : (
            transactions.map((txn) => (
              <Card key={txn.id} className="border-0 shadow-sm">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-100 p-2 rounded-lg">
                      <IndianRupee className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">₹{txn.amount}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(txn.created_at))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={`text-[10px] capitalize ${
                      txn.status === 'approved' ? 'text-green-600 bg-green-50 border-green-200' :
                      txn.status === 'rejected' ? 'text-red-600 bg-red-50 border-red-200' :
                      'text-amber-600 bg-amber-50 border-amber-200'
                    }`}>
                      {txn.status}
                    </Badge>
                    {txn.proof_url && (
                      <a href={txn.proof_url} target="_blank" rel="noreferrer">
                        <Button size="icon" variant="ghost" className="h-8 w-8">
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
  )
}
