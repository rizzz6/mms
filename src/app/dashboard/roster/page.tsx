'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Calendar, ChevronLeft, ChevronRight, User, ShoppingBag, Droplets, AlertCircle, History, CheckCircle2, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { computeRoster, DayAssignment, Member, DutyRecord } from '@/lib/roster-engine'
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
  const [allRecords, setAllRecords] = useState<DutyRecord[]>([])
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
  const [todayLog, setTodayLog] = useState<any>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // Get profile
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setUserRole(profile?.role || 'member')

      // Get range
      const startDate = addDays(startOfWeek(new Date()), weekOffset * 7)
      const endDate = addDays(startDate, 6)
      const endDateStr = endDate.toISOString().split('T')[0]

      // 1. Fetch members sorted
      const { data: mData } = await supabase
        .from('profiles')
        .select('id, full_name, joined_at')
        .order('joined_at', { ascending: true })
      
      const formattedMembers = (mData as any[]) || []
      setMembers(formattedMembers)

      // 2. Fetch all historical records up to current window end
      const { data: rData } = await supabase
        .from('duty_roster')
        .select('*')
        .lte('date', endDateStr)
        .order('date', { ascending: true })
      
      const formattedRecords = (rData as any[]) || []
      setAllRecords(formattedRecords)

      // 3. Compute
      const roster = computeRoster(formattedMembers, formattedRecords, startDate, 7)
      setAssignments(roster)

      // 4. Check for today's bazar log
      const todayStr = new Date().toISOString().split('T')[0]
      const { data: log } = await supabase
        .from('bazar_logs')
        .select('*')
        .eq('shopper_id', user.id)
        .eq('date', todayStr)
        .maybeSingle()
      
      setTodayLog(log)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load roster')
    } finally {
      setLoading(false)
    }
  }, [supabase, weekOffset])

  useEffect(() => {
    fetchData()
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
        amount: Number(bazarAmount),
        items: bazarItems.trim(),
        date: new Date().toISOString().split('T')[0],
        verified: false
      })

      if (error) throw error
      toast.success('Bazar log submitted for verification!')
      setBazarAmount('')
      setBazarItems('')
      fetchData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSubmittingBazar(false)
    }
  }

  const handleSkip = async (date: string, type: 'bazar' | 'water', assignment: any) => {
    if (!userId) return
    const key = `${date}-${type}`
    setProcessing(key)

    try {
      let recordId = assignment.recordId

      if (!recordId) {
        // Create a new record as skipped
        const { data, error } = await supabase
          .from('duty_roster')
          .insert({
            user_id: assignment.member.id,
            date,
            duty_type: type,
            is_skipped: true
          })
          .select()
          .single()
        
        if (error) throw error
        recordId = data.id
      } else {
        // Update existing record to skipped
        const { error } = await supabase
          .from('duty_roster')
          .update({ is_skipped: true })
          .eq('id', recordId)
        
        if (error) throw error
      }

      // Log the action
      await supabase.from('duty_roster_logs').insert({
        roster_id: recordId,
        changed_by: userId,
        action: 'skip',
        note: `Skipped ${type} on ${date}`
      })

      toast.success('Duty skipped. Re-assignment scheduled.')
      fetchData()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setProcessing(null)
    }
  }

  const generateRoster = async () => {
    setLoading(true)
    try {
      const recordsToInsert: any[] = []
      
      assignments.forEach(day => {
        if (day.bazar && !day.bazar.recordId) {
          recordsToInsert.push({
            user_id: day.bazar.member.id,
            date: day.date,
            duty_type: 'bazar',
            is_skipped: false
          })
        }
        if (day.water && !day.water.recordId) {
          recordsToInsert.push({
            user_id: day.water.member.id,
            date: day.date,
            duty_type: 'water',
            is_skipped: false
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
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="max-w-md mx-auto p-4 space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            ← Back
          </Button>
          <h1 className="text-xl font-bold">Duty Roster</h1>
        </div>
        {userRole === 'manager' && (
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/roster/logs')}>
            <History className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Week Navigator */}
      <div className="flex items-center justify-between bg-white p-2 rounded-2xl shadow-sm border">
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(prev => prev - 1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 font-bold text-slate-700 text-sm">
          <Calendar className="w-4 h-4 text-primary" />
          {loading ? 'Loading...' : `${formatDate(assignments[0]?.date)} - ${formatDate(assignments[6]?.date)}`}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(prev => prev + 1)}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {loading && assignments.length === 0 ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((day) => (
            <Card key={day.date} className={`border-0 shadow-sm ${day.date === todayStr ? 'ring-2 ring-primary ring-inset' : ''}`}>
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  {formatDate(day.date)}
                  {day.date === todayStr && <Badge className="text-[8px] h-4">TODAY</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                {/* Bazar Row */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${day.bazar?.isSkipped ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                            {day.bazar?.member.full_name}
                          </span>
                          {day.bazar?.isPenalty && <Badge variant="outline" className="text-[8px] h-3 px-1 border-amber-200 text-amber-600 bg-amber-50">PENALTY</Badge>}
                          {day.bazar?.isSkipped && <Badge variant="outline" className="text-[8px] h-3 px-1">SKIPPED</Badge>}
                          {day.bazar?.member.id === userId && <Badge className="text-[8px] h-3 px-1 bg-blue-500">YOU</Badge>}
                        </div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Bazar Duty</p>
                      </div>
                    </div>
                    {(day.bazar?.member.id === userId || userRole === 'manager') && !day.bazar?.isSkipped && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-[10px] h-7 px-2 text-red-500 hover:text-red-600"
                        disabled={processing === `${day.date}-bazar`}
                        onClick={() => handleSkip(day.date, 'bazar', day.bazar)}
                      >
                        {processing === `${day.date}-bazar` ? <Loader2 className="w-3 h-3 animate-spin" /> : (day.date < todayStr ? 'Correct' : 'Skip')}
                      </Button>
                    )}
                  </div>

                  {/* Inline Bazar Form for Today's Assignee */}
                  {day.date === todayStr && day.bazar?.member.id === userId && !day.bazar?.isSkipped && (
                    <div className="mt-2 border-t pt-4">
                      {todayLog ? (
                        <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <div>
                            <p className="text-xs font-bold text-green-800">Bazar Logged Today (₹{todayLog.amount})</p>
                            <p className="text-[10px] text-green-600">
                              {todayLog.verified ? 'Verified by Manager' : 'Pending manager verification'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <form onSubmit={handleBazarSubmit} className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-2 mb-1">
                            <ReceiptText className="w-3.5 h-3.5 text-primary" />
                            <h4 className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Log Today's Expenses</h4>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-1">
                              <Label htmlFor="b-amount" className="text-[9px] text-slate-500 font-bold ml-1 uppercase">Amount (₹)</Label>
                              <Input 
                                id="b-amount"
                                type="number"
                                value={bazarAmount}
                                onChange={(e) => setBazarAmount(e.target.value)}
                                className="h-9 text-xs bg-white"
                                placeholder="0.00"
                              />
                            </div>
                            <div className="col-span-2">
                              <Label htmlFor="b-items" className="text-[9px] text-slate-500 font-bold ml-1 uppercase">Items Purchased</Label>
                              <Textarea 
                                id="b-items"
                                value={bazarItems}
                                onChange={(e) => setBazarItems(e.target.value)}
                                className="h-9 min-h-[36px] text-xs bg-white py-2"
                                placeholder="Rice, Dal, Oil..."
                              />
                            </div>
                          </div>
                          <Button 
                            type="submit" 
                            className="w-full h-8 text-[10px] font-black uppercase tracking-widest bg-primary text-white"
                            disabled={submittingBazar}
                          >
                            {submittingBazar ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Submit Bazar Log'}
                          </Button>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                <div className="h-[1px] bg-slate-50 w-full" />

                {/* Water Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                      <Droplets className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${day.water?.isSkipped ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {day.water?.member.full_name}
                        </span>
                        {day.water?.isPenalty && <Badge variant="outline" className="text-[8px] h-3 px-1 border-amber-200 text-amber-600 bg-amber-50">PENALTY</Badge>}
                        {day.water?.isSkipped && <Badge variant="outline" className="text-[8px] h-3 px-1">SKIPPED</Badge>}
                        {day.water?.member.id === userId && <Badge className="text-[8px] h-3 px-1 bg-blue-500">YOU</Badge>}
                      </div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Water Duty</p>
                    </div>
                  </div>
                  {(day.water?.member.id === userId || userRole === 'manager') && !day.water?.isSkipped && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-[10px] h-7 px-2 text-red-500 hover:text-red-600"
                      disabled={processing === `${day.date}-water`}
                      onClick={() => handleSkip(day.date, 'water', day.water)}
                    >
                      {processing === `${day.date}-water` ? <Loader2 className="w-3 h-3 animate-spin" /> : (day.date < todayStr ? 'Correct' : 'Skip')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {userRole === 'manager' && (
        <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-4">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertCircle className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase">Manager Actions</h3>
          </div>
          <Button 
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-xs" 
            onClick={generateRoster}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '⚡ Generate Roster for This Week'}
          </Button>
        </div>
      )}
    </div>
  )
}
