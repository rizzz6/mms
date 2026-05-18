'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Calendar, ChevronLeft, ChevronRight, ShoppingBag, Droplets, AlertCircle, History, CheckCircle2, ReceiptText, Edit2, ArrowRightLeft, ListFilter, X, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { computeRoster, DayAssignment, Member, DutyRecord, AssignmentDetail } from '@/lib/roster-engine'
import { restockInventoryItem, addCustomInventoryItem } from '@/app/actions/inventory'
import { issuePenalty } from '@/app/actions/penalties'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// --- Helpers ---

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  return new Date(d.setDate(diff))
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(new Date(dateStr))
}

// --- Main Component ---

export default function RosterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [members, setMembers] = useState<Member[]>([])
  // const [allRecords, setAllRecords] = useState<DutyRecord[]>([])
  const [assignments, setAssignments] = useState<DayAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('member')
  const [weekOffset, setWeekOffset] = useState(0)

  // Bazar Form State
  const [bazarAmount, setBazarAmount] = useState('')
  const [bazarItems, setBazarItems] = useState('')
  const [submittingBazar, setSubmittingBazar] = useState(false)
  const [todayLog, setTodayLog] = useState<{ id: string; amount: number; items: string; verified: boolean } | null>(null)
  const [reassignTarget, setReassignTarget] = useState<{ date: string, type: 'bazar' | 'water', memberId: string } | null>(null)
  const [isEditingBazar, setIsEditingBazar] = useState(false)
  const [messId, setMessId] = useState<string | null>(null)



  // Pantry Sync State
  const [pantryItems, setPantryItems] = useState<any[]>([])
  const [parsedSuggestions, setParsedSuggestions] = useState<any[]>([])
  const [approvePantrySync, setApprovePantrySync] = useState(true)

  // Fine & Penalty states
  const [finesEnabled, setFinesEnabled] = useState(false)
  const [skippedDutyFine, setSkippedDutyFine] = useState(50)
  const [penalizeOnSkip, setPenalizeOnSkip] = useState(false)

  // Client-side parser for bazaar description text
  const parseClientDescription = (text: string) => {
    if (!text) return []
    const parsed: { name: string; quantity: number; unit: string; price: number }[] = []
    const parts = text.split(/[,;]+/)
    const regex = /([a-zA-Z\s]+)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(\d+(?:\.\d+)?)/
    parts.forEach(part => {
      const match = part.trim().match(regex)
      if (match) {
        const nameRaw = match[1].trim()
        const quantity = parseFloat(match[2])
        const unit = (match[3] || 'kg').trim()
        const price = parseFloat(match[4])
        const name = nameRaw.charAt(0).toUpperCase() + nameRaw.slice(1).toLowerCase()
        if (name && !isNaN(quantity) && !isNaN(price)) {
          parsed.push({ name, quantity, unit, price })
        }
      }
    })
    return parsed
  }

  useEffect(() => {
    const suggestions = parseClientDescription(bazarItems)
    setParsedSuggestions(suggestions)
  }, [bazarItems])



  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // Get profile
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!profile?.mess_id) return
      setUserRole(profile.role)
      setMessId(profile.mess_id)

      // Get range
      const startDate = addDays(startOfWeek(new Date()), weekOffset * 7)
      const endDate = addDays(startDate, 6)
      const endDateStr = endDate.toISOString().split('T')[0]
      const todayStr = new Date().toISOString().split('T')[0]

      // Fetch all required data in parallel
      const [mData, rData, logRes, pItemsRes, cRowsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, joined_at, is_inactive, inactive_until, role')
          .eq('mess_id', profile.mess_id)
          .eq('status', 'approved')
          .order('joined_at', { ascending: true }),
        supabase
          .from('duty_roster')
          .select('*')
          .eq('mess_id', profile.mess_id)
          .lte('date', endDateStr)
          .order('date', { ascending: true }),
        supabase
          .from('bazar_logs')
          .select('*')
          .eq('mess_id', profile.mess_id)
          .eq('shopper_id', user.id)
          .eq('date', todayStr)
          .maybeSingle(),
        supabase
          .from('inventory_items')
          .select('*')
          .eq('mess_id', profile.mess_id),
        supabase
          .from('mess_config')
          .select('key, value')
          .eq('mess_id', profile.mess_id)
          .in('key', ['fines_enabled', 'penalty_skipped_duty', 'exclude_managers_from_duty', 'exclude_comanagers_from_duty'])
      ])

      const formattedMembers = (mData.data as Member[]) || []
      setMembers(formattedMembers)

      const formattedRecords = (rData.data as DutyRecord[]) || []

      setTodayLog(logRes.data)
      setPantryItems(pItemsRes.data || [])

      const cMap: Record<string, string> = {}
      cRowsRes.data?.forEach(r => cMap[r.key] = r.value)
      setFinesEnabled(cMap['fines_enabled'] === 'true')
      setSkippedDutyFine(Number(cMap['penalty_skipped_duty'] || 50))

      // Exclude managers from scheduling if configured
      const excludeManagers = cMap['exclude_managers_from_duty'] === 'true'
      const excludeCoManagers = cMap['exclude_comanagers_from_duty'] === 'true'
      const filteredMembersForRoster = formattedMembers.filter(m => {
        if (excludeManagers && m.role === 'manager') {
          return false
        }
        if (excludeCoManagers && m.role === 'co_manager') {
          return false
        }
        return true
      })

      // 3. Compute
      const roster = computeRoster(filteredMembersForRoster, formattedRecords, startDate, 7)
      setAssignments(roster)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load roster')
    } finally {
      setLoading(false)
    }
  }, [supabase, weekOffset])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleBazarSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bazarAmount || isNaN(Number(bazarAmount)) || Number(bazarAmount) <= 0)
      return toast.error('Enter a valid amount')
    if (!bazarItems.trim())
      return toast.error('Please describe the items purchased')

    setSubmittingBazar(true)
    try {
      const { error } = await supabase.from('bazar_logs').insert({
        shopper_id: userId,
        mess_id: messId,
        amount: Number(bazarAmount),
        items: bazarItems.trim(),
        date: new Date().toISOString().split('T')[0],
        verified: false
      }).select().single()

      if (error) throw error

      // Sync suggestions to pantry inventory
      if (approvePantrySync && parsedSuggestions.length > 0) {
        for (const sugg of parsedSuggestions) {
          try {
            // Find existing item case-insensitive
            const existing = pantryItems.find(
              pi => pi.item_name.toLowerCase() === sugg.name.toLowerCase()
            )
            let itemId = existing?.id

            if (!itemId) {
              // Create custom item on the fly
              const createRes = await addCustomInventoryItem(sugg.name, 'Staple', sugg.unit, 2)
              if (createRes.success && createRes.item) {
                itemId = createRes.item.id
              }
            }

            if (itemId) {
              await restockInventoryItem(itemId, sugg.quantity)
            }
          } catch (err) {
            console.error('Failed to sync to inventory:', sugg, err)
          }
        }
      }

      toast.success('Bazar log & pantry stocks updated!')
      setBazarAmount('')
      setBazarItems('')
      fetchData()
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setSubmittingBazar(false)
    }
  }

  const [skipDialogTarget, setSkipDialogTarget] = useState<{ date: string, type: 'bazar' | 'water', assignment: AssignmentDetail } | null>(null)
  const [followUpTarget, setFollowUpTarget] = useState<{ date: string, type: 'bazar' | 'water', member: Member } | null>(null)

  const handleFollowUpAssign = async (confirm: boolean) => {
    if (!followUpTarget || !confirm) {
      setFollowUpTarget(null)
      fetchData()
      return
    }

    const { date, type, member } = followUpTarget
    const tomorrow = new Date(date)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    setProcessing(`${tomorrowStr}-${type}-followup`)
    try {
      const { error } = await supabase
        .from('duty_roster')
        .upsert({
          user_id: member.id,
          mess_id: messId,
          date: tomorrowStr,
          duty_type: type,
          is_skipped: false,
          is_cancelled: false
        }, { onConflict: 'user_id, date, duty_type' })

      if (error) throw error

      await supabase.from('duty_roster_logs').insert({
        mess_id: messId,
        changed_by: userId,
        action: 'follow-up',
        note: `Assigned ${type} on ${tomorrowStr} to ${member.full_name} (Follow-up)`
      })

      toast.success(`Assigned to ${tomorrowStr}`)
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setProcessing(null)
      setFollowUpTarget(null)
      fetchData()
    }
  }

  const handleCancelDuty = async () => {
    if (!skipDialogTarget || !userId) return
    const { date, type, assignment } = skipDialogTarget
    setProcessing(`${date}-${type}`)
    
    try {
      // Issue fine if penalizeOnSkip is toggled
      if (penalizeOnSkip && finesEnabled) {
        const targetMember = assignment.member
        const res = await issuePenalty(
          targetMember.id,
          'skipped_duty',
          skippedDutyFine,
          `Skipped ${type === 'bazar' ? 'Bazaar' : 'Water'} duty on ${date}`
        )
        if (res.success) {
          toast.success(`Fined ₹${skippedDutyFine} to ${targetMember.full_name}`)
        } else {
          toast.error(res.error || 'Failed to apply skipped duty fine')
        }
      }

      let recordId = assignment.recordId
      if (!recordId) {
        const { data, error } = await supabase.from('duty_roster').insert({
          user_id: assignment.member.id,
          mess_id: messId,
          date,
          duty_type: type,
          is_skipped: true,
          is_cancelled: true
        }).select().single()
        if (error) throw error
        recordId = data.id
      } else {
        const { error } = await supabase.from('duty_roster').update({ 
          is_skipped: true, 
          is_cancelled: true 
        }).eq('id', recordId)
        if (error) throw error
      }

      await supabase.from('duty_roster_logs').insert({
        roster_id: recordId,
        mess_id: messId,
        changed_by: userId,
        action: 'cancel',
        note: `Cancelled ${type} on ${date} (No ${type} needed)`
      })

      toast.success(`${type === 'bazar' ? 'Bazaar' : 'Water'} duty cancelled`)
      setSkipDialogTarget(null)
      // Set follow up for the original member
      setFollowUpTarget({ date, type, member: assignment.member })
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
      fetchData()
    } finally {
      setProcessing(null)
    }
  }

  const handleSkip = async (date: string, type: 'bazar' | 'water', assignment: AssignmentDetail) => {
    setSkipDialogTarget({ date, type, assignment })
  }

  const handleReassign = async (newMemberId: string) => {
    const target = reassignTarget || skipDialogTarget
    if (!target) return
    
    setProcessing(`${target.date}-${target.type}`)
    
    try {
      // Issue fine if penalizeOnSkip is toggled (only if it came from the skip dialog, which has assignment details)
      if (skipDialogTarget && penalizeOnSkip && finesEnabled) {
        const targetMember = skipDialogTarget.assignment.member
        const res = await issuePenalty(
          targetMember.id,
          'skipped_duty',
          skippedDutyFine,
          `Skipped ${target.type === 'bazar' ? 'Bazaar' : 'Water'} duty on ${target.date}`
        )
        if (res.success) {
          toast.success(`Fined ₹${skippedDutyFine} to ${targetMember.full_name}`)
        } else {
          toast.error(res.error || 'Failed to apply skipped duty fine')
        }
      }

      // 1. Delete any existing assignments for this slot to ensure clean reassignment
      // (Especially important when reassigning a cancelled duty)
      await supabase
        .from('duty_roster')
        .delete()
        .eq('date', target.date)
        .eq('duty_type', target.type)
        .eq('mess_id', messId)

      // 2. Insert new assignment
      const { data: newRecord, error } = await supabase
        .from('duty_roster')
        .insert({
          user_id: newMemberId,
          mess_id: messId,
          date: target.date,
          duty_type: target.type,
          is_skipped: false,
          is_cancelled: false
        }).select().single()

      if (error) throw error

      const newMember = members.find(m => m.id === newMemberId)!

      await supabase.from('duty_roster_logs').insert({
        mess_id: messId,
        roster_id: newRecord?.id,
        changed_by: userId,
        action: 'reassign',
        note: `Reassigned ${target.type} on ${target.date} to ${newMember.full_name}`
      })

      toast.success('Duty reassigned')
      setReassignTarget(null)
      setSkipDialogTarget(null)
      setPenalizeOnSkip(false)
      // Set follow up for the NEW member
      setFollowUpTarget({ date: target.date, type: target.type, member: newMember })
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
      fetchData()
    } finally {
      setProcessing(null)
    }
  }

  const handleBazarUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!todayLog) return
    setSubmittingBazar(true)
    try {
      const { error } = await supabase
        .from('bazar_logs')
        .update({
          amount: Number(bazarAmount),
          items: bazarItems.trim()
        })
        .eq('id', todayLog.id)

      if (error) throw error

      // Sync suggestions to pantry inventory
      if (approvePantrySync && parsedSuggestions.length > 0) {
        for (const sugg of parsedSuggestions) {
          try {
            const existing = pantryItems.find(
              pi => pi.item_name.toLowerCase() === sugg.name.toLowerCase()
            )
            let itemId = existing?.id

            if (!itemId) {
              const createRes = await addCustomInventoryItem(sugg.name, 'Staple', sugg.unit, 2)
              if (createRes.success && createRes.item) {
                itemId = createRes.item.id
              }
            }

            if (itemId) {
              await restockInventoryItem(itemId, sugg.quantity)
            }
          } catch (err) {
            console.error('Failed to sync to inventory:', sugg, err)
          }
        }
      }

      toast.success('Bazar log & pantry stocks updated!')
      setIsEditingBazar(false)
      fetchData()
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setSubmittingBazar(false)
    }
  }

  const generateRoster = async () => {
    setLoading(true)
    try {
      const recordsToInsert: {
        mess_id: string;
        user_id: string;
        date: string;
        duty_type: string;
        is_skipped: boolean;
        is_cancelled: boolean;
      }[] = []
      
      assignments.forEach(day => {
        if (!messId) return
        
        if (day.bazar && !day.bazar.recordId) {
          recordsToInsert.push({
            mess_id: messId,
            user_id: day.bazar.member.id,
            date: day.date,
            duty_type: 'bazar',
            is_skipped: false,
            is_cancelled: false
          })
        }
        if (day.water && !day.water.recordId) {
          recordsToInsert.push({
            mess_id: messId,
            user_id: day.water.member.id,
            date: day.date,
            duty_type: 'water',
            is_skipped: false,
            is_cancelled: false
          })
        }
      })

      if (recordsToInsert.length > 0) {
        const { error } = await supabase.from('duty_roster').upsert(recordsToInsert)
        if (error) throw error
        toast.success('Roster generated for the week')
        fetchData()
      } else {
        toast.info('Roster already generated for this period')
      }
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setLoading(false)
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const todayAssignment = assignments.find(a => a.date === todayStr)
  const isBazarGuyToday = todayAssignment?.bazar?.member.id === userId && !todayAssignment?.bazar?.isSkipped && !todayAssignment?.bazar?.isCancelled

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
            {userRole === 'manager' && (
              <>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-10 w-10 rounded-full bg-white shadow-sm border-slate-100 text-slate-600"
                  onClick={() => router.push('/dashboard/roster/bazar-history')}
                >
                  <ListFilter className="w-4 h-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-10 w-10 rounded-full bg-white shadow-sm border-slate-100 text-slate-600"
                  onClick={() => router.push('/dashboard/roster/logs')}
                >
                  <History className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6A2C70]">Management</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Duty Roster</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">

      {/* 1. Bazaar Logging Card */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ReceiptText className="w-4 h-4 text-[#6A2C70]" />
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Bazaar Daily Log</h2>
        </div>
        
        {todayAssignment?.bazar?.isCancelled ? (
          <Card className="border-0 shadow-sm bg-slate-50">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
              <ShoppingBag className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-black text-slate-500">No Bazaar Needed Today</p>
              <p className="text-[10px] text-slate-400 font-medium">Duty has been cancelled for this date.</p>
            </CardContent>
          </Card>
        ) : !isBazarGuyToday && !todayLog ? (
          <Card className="border-0 shadow-sm bg-slate-100/50 opacity-60">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
              <ShoppingBag className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-bold text-slate-400">You are not assigned for bazaar today</p>
              <p className="text-[10px] text-slate-400 font-medium italic">Today&apos;s Shopper: {todayAssignment?.bazar?.member.full_name || 'Unassigned'}</p>
            </CardContent>
          </Card>
        ) : todayLog ? (
          <div className="bg-green-50 border-2 border-green-100 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-green-100 p-3 rounded-2xl text-green-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-black text-green-800">Logged Today (₹{todayLog.amount})</p>
                <p className="text-[10px] text-green-600 font-medium">
                  {todayLog.verified ? 'Verified by Manager' : 'Pending manager verification'}
                </p>
              </div>
            </div>
            {!todayLog.verified && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 text-slate-400 hover:text-[#6A2C70]"
                onClick={() => {
                  setBazarAmount(todayLog.amount.toString())
                  setBazarItems(todayLog.items)
                  setIsEditingBazar(true)
                }}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ) : isEditingBazar ? (
          <form onSubmit={handleBazarUpdate} className="space-y-4 bg-white p-5 rounded-2xl border-2 border-[#6A2C70] shadow-lg animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#6A2C70]" />
                <h3 className="text-sm font-black uppercase text-slate-700 tracking-wider">Update Bazar Log</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditingBazar(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="eb-amount" className="text-[10px] text-slate-500 font-black ml-1 uppercase tracking-wider">Amount (₹)</Label>
                <Input 
                  id="eb-amount"
                  type="number"
                  value={bazarAmount}
                  onChange={(e) => setBazarAmount(e.target.value)}
                  className="h-12 text-lg font-bold bg-slate-50 border-0 focus-visible:ring-[#6A2C70]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eb-items" className="text-[10px] text-slate-500 font-black ml-1 uppercase tracking-wider">Items Purchased</Label>
                <Textarea 
                  id="eb-items"
                  value={bazarItems}
                  onChange={(e) => setBazarItems(e.target.value)}
                  className="h-20 text-sm bg-slate-50 border-0 focus-visible:ring-[#6A2C70] py-3"
                  placeholder="What did you buy?"
                />
                {parsedSuggestions.length > 0 && (
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 space-y-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 fill-indigo-400 text-indigo-400 animate-pulse" />
                        Pantry Restock Detections
                      </p>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={approvePantrySync}
                          onChange={(e) => setApprovePantrySync(e.target.checked)}
                          className="w-3.5 h-3.5 accent-indigo-600 rounded outline-none"
                        />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Sync Stock</span>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {parsedSuggestions.map((s, idx) => (
                        <Badge key={idx} className="bg-indigo-100 hover:bg-indigo-100 border-0 text-indigo-700 font-bold text-[9px] h-5 rounded-lg px-2">
                          {s.name} ({s.quantity}{s.unit}) - ₹{s.price}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 text-xs font-black uppercase tracking-[0.2em] bg-[#6A2C70] hover:bg-[#4D1C54] text-white shadow-md active:scale-95 transition-all"
              disabled={submittingBazar}
            >
              {submittingBazar ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Bazar Log'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleBazarSubmit} className="space-y-4 bg-white p-5 rounded-2xl border-2 border-slate-100 shadow-md">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag className="w-4 h-4 text-[#6A2C70]" />
              <h3 className="text-sm font-black uppercase text-slate-700 tracking-wider">Log Today&apos;s Expenses</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="b-amount" className="text-[10px] text-slate-500 font-black ml-1 uppercase tracking-wider">Amount (₹)</Label>
                <Input 
                  id="b-amount"
                  type="number"
                  value={bazarAmount}
                  onChange={(e) => setBazarAmount(e.target.value)}
                  className="h-12 text-lg font-bold bg-slate-50 border-0 focus-visible:ring-[#6A2C70]"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-items" className="text-[10px] text-slate-500 font-black ml-1 uppercase tracking-wider">Items Purchased</Label>
                <Textarea 
                  id="b-items"
                  value={bazarItems}
                  onChange={(e) => setBazarItems(e.target.value)}
                  className="h-20 text-sm bg-slate-50 border-0 focus-visible:ring-[#6A2C70] py-3"
                  placeholder="Rice, Dal, Oil, etc."
                />
              </div>

              {parsedSuggestions.length > 0 && (
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 space-y-2 mt-2 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 fill-indigo-400 text-indigo-400 animate-pulse" />
                      Pantry Restock Detections
                    </p>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={approvePantrySync}
                        onChange={(e) => setApprovePantrySync(e.target.checked)}
                        className="w-3.5 h-3.5 accent-indigo-600 rounded outline-none"
                      />
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Sync Stock</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {parsedSuggestions.map((s, idx) => (
                      <Badge key={idx} className="bg-indigo-100 hover:bg-indigo-100 border-0 text-indigo-700 font-bold text-[9px] h-5 rounded-lg px-2">
                        {s.name} ({s.quantity}{s.unit}) - ₹{s.price}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                type="submit" 
                className="flex-1 h-12 text-xs font-black uppercase tracking-[0.2em] bg-[#6A2C70] hover:bg-[#4D1C54] text-white shadow-md active:scale-95 transition-all"
                disabled={submittingBazar}
              >
                {submittingBazar ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Bazar Log'}
              </Button>
              <Button 
                type="button"
                variant="outline"
                className="h-12 px-4 text-red-500 border-red-100 hover:bg-red-50 hover:text-red-600 font-bold text-[10px] uppercase tracking-wider"
                onClick={() => todayAssignment?.bazar && handleSkip(todayStr, 'bazar', todayAssignment.bazar)}
                disabled={processing === `${todayStr}-bazar`}
              >
                {processing === `${todayStr}-bazar` ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Skip'}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* 2. Week Navigator */}
      <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border">
        <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl" onClick={() => setWeekOffset(prev => prev - 1)}>
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5 font-black text-slate-700 text-sm uppercase tracking-tighter">
            <Calendar className="w-4 h-4 text-[#6A2C70]" />
            Duty Schedule
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            {loading ? 'Updating...' : `${formatDate(assignments[0]?.date)} - ${formatDate(assignments[6]?.date)}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl" onClick={() => setWeekOffset(prev => prev + 1)}>
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>

      {/* 3. Tabular Roster */}
      <div className="bg-white rounded-[2rem] shadow-sm border overflow-hidden">
        <div className="grid grid-cols-6 bg-slate-50 border-b text-[10px] font-black uppercase tracking-widest text-slate-500">
          <div className="col-span-2 p-4 border-r">Date & Day</div>
          <div className="col-span-2 p-4 border-r flex items-center justify-center gap-2">
            <ShoppingBag className="w-3 h-3 text-[#F08A5D]" /> Bazaar
          </div>
          <div className="col-span-2 p-4 flex items-center justify-center gap-2">
            <Droplets className="w-3 h-3 text-[#6A2C70]" /> Water
          </div>
        </div>

        {loading && assignments.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="divide-y">
            {assignments.map((day) => (
              <div key={day.date} className={`grid grid-cols-6 items-center min-h-[90px] ${day.date === todayStr ? 'bg-[#6A2C70]/5' : ''}`}>
                {/* Date Column */}
                <div className="col-span-2 p-4 border-r h-full flex flex-col justify-center">
                  <p className="text-[11px] font-black text-slate-400 uppercase leading-none mb-1">
                    {new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(new Date(day.date))}
                  </p>
                  <p className="text-base font-black text-slate-700 leading-none">
                    {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(day.date))}
                  </p>
                  {day.date === todayStr && <Badge className="mt-2 text-[8px] h-4 w-fit px-2 bg-[#6A2C70] font-black uppercase tracking-widest">TODAY</Badge>}
                </div>

                {/* Bazaar Column */}
                <div className="col-span-2 p-3 border-r h-full flex flex-col items-center justify-center gap-2">
                  <div className="flex flex-col items-center text-center">
                    <span className={`text-[11px] font-black leading-tight ${day.bazar?.isSkipped ? 'line-through text-slate-300' : 'text-slate-700'} ${day.bazar?.isCancelled ? 'text-red-500 italic' : ''}`}>
                      {day.bazar?.isCancelled ? 'No Bazaar' : day.bazar?.member.full_name}
                    </span>
                    <div className="flex flex-wrap justify-center gap-1 mt-1">
                      {day.bazar?.isPenalty && <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 rounded-full uppercase border border-amber-100">Penalty</span>}
                      {day.bazar?.member.id === userId && !day.bazar?.isCancelled && <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 rounded-full uppercase border border-blue-100">You</span>}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {userRole === 'manager' && (
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-white shadow-sm border-slate-100" onClick={() => setReassignTarget({ date: day.date, type: 'bazar', memberId: day.bazar!.member.id })}>
                        <ArrowRightLeft className="w-4 h-4 text-slate-500" />
                      </Button>
                    )}
                    {(userRole === 'manager' || day.bazar?.member.id === userId) && !day.bazar?.isSkipped && !day.bazar?.isCancelled && (
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-white shadow-sm border-red-50 hover:bg-red-50 group" onClick={() => day.bazar && handleSkip(day.date, 'bazar', day.bazar)}>
                        {processing === `${day.date}-bazar` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4 text-red-400 group-hover:text-red-500" />}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Water Column */}
                <div className="col-span-2 p-3 h-full flex flex-col items-center justify-center gap-2">
                  <div className="flex flex-col items-center text-center">
                    <span className={`text-[11px] font-black leading-tight ${day.water?.isSkipped ? 'line-through text-slate-300' : 'text-slate-700'} ${day.water?.isCancelled ? 'text-red-500 italic' : ''}`}>
                      {day.water?.isCancelled ? 'No Water' : day.water?.member.full_name}
                    </span>
                    <div className="flex flex-wrap justify-center gap-1 mt-1">
                      {day.water?.isPenalty && <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 rounded-full uppercase border border-amber-100">Penalty</span>}
                      {day.water?.member.id === userId && !day.water?.isCancelled && <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 rounded-full uppercase border border-blue-100">You</span>}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {userRole === 'manager' && (
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-white shadow-sm border-slate-100" onClick={() => setReassignTarget({ date: day.date, type: 'water', memberId: day.water!.member.id })}>
                        <ArrowRightLeft className="w-4 h-4 text-slate-500" />
                      </Button>
                    )}
                    {(userRole === 'manager' || day.water?.member.id === userId) && !day.water?.isSkipped && !day.water?.isCancelled && (
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-white shadow-sm border-red-50 hover:bg-red-50 group" onClick={() => day.water && handleSkip(day.date, 'water', day.water)}>
                        {processing === `${day.date}-water` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4 text-red-400 group-hover:text-red-500" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {userRole === 'manager' && (
        <div className="bg-[#6A2C70] rounded-[2rem] p-6 text-white space-y-4 shadow-xl shadow-[#6A2C70]/20 border border-white/10 relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />
          <div className="flex items-center gap-2 text-white/90">
            <AlertCircle className="w-4 h-4" />
            <h3 className="text-xs font-black uppercase tracking-widest">Administrative Control</h3>
          </div>
          <Button 
            className="w-full h-12 bg-white hover:bg-slate-50 text-[#6A2C70] font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2" 
            onClick={generateRoster}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate New Roster</span>
              </>
            )}
          </Button>
          <p className="text-[9px] text-white/60 text-center font-medium uppercase tracking-tight">
            Use this to initialize the duty schedule for the current week.
          </p>
        </div>
      )}

      {/* Reassign Dialog */}
      <Dialog open={!!reassignTarget} onOpenChange={(open) => !open && setReassignTarget(null)}>
        <DialogContent className="max-w-[90vw] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reassign {reassignTarget?.type === 'bazar' ? 'Bazar' : 'Water'} Duty</DialogTitle>
            <DialogDescription>
              Select a new member for {reassignTarget?.date}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Select Member</Label>
              <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto pr-2">
                {members.map(m => {
                  const isAbsent = reassignTarget?.date ? (
                    m.is_inactive || !!(m.inactive_until && new Date(m.inactive_until).toISOString().split('T')[0] >= reassignTarget.date)
                  ) : false

                  return (
                    <button
                      key={m.id}
                      onClick={() => !isAbsent && handleReassign(m.id)}
                      disabled={isAbsent}
                      className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isAbsent 
                          ? 'bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed'
                          : reassignTarget?.memberId === m.id 
                            ? 'bg-[#6A2C70]/10 border-[#6A2C70] border-2 shadow-sm' 
                            : 'bg-white border-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{m.full_name}</span>
                        {isAbsent && <span className="text-[10px] text-red-500 font-semibold">Absent / Inactive</span>}
                      </div>
                      {reassignTarget?.memberId === m.id && <CheckCircle2 className="w-4 h-4 text-[#6A2C70]" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassignTarget(null)} className="w-full">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skip Action Dialog (Reassign vs Cancel) */}
      <Dialog open={!!skipDialogTarget} onOpenChange={(open) => !open && setSkipDialogTarget(null)}>
        <DialogContent className="max-w-[90vw] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Skip {skipDialogTarget?.type === 'bazar' ? 'Bazaar' : 'Water'} Duty
            </DialogTitle>
            <DialogDescription>
              How do you want to handle the skip for {skipDialogTarget?.date}?
            </DialogDescription>
          </DialogHeader>

          {finesEnabled && userRole === 'manager' && (
            <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between mt-2 animate-in slide-in-from-top-2 duration-200">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-slate-800">Penalize Member?</p>
                <p className="text-[10px] text-slate-500 font-medium">Deduct a manual skip fine of ₹{skippedDutyFine} from balance</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={penalizeOnSkip} 
                  onChange={(e) => setPenalizeOnSkip(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
          )}

          <div className="space-y-6 py-4">
            {/* Reassign Section - Visible to All */}
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Option 1: Reassign to someone else</Label>
              <div className="grid grid-cols-1 gap-2 max-h-[30vh] overflow-y-auto p-1 border rounded-xl bg-slate-50">
                {members.map(m => {
                  const isAbsent = skipDialogTarget?.date ? (
                    m.is_inactive || !!(m.inactive_until && new Date(m.inactive_until).toISOString().split('T')[0] >= skipDialogTarget.date)
                  ) : false
                  const isCurrent = skipDialogTarget?.assignment.member.id === m.id

                  return (
                    <button
                      key={m.id}
                      onClick={() => !isAbsent && !isCurrent && handleReassign(m.id)}
                      disabled={isAbsent || isCurrent}
                      className={`flex items-center justify-between p-3 rounded-lg border bg-white hover:border-[#6A2C70] transition-all text-left ${
                        isAbsent 
                          ? 'bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed'
                          : isCurrent 
                            ? 'opacity-50 grayscale' 
                            : ''
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{m.full_name}</span>
                        {isAbsent && <span className="text-[10px] text-red-500 font-semibold">Absent / Inactive</span>}
                      </div>
                      <ArrowRightLeft className="w-3 h-3 text-slate-300" />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Cancel Section */}
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Option 2: Skip entirely</Label>
              <Button 
                variant="destructive" 
                className="w-full h-14 rounded-xl flex flex-col items-center justify-center gap-1"
                onClick={handleCancelDuty}
                disabled={!!processing}
              >
                <span className="font-black uppercase tracking-widest">No {skipDialogTarget?.type === 'bazar' ? 'Bazaar' : 'Water'} Needed</span>
                <span className="text-[9px] opacity-80 font-medium">Mark this date as a holiday/no duty required</span>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSkipDialogTarget(null); setPenalizeOnSkip(false); }} className="w-full">Go Back</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Follow-up Dialog (Tomorrow's Bazaar?) */}
      <Dialog open={!!followUpTarget} onOpenChange={(open) => !open && setFollowUpTarget(null)}>
        <DialogContent className="max-w-[90vw] rounded-[2rem] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="bg-[#6A2C70] p-8 text-white flex flex-col items-center text-center space-y-4">
            <div className="bg-white/20 p-4 rounded-full backdrop-blur-md">
              <Calendar className="w-8 h-8 text-white" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-black uppercase tracking-tight">Shift to Tomorrow?</h2>
              <p className="text-sm font-medium opacity-90 leading-tight">
                 Since you modified today&apos;s {followUpTarget?.type}, would you like to assign 
                <span className="font-black"> {followUpTarget?.member.full_name} </span> 
                to handle it tomorrow instead?
              </p>
            </div>
          </div>

          <div className="p-6 space-y-3 bg-white">
            <Button 
              className="w-full h-14 rounded-2xl bg-[#6A2C70] hover:bg-[#4D1C54] text-white font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              onClick={() => handleFollowUpAssign(true)}
              disabled={!!processing}
            >
              {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Yes, handle it tomorrow"}
            </Button>
            <Button 
              variant="ghost" 
              className="w-full h-12 rounded-2xl text-slate-400 font-bold uppercase tracking-widest text-[10px]"
              onClick={() => handleFollowUpAssign(false)}
              disabled={!!processing}
            >
              No, keep as is
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  )
}
