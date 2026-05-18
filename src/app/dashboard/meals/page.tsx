'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ChevronLeft, ChevronRight, Lock, Info, Check, X, Plus, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { notifyManager } from '@/app/actions/push'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// --- Types & Utilities ---

type MealType = 'lunch' | 'dinner'
type MealStatus = 'eating' | 'off'

interface Profile {
  id: string
  full_name: string
  role: string
  joined_at: string
  mess_id: string
  status: string
}

interface MealRecord {
  user_id: string
  date: string
  type: MealType
  status: MealStatus
}

const LUNCH_CUTOFF = 9 // 9:00 AM
const DINNER_CUTOFF = 17 // 5:00 PM

function isLocked(dateStr: string, type: MealType) {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  
  if (dateStr < todayStr) return true
  if (dateStr > todayStr) return false
  
  const currentHour = now.getHours()
  return type === 'lunch' ? currentHour >= LUNCH_CUTOFF : currentHour >= DINNER_CUTOFF
}

// --- Main Component ---

export default function AttendanceSheet() {
  const router = useRouter()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [meals, setMeals] = useState<Record<string, MealRecord>>({})
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [messCreatedDate, setMessCreatedDate] = useState<string | null>(null)

  const getMealStatus = (userId: string, dateStr: string, type: MealType): MealStatus => {
    const key = `${userId}-${dateStr}-${type}`
    if (meals[key]) return meals[key].status
    
    // Default Logic:
    const profile = profiles.find(p => p.id === userId)
    if (!profile) return 'eating'

    const joinedDate = new Date(profile.joined_at).toISOString().split('T')[0]
    
    // If date is before joined_at or before mess was created, default is 'off'
    if (dateStr < joinedDate) return 'off'
    if (messCreatedDate && dateStr < messCreatedDate) return 'off'
    
    return 'eating'
  }
  
  const [guestMealTypes, setGuestMealTypes] = useState<{label: string, price: number}[]>([])
  const [guestMealRate, setGuestMealRate] = useState(60)
  const [guestList, setGuestList] = useState<any[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [showAddGuest, setShowAddGuest] = useState(false)
  const [addingGuest, setAddingGuest] = useState(false)
  const [guestForm, setGuestForm] = useState({
    userId: '',
    date: new Date().toISOString().split('T')[0],
    type: 'lunch' as MealType,
    guestType: '',
    guestName: ''
  })
  
  const supabase = createClient()

  // Generate dates for the selected month
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const date = new Date(year, month, 1)
    const days = []
    while (date.getMonth() === month) {
      days.push(new Date(date))
      date.setDate(date.getDate() + 1)
    }
    return days
  }, [currentMonth])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)

      const { data: currentProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!currentProfile?.mess_id) return
      setMyProfile(currentProfile)

      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0]
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0]

      const [pRes, mRes, cRes, messRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, joined_at').eq('mess_id', currentProfile.mess_id).eq('status', 'approved').order('full_name'),
        supabase.from('meals').select('*').eq('mess_id', currentProfile.mess_id).gte('date', startOfMonth).lte('date', endOfMonth),
        supabase.from('mess_config').select('key, value').eq('mess_id', currentProfile.mess_id),
        supabase.from('messes').select('created_at').eq('id', currentProfile.mess_id).single()
      ])

      if (messRes.data) {
        setMessCreatedDate(new Date(messRes.data.created_at).toISOString().split('T')[0])
      }

      let parsedMealTypes: {label: string, price: number}[] = []
      let parsedRate = 60
      if (cRes.data) {
        cRes.data.forEach(row => {
          if (row.key === 'guest_meal_types') {
            try { parsedMealTypes = JSON.parse(row.value) } catch {}
          }
          if (row.key === 'guest_meal_rate') {
            parsedRate = Number(row.value) || 60
          }
        })
      }
      setGuestMealTypes(parsedMealTypes)
      setGuestMealRate(parsedRate)

      if (pRes.data) {
        setProfiles(pRes.data as Profile[])
      }

      if (mRes.data) {
        const mealMap: Record<string, MealRecord> = {}
        const guests: any[] = []
        mRes.data.forEach(m => {
          if (!m.is_guest) {
            mealMap[`${m.user_id}-${m.date}-${m.type}`] = m
          } else {
            guests.push(m)
          }
        })
        setMeals(mealMap)
        setGuestList(guests)
      }
    } catch (error) {
      console.error(error)
      toast.error('Failed to load attendance sheet')
    } finally {
      setLoading(false)
    }
  }, [supabase, currentMonth])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const toggleMeal = async (userId: string, dateStr: string, type: MealType) => {
    const isMe = userId === user?.id
    if (!myProfile) return
    const isManager = myProfile.role === 'manager' || myProfile.role === 'co_manager'
    
    // Only allow self-toggle if not locked, OR manager override
    if (!isManager && !isMe) return
    if (!isManager && isLocked(dateStr, type)) {
      return toast.error('Time limit exceeded for this meal')
    }

    const currentStatus = getMealStatus(userId, dateStr, type)
    const newStatus: MealStatus = currentStatus === 'off' ? 'eating' : 'off'
    const key = `${userId}-${dateStr}-${type}`

    // Save original meal record in case we need to revert
    const originalMealRecord = meals[key]

    // Perform optimistic local state update instantly
    setMeals(prev => ({
      ...prev,
      [key]: { user_id: userId, date: dateStr, type, status: newStatus }
    }))

    try {
      const { error } = await supabase
        .from('meals')
        .upsert({
          user_id: userId,
          mess_id: myProfile.mess_id,
          date: dateStr,
          type,
          status: newStatus,
          is_guest: false
        }, { onConflict: 'user_id, date, type' })

      if (error) throw error
      
      toast.success('Attendance updated')

      // Notify manager if a member turns off a meal
      if (!isManager && newStatus === 'off') {
        notifyManager(myProfile.mess_id, 'manager_meal_toggles', {
          title: 'Meal Turned Off',
          body: `${myProfile.full_name} turned off their ${type} for ${dateStr}`,
          url: '/dashboard/meals'
        }).catch(console.error)
      }
    } catch (error) {
      // Revert to original state on request failure
      setMeals(prev => {
        const copy = { ...prev }
        if (originalMealRecord) {
          copy[key] = originalMealRecord
        } else {
          delete copy[key]
        }
        return copy
      })
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    }
  }

  const handleAddGuest = async () => {
    if (!guestForm.userId || !myProfile) return toast.error('Incomplete data or profile not loaded')
    if (!guestForm.guestName.trim()) return toast.error('Please enter a name for the guest')
    
    // Look up selected variety price
    const selectedVariety = guestMealTypes.find(t => t.label === guestForm.guestType)
    const lockedPrice = selectedVariety ? selectedVariety.price : guestMealRate

    // Check same cutoff rules as members!
    const isManager = myProfile.role === 'manager' || myProfile.role === 'co_manager'
    if (!isManager && isLocked(guestForm.date, guestForm.type)) {
      return toast.error('Cutoff time has passed for this meal!')
    }

    setAddingGuest(true)
    try {
      const { error } = await supabase.from('meals').insert({
        user_id: guestForm.userId,
        mess_id: myProfile.mess_id,
        date: guestForm.date,
        type: guestForm.type,
        status: 'eating',
        is_guest: true,
        guest_type: guestForm.guestType || 'Standard Guest',
        guest_price: lockedPrice,
        guest_name: guestForm.guestName.trim()
      })

      if (error) throw error
      toast.success('Guest pre-registered successfully!')
      setShowAddGuest(false)
      // Reset form
      setGuestForm(prev => ({ ...prev, guestName: '', guestType: '' }))
      fetchData()
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setAddingGuest(false)
    }
  }

  const handleDeleteGuest = async (guestId: string, hostId: string) => {
    if (!myProfile) return
    const isMe = hostId === user?.id
    const isManager = myProfile.role === 'manager' || myProfile.role === 'co_manager'

    if (!isManager && !isMe) {
      return toast.error('You do not have permission to delete this guest')
    }

    // Check same cutoff rules as members!
    const guestMeal = guestList.find(g => g.id === guestId)
    if (!guestMeal) return
    if (!isManager && isLocked(guestMeal.date, guestMeal.type)) {
      return toast.error('Cutoff time has passed. Cannot cancel this guest!')
    }

    setIsProcessing(true)
    try {
      const { error } = await supabase
        .from('meals')
        .delete()
        .eq('id', guestId)

      if (error) throw error
      toast.success('Guest meal cancelled!')
      fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel guest meal')
    } finally {
      setIsProcessing(false)
    }
  }

  const changeMonth = (offset: number) => {
    const next = new Date(currentMonth)
    next.setMonth(next.getMonth() + offset)
    setCurrentMonth(next)
  }

  if (loading && profiles.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        {/* Premium Header Skeleton */}
        <div className="bg-white px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm border-b border-slate-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="w-10 h-10 rounded-full" />
            <Skeleton className="w-20 h-10 rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-40" />
            </div>
            <Skeleton className="h-10 w-32 rounded-2xl" />
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 space-y-6">
          {/* Quick Toggle Skeleton */}
          <Card className="border-0 shadow-lg bg-white overflow-hidden rounded-[2rem]">
            <div className="p-4 border-b flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-slate-100 space-y-3">
                <Skeleton className="h-3 w-10" />
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-6 w-10 rounded-full" />
                </div>
              </div>
              <div className="p-4 rounded-2xl border border-slate-100 space-y-3">
                <Skeleton className="h-3 w-10" />
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-6 w-10 rounded-full" />
                </div>
              </div>
            </div>
          </Card>

          {/* Grid Table Skeleton */}
          <div className="bg-white rounded-2xl shadow-xl border overflow-hidden p-4 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <Skeleton className="h-4 w-24" />
              <div className="flex gap-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-10" />
                ))}
              </div>
            </div>
            {Array.from({ length: 6 }).map((_, r) => (
              <div key={r} className="flex justify-between items-center py-2">
                <Skeleton className="h-4 w-28" />
                <div className="flex gap-2">
                  {Array.from({ length: 7 }).map((_, c) => (
                    <div key={c} className="flex gap-1">
                      <Skeleton className="h-8 w-6 rounded-md" />
                      <Skeleton className="h-8 w-6 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
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
            <Button 
              variant="default" 
              className="rounded-full shadow-lg border h-10 gap-2 px-4 font-bold bg-primary text-white"
              onClick={() => {
                setGuestForm(prev => ({ ...prev, userId: user?.id || '' }))
                setShowAddGuest(true)
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Guest</span>
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Attendance</p>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Meal Sheet</h1>
          </div>
          
          <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => changeMonth(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="px-2 text-[10px] font-black uppercase tracking-tight text-slate-600 min-w-[80px] text-center">
              {currentMonth.toLocaleString('default', { month: 'short', year: 'numeric' })}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={() => changeMonth(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 space-y-4">



      {/* Guest Meal Dialog */}
      <Dialog open={showAddGuest} onOpenChange={setShowAddGuest}>
        <DialogContent className="max-w-[95vw] rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Add Guest Meal
            </DialogTitle>
            <DialogDescription>
              Record an extra meal for a guest.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Host Member</Label>
              {(myProfile?.role === 'manager' || myProfile?.role === 'co_manager') ? (
                <select 
                  className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={guestForm.userId} 
                  onChange={(e) => setGuestForm({ ...guestForm, userId: e.target.value })}
                >
                  <option value="">Select member</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              ) : (
                <div className="h-11 flex items-center px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700">
                  {myProfile?.full_name}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Guest Name / ID</Label>
              <Input 
                type="text" 
                placeholder="e.g. Cousin, Friend" 
                value={guestForm.guestName} 
                onChange={(e) => setGuestForm({ ...guestForm, guestName: e.target.value })} 
                className="rounded-xl h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={guestForm.date} onChange={(e) => setGuestForm({ ...guestForm, date: e.target.value })} className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <Label>Meal Type</Label>
                <select 
                  className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={guestForm.type} 
                  onChange={(e) => setGuestForm({ ...guestForm, type: e.target.value as MealType })}
                >
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Meal Variety</Label>
              <select 
                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={guestForm.guestType} 
                onChange={(e) => setGuestForm({ ...guestForm, guestType: e.target.value })}
              >
                <option value="">Select variety (e.g. Chicken, Egg)</option>
                {guestMealTypes.map((type, idx) => (
                  <option key={idx} value={type.label}>
                    {type.label} (₹{type.price})
                  </option>
                ))}
              </select>
              {guestMealTypes.length === 0 && (
                <p className="text-[10px] text-slate-400 italic">No varieties configured in settings</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-12 font-bold" onClick={handleAddGuest} disabled={addingGuest}>
              {addingGuest ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Guest Meal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instructions / Legend */}
      <Card className="border-0 bg-slate-50">
        <CardContent className="p-3">
          <div className="flex items-start gap-2 mb-2">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] font-medium text-slate-600">Tap cells to toggle. Today&apos;s cutoff: Lunch 9AM, Dinner 5PM.</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-green-50 flex items-center justify-center border border-green-100">
                <Check className="w-3 h-3 text-green-600 stroke-[3px]" />
              </div>
              <span className="text-[10px] font-bold text-slate-700">Eating</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-red-50 flex items-center justify-center border border-red-100">
                <X className="w-3 h-3 text-red-500 stroke-[3px]" />
              </div>
              <span className="text-[10px] font-bold text-slate-700">Off</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center border border-slate-200">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              </div>
              <span className="text-[10px] font-bold text-slate-500 italic">Future</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Quick Toggle */}
      <Card className="border-0 shadow-lg bg-white overflow-hidden">
        <div className="bg-primary/5 p-3 border-b flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-primary">Today&apos;s Status</h3>
          <span className="text-[10px] font-bold text-slate-400">
            {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
        </div>
        <CardContent className="p-4 grid grid-cols-2 gap-4">
          {(['lunch', 'dinner'] as const).map(type => {
            const now = new Date()
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
            const status = getMealStatus(user?.id || '', dateStr, type)
            const locked = isLocked(dateStr, type)
            
            return (
              <div key={type} className={`p-3 rounded-2xl border-2 transition-all flex flex-col gap-2 ${
                status === 'eating' ? 'border-green-100 bg-green-50/30' : 'border-red-100 bg-red-50/30'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-500">{type}</span>
                  {locked && <Lock className="w-3 h-3 text-slate-300" />}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className={`flex items-center gap-1 text-sm font-black ${status === 'eating' ? 'text-green-600' : 'text-red-500'}`}>
                    {status === 'eating' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    {status === 'eating' ? 'Eating' : 'Off'}
                  </div>
                  <button
                    disabled={locked && myProfile?.role !== 'manager'}
                    onClick={() => toggleMeal(user?.id || '', dateStr, type)}
                    className={`w-10 h-6 rounded-full transition-all relative ${
                      status === 'eating' ? 'bg-green-500' : 'bg-red-400'
                    } ${locked && myProfile?.role !== 'manager' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                      status === 'eating' ? 'left-5' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Grid Container */}
      <div className="bg-white rounded-2xl shadow-xl border overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-30 bg-slate-900 text-white">
              <tr>
                <th className="sticky left-0 z-40 bg-slate-900 p-3 text-left border-r border-slate-800 min-w-[120px] text-[10px] uppercase font-black">Members</th>
                {daysInMonth.map(day => (
                  <th key={day.toISOString()} colSpan={2} className={`p-2 border-r border-slate-800 min-w-[70px] text-center ${
                    day.toDateString() === new Date().toDateString() ? 'bg-primary' : ''
                  }`}>
                    <div className="font-black text-sm leading-none">{day.getDate()}</div>
                    <div className="text-[8px] opacity-60 font-medium uppercase mt-0.5">{day.toLocaleString('default', { weekday: 'short' })}</div>
                  </th>
                ))}
                <th className="sticky right-0 z-40 bg-slate-900 p-3 text-center border-l border-slate-800 min-w-[60px] text-[10px] font-black uppercase">Total</th>
              </tr>
              <tr className="bg-slate-800 text-[8px] uppercase tracking-tighter">
                <th className="sticky left-0 z-40 bg-slate-800 border-r border-slate-700"></th>
                {daysInMonth.map(day => (
                  <Fragment key={day.toISOString() + '-headers'}>
                    <th className="p-1 border-r border-slate-700">Day</th>
                    <th className="p-1 border-r border-slate-700">Night</th>
                  </Fragment>
                ))}
                <th className="sticky right-0 z-40 bg-slate-800 border-l border-slate-700"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles.map(profile => {
                // Calculate Total Meals for this profile (Only count up to today)
                let totalMeals = 0;
                const now = new Date()
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

                daysInMonth.forEach(day => {
                  const dateStr = day.toISOString().split('T')[0]
                  if (dateStr <= todayStr) {
                    if (getMealStatus(profile.id, dateStr, 'lunch') === 'eating') totalMeals++
                    if (getMealStatus(profile.id, dateStr, 'dinner') === 'eating') totalMeals++
                  }
                })

                return (
                  <tr key={profile.id} className="hover:bg-slate-50 transition-colors">
                    <td className="sticky left-0 z-20 bg-white p-3 font-bold border-r truncate text-[11px] shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                      {profile.full_name}
                      {profile.id === user?.id && <span className="ml-1 text-[8px] text-primary font-black uppercase">(You)</span>}
                    </td>
                    {daysInMonth.map(day => {
                      const dateStr = day.toISOString().split('T')[0]
                      const lStatus = getMealStatus(profile.id, dateStr, 'lunch')
                      const dStatus = getMealStatus(profile.id, dateStr, 'dinner')
                      const lLocked = isLocked(dateStr, 'lunch')
                      const dLocked = isLocked(dateStr, 'dinner')
                      
                      const isFuture = dateStr > todayStr

                      return (
                        <Fragment key={day.toISOString() + profile.id}>
                          <td 
                            onClick={() => toggleMeal(profile.id, dateStr, 'lunch')}
                            className={`p-0 border-r cursor-pointer transition-all active:bg-slate-200 h-12 min-w-[35px] ${
                              lStatus === 'eating' ? 'bg-green-50/30' : 'bg-red-50/30'
                            }`}
                          >
                            <div className={`relative h-full flex items-center justify-center`}>
                              {lLocked && <Lock className="w-1.5 h-1.5 absolute top-1 right-1 opacity-20" />}
                              {isFuture ? (
                                <div className={`w-2 h-2 rounded-full ${lStatus === 'eating' ? 'bg-green-400' : 'bg-slate-300'}`} />
                              ) : (
                                lStatus === 'eating' ? (
                                  <Check className="w-4 h-4 text-green-600 stroke-[3px]" />
                                ) : (
                                  <X className="w-3.5 h-3.5 text-red-500 stroke-[3px]" />
                                )
                              )}
                            </div>
                          </td>
                          <td 
                            onClick={() => toggleMeal(profile.id, dateStr, 'dinner')}
                            className={`p-0 border-r cursor-pointer transition-all active:bg-slate-200 h-12 min-w-[35px] ${
                              dStatus === 'eating' ? 'bg-green-50/30' : 'bg-red-50/30'
                            }`}
                          >
                            <div className={`relative h-full flex items-center justify-center`}>
                              {dLocked && <Lock className="w-1.5 h-1.5 absolute top-1 right-1 opacity-20" />}
                              {isFuture ? (
                                <div className={`w-2 h-2 rounded-full ${dStatus === 'eating' ? 'bg-green-400' : 'bg-slate-300'}`} />
                              ) : (
                                dStatus === 'eating' ? (
                                  <Check className="w-4 h-4 text-green-600 stroke-[3px]" />
                                ) : (
                                  <X className="w-3.5 h-3.5 text-red-500 stroke-[3px]" />
                                )
                              )}
                            </div>
                          </td>
                        </Fragment>
                      )
                    })}
                    <td className="sticky right-0 z-20 bg-slate-50 p-2 font-black text-center border-l shadow-[-4px_0_10px_-2px_rgba(0,0,0,0.1)] text-primary text-sm min-w-[60px]">
                      {totalMeals}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Pre-Registered Guests Section */}
      <Card className="border-0 shadow-lg bg-white overflow-hidden mt-6">
        <div className="bg-primary/5 p-4 border-b flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-primary">Pre-Registered Guests</h3>
            <p className="text-[9px] text-slate-400 font-medium">Guests registered for this month ({currentMonth.toLocaleString('default', { month: 'short', year: 'numeric' })})</p>
          </div>
          <Badge variant="secondary" className="font-bold text-[10px] rounded-lg">
            {guestList.length} Total
          </Badge>
        </div>
        <CardContent className="p-0 divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
          {guestList.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
              <p className="text-xs font-medium">No guests pre-registered for this month.</p>
            </div>
          ) : (
            guestList.map(guest => {
              const hostProfile = profiles.find(p => p.id === guest.user_id)
              const locked = isLocked(guest.date, guest.type)
              const hostName = hostProfile ? hostProfile.full_name : 'Unknown Host'
              
              return (
                <div key={guest.id} className="p-3.5 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800 truncate">{guest.guest_name || 'Guest'}</span>
                      <Badge variant="outline" className="text-[9px] h-4 font-bold bg-slate-50 uppercase text-slate-500 px-1 border-slate-200">
                        {guest.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 font-medium">
                      <span>{new Date(guest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      <span>•</span>
                      <span>Hosted by {hostName}</span>
                      {guest.guest_type && (
                        <>
                          <span>•</span>
                          <span className="text-primary font-semibold">{guest.guest_type}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-700">₹{guest.guest_price || guestMealRate}</p>
                      <p className="text-[8px] text-slate-400 uppercase font-bold">Locked Rate</p>
                    </div>
                    
                    {(myProfile?.role === 'manager' || myProfile?.role === 'co_manager' || guest.user_id === user?.id) && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-7 w-7 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 ${locked && myProfile?.role !== 'manager' && myProfile?.role !== 'co_manager' ? 'opacity-30 cursor-not-allowed' : ''}`}
                        onClick={() => handleDeleteGuest(guest.id, guest.user_id)}
                        disabled={isProcessing}
                        title={locked && myProfile?.role !== 'manager' && myProfile?.role !== 'co_manager' ? 'Cutoff passed. Cannot delete.' : 'Cancel Guest'}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 p-4 bg-white rounded-2xl border shadow-sm text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full" /> Eating
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-slate-300 rounded-full" /> Off
        </div>
        <div className="flex items-center gap-2">
          <Lock className="w-3 h-3" /> Locked
        </div>
      </div>
    </div>
    </div>
  )
}
