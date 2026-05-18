'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Search, User, Calendar, CreditCard, ChevronRight, ShieldCheck, Shield, Trash2, Plus, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface Profile {
  id: string
  full_name: string
  role: string
  balance: number
  joined_at: string
  is_inactive?: boolean
  inactive_until?: string | null
}

export default function MembersList() {
  const [members, setMembers] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState<string | null>(null)
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustType, setAdjustType] = useState<'add' | 'remove'>('add')
  const [isProcessing, setIsProcessing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase.from('profiles').select('id, role, mess_id').eq('id', user.id).single()
      setMyRole(profile?.role || null)
      // const myId = profile?.id

      const allowedRoles = ['manager', 'co_manager']
      if (!profile || !allowedRoles.includes(profile.role) || !profile?.mess_id) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('mess_id', profile.mess_id)
        .eq('status', 'approved')
        .order('full_name')

      if (error) {
        toast.error('Failed to load members')
      } else {
        setMembers(data || [])
      }
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  const filteredMembers = members.filter(m => 
    m.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdjustBalance = async () => {
    if (!selectedMember || !adjustAmount || isNaN(Number(adjustAmount))) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsProcessing(true)
    const amount = Number(adjustAmount)
    const newBalance = adjustType === 'add' 
      ? selectedMember.balance + amount 
      : selectedMember.balance - amount

    const { error } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', selectedMember.id)

    if (error) {
      toast.error('Failed to update balance')
    } else {
      toast.success(`Balance ${adjustType === 'add' ? 'added' : 'removed'} successfully`)
      setMembers(members.map(m => m.id === selectedMember.id ? { ...m, balance: newBalance } : m))
      setSelectedMember(null)
      setAdjustAmount('')
    }
    setIsProcessing(false)
  }

  const handleToggleCoManager = async (memberId: string, currentRole: string) => {
    setIsProcessing(true)
    const newRole = currentRole === 'co_manager' ? 'member' : 'co_manager'
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', memberId)
      
      if (error) throw error
      
      toast.success(newRole === 'co_manager' ? 'Member promoted to Co-Manager!' : 'Co-Manager demoted to Member!')
      setMembers(members.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    } catch (err: any) {
      toast.error(err.message || 'Failed to update member role')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRemoveMember = async (id: string) => {
    setIsProcessing(true)
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Failed to remove member. Check permissions.')
    } else {
      toast.success('Member removed from mess')
      setMembers(members.filter(m => m.id !== id))
      setShowDeleteConfirm(null)
    }
    setIsProcessing(false)
  }



  const toggleInactive = async (memberId: string, currentStatus: boolean) => {
    setIsProcessing(true)
    const { error } = await supabase
      .from('profiles')
      .update({ is_inactive: !currentStatus })
      .eq('id', memberId)

    if (error) {
      toast.error('Failed to update status')
    } else {
      toast.success(currentStatus ? 'Member marked as active' : 'Member marked as inactive')
      setMembers(members.map(m => m.id === memberId ? { ...m, is_inactive: !currentStatus } : m))
    }
    setIsProcessing(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const allowedRoles = ['manager', 'co_manager']
  if (!allowedRoles.includes(myRole || '')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <Shield className="w-12 h-12 text-slate-300 mb-4" />
        <h1 className="text-xl font-bold text-slate-800">Access Denied</h1>
        <p className="text-sm text-slate-500 max-w-xs">This page is restricted to Managers or Co-Managers only.</p>
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
            onClick={() => window.history.back()}
          >
            <ChevronRight className="w-5 h-5 text-slate-600 rotate-180" />
          </Button>
          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-primary/10 text-primary border-0 font-bold uppercase tracking-tighter text-[10px] px-3 py-1.5 rounded-full">
              {members.filter(m => !m.is_inactive).length} Members Active
            </Badge>
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Administration</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Mess Members</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search members..." 
            className="pl-10 h-12 rounded-2xl border-slate-200 bg-white shadow-sm focus:ring-primary/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

      <div className="space-y-3">
        {filteredMembers.map((member) => (
          <Card key={member.id} className="border-0 shadow-sm bg-white overflow-hidden active:scale-[0.98] transition-transform">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl shrink-0 ${member.role === 'manager' ? 'bg-primary text-white shadow-lg shadow-primary/20' : member.role === 'co_manager' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                  {member.role === 'manager' ? <ShieldCheck className="w-6 h-6" /> : member.role === 'co_manager' ? <ShieldCheck className="w-6 h-6 text-purple-600" /> : <User className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 truncate">{member.full_name}</h3>
                    {member.role === 'manager' && (
                      <Badge variant="default" className="text-[9px] h-4 px-1 font-black bg-slate-900">MANAGER</Badge>
                    )}
                    {member.role === 'co_manager' && (
                      <Badge variant="default" className="text-[9px] h-4 px-1.5 font-black bg-purple-600 text-white hover:bg-purple-700">CO-MANAGER</Badge>
                    )}
                    {member.is_inactive && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 font-black border-orange-500 text-orange-600 bg-orange-50 uppercase">ABSENT</Badge>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Calendar className="w-3 h-3" />
                      <span className="text-[10px] font-medium">Joined {new Date(member.joined_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end text-slate-500 mb-1">
                    <CreditCard className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Balance</span>
                  </div>
                  <p className={`text-lg font-black ${member.balance < 200 ? 'text-red-600' : 'text-slate-900'}`}>
                    ₹{member.balance}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 px-3 rounded-lg text-[11px] font-bold gap-1.5 border-slate-200"
                    onClick={() => {
                      setSelectedMember(member)
                      setAdjustType('add')
                    }}
                  >
                    <Plus className="w-3 h-3 text-green-600" />
                    Add Cash
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 px-3 rounded-lg text-[11px] font-bold gap-1.5 border-slate-200"
                    onClick={() => {
                      setSelectedMember(member)
                      setAdjustType('remove')
                    }}
                  >
                    <Minus className="w-3 h-3 text-red-600" />
                    Remove Cash
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className={`h-8 px-3 rounded-lg text-[11px] font-bold gap-1.5 border-slate-200 ${member.is_inactive ? 'bg-orange-50 text-orange-600 border-orange-100' : ''}`}
                    onClick={() => toggleInactive(member.id, !!member.is_inactive)}
                    disabled={isProcessing}
                  >
                    {member.is_inactive ? 'Mark Active' : 'Mark Absent'}
                  </Button>

                  {myRole === 'manager' && member.role !== 'manager' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={`h-8 px-2.5 rounded-lg text-[10px] font-bold border-slate-200 ${
                        member.role === 'co_manager' ? 'text-red-600 hover:bg-red-50 border-red-100' : 'text-purple-600 hover:bg-purple-50 border-purple-100'
                      }`}
                      onClick={() => handleToggleCoManager(member.id, member.role)}
                      disabled={isProcessing}
                    >
                      {member.role === 'co_manager' ? 'Demote' : 'Promote'}
                    </Button>
                  )}
                  
                  {myRole === 'manager' && member.role !== 'manager' && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setShowDeleteConfirm(member.id)}
                      disabled={isProcessing}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Adjust Balance Dialog */}
        <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {adjustType === 'add' ? <Plus className="text-green-600 w-5 h-5" /> : <Minus className="text-red-600 w-5 h-5" />}
                {adjustType === 'add' ? 'Add Cash' : 'Take Back Cash'}
              </DialogTitle>
              <DialogDescription>
                Manually {adjustType === 'add' ? 'add balance to' : 'remove balance from'} <b>{selectedMember?.full_name}</b>&apos;s account.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input 
                  id="amount" 
                  type="number" 
                  placeholder="Enter amount" 
                  className="h-12 text-lg font-bold"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                />
              </div>
              <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                <span className="text-xs text-slate-500">Current Balance:</span>
                <span className="text-sm font-bold">₹{selectedMember?.balance}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSelectedMember(null)} disabled={isProcessing}>Cancel</Button>
              <Button 
                onClick={handleAdjustBalance} 
                disabled={isProcessing}
                className={adjustType === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirm {adjustType === 'add' ? 'Addition' : 'Removal'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm Dialog */}
        <Dialog open={!!showDeleteConfirm} onOpenChange={(open) => !open && setShowDeleteConfirm(null)}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle className="text-red-600">Remove Member?</DialogTitle>
              <DialogDescription>
                This will permanently remove this member and all their meal/transaction logs from the mess.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(null)} disabled={isProcessing}>Keep Member</Button>
              <Button 
                variant="destructive" 
                onClick={() => showDeleteConfirm && handleRemoveMember(showDeleteConfirm)}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Yes, Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {filteredMembers.length === 0 && (
          <div className="text-center py-10">
            <p className="text-slate-400 text-sm italic">No members found matching &quot;{search}&quot;</p>
          </div>
        )}
      </div>
    </div>
    </div>
  )
}
