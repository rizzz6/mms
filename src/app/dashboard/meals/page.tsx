'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ChevronLeft, ChevronRight, Lock, Check, X, Plus, Users, Calendar, LayoutGrid, ShoppingBag, Droplets, Clock } from 'lucide-react'
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
  is_inactive?: boolean
}

interface MealRecord {
  user_id: string
  date: string
  type: MealType
  status: MealStatus
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
  
  const [viewMode, setViewMode] = useState<'calendar' | 'sheet' | 'daily'>('calendar')
  const [selectedCalendarUserId, setSelectedCalendarUserId] = useState<string>('')
  const [rosterRecords, setRosterRecords] = useState<any[]>([])
  const [selectedDayDetails, setSelectedDayDetails] = useState<Date | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const getMealStatus = useCallback((userId: string, dateStr: string, type: MealType): MealStatus => {
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
  }, [meals, profiles, messCreatedDate])
  
  const [guestMealTypes, setGuestMealTypes] = useState<{label: string, price: number}[]>([])
  const [guestMealRate, setGuestMealRate] = useState(60)
  const [guestList, setGuestList] = useState<any[]>([])

  const [lunchCutoff, setLunchCutoff] = useState(9)
  const [dinnerCutoff, setDinnerCutoff] = useState(17)

  const isLocked = useCallback((dateStr: string, type: MealType) => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    
    if (dateStr < todayStr) return true
    if (dateStr > todayStr) return false
    
    const currentHour = now.getHours()
    return type === 'lunch' ? currentHour >= lunchCutoff : currentHour >= dinnerCutoff
  }, [lunchCutoff, dinnerCutoff])

  const lunchCutoffStr = useMemo(() => {
    const ampm = lunchCutoff >= 12 ? 'PM' : 'AM'
    const displayHour = lunchCutoff % 12 === 0 ? 12 : lunchCutoff % 12
    return `${displayHour}${ampm}`
  }, [lunchCutoff])

  const dinnerCutoffStr = useMemo(() => {
    const ampm = dinnerCutoff >= 12 ? 'PM' : 'AM'
    const displayHour = dinnerCutoff % 12 === 0 ? 12 : dinnerCutoff % 12
    return `${displayHour}${ampm}`
  }, [dinnerCutoff])

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

  const firstDayIndex = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()
  }, [currentMonth])

  const todayStrStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  
  const eatersSummary = useMemo(() => {
    let confirmedLunchMembers = 0
    let confirmedDinnerMembers = 0

    profiles.forEach(m => {
      if (m.is_inactive) return
      
      const statusLunch = getMealStatus(m.id, todayStrStr, 'lunch')
      const statusDinner = getMealStatus(m.id, todayStrStr, 'dinner')
      
      if (statusLunch === 'eating') confirmedLunchMembers++
      if (statusDinner === 'eating') confirmedDinnerMembers++
    })

    const todayGuests = guestList.filter(g => g.date === todayStrStr)
    const confirmedLunchGuests = todayGuests.filter(g => g.type === 'lunch')
    const confirmedDinnerGuests = todayGuests.filter(g => g.type === 'dinner')
    
    return {
      confirmedLunchMembers,
      confirmedDinnerMembers,
      confirmedLunchGuests,
      confirmedDinnerGuests,
      todayGuests
    }
  }, [profiles, guestList, todayStrStr, getMealStatus])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)
      setSelectedCalendarUserId(prev => prev || user.id)

      const { data: currentProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!currentProfile?.mess_id) return
      setMyProfile(currentProfile)

      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0]
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0]

      const [pRes, mRes, cRes, messRes, rRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, joined_at, is_inactive').eq('mess_id', currentProfile.mess_id).eq('status', 'approved').order('full_name'),
        supabase.from('meals').select('*').eq('mess_id', currentProfile.mess_id).gte('date', startOfMonth).lte('date', endOfMonth),
        supabase.from('mess_config').select('key, value').eq('mess_id', currentProfile.mess_id),
        supabase.from('messes').select('created_at').eq('id', currentProfile.mess_id).single(),
        supabase.from('duty_roster').select('*').eq('mess_id', currentProfile.mess_id).gte('date', startOfMonth).lte('date', endOfMonth)
      ])

      if (messRes.data) {
        setMessCreatedDate(new Date(messRes.data.created_at).toISOString().split('T')[0])
      }

      let parsedMealTypes: {label: string, price: number}[] = []
      let parsedRate = 60
      let parsedLunchCutoff = 9
      let parsedDinnerCutoff = 17
      if (cRes.data) {
        cRes.data.forEach(row => {
          if (row.key === 'guest_meal_types') {
            try { parsedMealTypes = JSON.parse(row.value) } catch {}
          }
          if (row.key === 'guest_meal_rate') {
            parsedRate = Number(row.value) || 60
          }
          if (row.key === 'lunch_cutoff') {
            parsedLunchCutoff = Number(row.value) ?? 9
          }
          if (row.key === 'dinner_cutoff') {
            parsedDinnerCutoff = Number(row.value) ?? 17
          }
        })
      }
      setGuestMealTypes(parsedMealTypes)
      setGuestMealRate(parsedRate)
      setLunchCutoff(parsedLunchCutoff)
      setDinnerCutoff(parsedDinnerCutoff)

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

      if (rRes.data) {
        setRosterRecords(rRes.data)
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

  const renderCalendarView = () => {
    const isManager = myProfile?.role === 'manager' || myProfile?.role === 'co_manager'
    return (
      <div className="space-y-6">
        {/* User Quick Stats Header */}
        <div className="bg-gradient-to-br from-primary/5 to-primary/0 border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-slate-800">
              {profiles.find(p => p.id === selectedCalendarUserId)?.full_name || 'Member'}&apos;s Month At A Glance
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          
          <div className="flex gap-3">
            <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-2 text-center shadow-sm">
              <p className="text-[9px] font-black uppercase text-green-600">Lunch & Dinner</p>
              <p className="text-lg font-black text-green-700 leading-tight">
                {daysInMonth.reduce((acc, day) => {
                  const dStr = day.toISOString().split('T')[0]
                  const l = getMealStatus(selectedCalendarUserId, dStr, 'lunch') === 'eating' ? 1 : 0
                  const d = getMealStatus(selectedCalendarUserId, dStr, 'dinner') === 'eating' ? 1 : 0
                  return acc + l + d
                }, 0)} <span className="text-[10px] font-medium text-slate-400">meals</span>
              </p>
            </div>
            
            <div className="bg-orange-50 border border-orange-100 rounded-2xl px-4 py-2 text-center shadow-sm">
              <p className="text-[9px] font-black uppercase text-orange-600">Bazar Duties</p>
              <p className="text-lg font-black text-orange-700 leading-tight">
                {rosterRecords.filter(r => r.user_id === selectedCalendarUserId && r.duty_type === 'bazar').length} <span className="text-[10px] font-medium text-slate-400">days</span>
              </p>
            </div>
          </div>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-2 text-center font-black text-[9px] uppercase tracking-wider text-slate-400">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-2 bg-slate-50 rounded-xl border border-slate-100/50">{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Offset blank cells */}
          {Array.from({ length: firstDayIndex }).map((_, idx) => (
            <div key={'empty-' + idx} className="bg-slate-50/20 rounded-[1.5rem] min-h-[95px] border border-dashed border-slate-100/40 opacity-20" />
          ))}

          {/* Active days */}
          {daysInMonth.map(day => {
            const dateStr = day.toISOString().split('T')[0]
            const dayNum = day.getDate()
            const isToday = day.toDateString() === new Date().toDateString()
            
            const lStatus = getMealStatus(selectedCalendarUserId, dateStr, 'lunch')
            const dStatus = getMealStatus(selectedCalendarUserId, dateStr, 'dinner')
            const lLocked = isLocked(dateStr, 'lunch')
            const dLocked = isLocked(dateStr, 'dinner')
            
            const dayDuties = rosterRecords.filter(r => r.date === dateStr && r.user_id === selectedCalendarUserId)
            const hasBazar = dayDuties.some(d => d.duty_type === 'bazar')
            const hasWater = dayDuties.some(d => d.duty_type === 'water')
            const dayGuests = guestList.filter(g => g.date === dateStr && g.user_id === selectedCalendarUserId)
            
            const isMe = selectedCalendarUserId === user?.id
            const lDisabled = !isManager && (!isMe || lLocked)
            const dDisabled = !isManager && (!isMe || dLocked)

            return (
              <Card 
                key={dateStr}
                className={`rounded-[1.5rem] p-2.5 min-h-[95px] flex flex-col justify-between transition-all border relative ${
                  isToday 
                    ? 'ring-2 ring-primary border-transparent bg-white shadow-md' 
                    : 'border-slate-100 bg-white hover:border-slate-200'
                }`}
              >
                {/* Day Header */}
                <div className="flex justify-between items-start">
                  <span className={`text-xs font-black ${isToday ? 'text-primary' : 'text-slate-800'}`}>
                    {dayNum}
                  </span>
                  
                  <div className="flex gap-0.5">
                    {hasBazar && (
                      <Badge className="bg-orange-500 hover:bg-orange-600 text-white p-0.5 rounded-md text-[8px] font-black h-4 w-4 flex items-center justify-center shrink-0" title="Bazar Duty">
                        <ShoppingBag className="w-2.5 h-2.5" />
                      </Badge>
                    )}
                    {hasWater && (
                      <Badge className="bg-blue-500 hover:bg-blue-600 text-white p-0.5 rounded-md text-[8px] font-black h-4 w-4 flex items-center justify-center shrink-0" title="Water Duty">
                        <Droplets className="w-2.5 h-2.5" />
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Center / Guests Details Popup Link */}
                <div className="my-1 flex flex-wrap gap-1">
                  {dayGuests.length > 0 && (
                    <span 
                      onClick={() => setSelectedDayDetails(day)}
                      className="text-[8px] font-black text-primary bg-primary/5 border border-primary/10 rounded-md px-1 py-0.5 leading-none cursor-pointer flex items-center gap-0.5"
                    >
                      <Users className="w-2 h-2" /> +{dayGuests.length} G
                    </span>
                  )}
                  {(hasBazar || hasWater || dayGuests.length > 0) && (
                    <span 
                      onClick={() => setSelectedDayDetails(day)}
                      className="text-[8px] font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-100 rounded-md px-1 py-0.5 leading-none cursor-pointer"
                    >
                      Details
                    </span>
                  )}
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-2 gap-1 mt-auto">
                  {/* Lunch Toggle */}
                  <button
                    disabled={lDisabled}
                    onClick={() => toggleMeal(selectedCalendarUserId, dateStr, 'lunch')}
                    className={`h-6 rounded-lg text-[9px] font-black flex items-center justify-center transition-all ${
                      lDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-90'
                    } ${
                      lStatus === 'eating'
                        ? 'bg-green-500 text-white shadow-sm'
                        : 'bg-red-50 text-red-500 border border-red-100 hover:bg-red-100/50'
                    }`}
                    title={`Lunch: ${lStatus === 'eating' ? 'Eating' : 'Off'} (Cutoff ${lunchCutoffStr})`}
                  >
                    L
                  </button>

                  {/* Dinner Toggle */}
                  <button
                    disabled={dDisabled}
                    onClick={() => toggleMeal(selectedCalendarUserId, dateStr, 'dinner')}
                    className={`h-6 rounded-lg text-[9px] font-black flex items-center justify-center transition-all ${
                      dDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-90'
                    } ${
                      dStatus === 'eating'
                        ? 'bg-green-500 text-white shadow-sm'
                        : 'bg-red-50 text-red-500 border border-red-100 hover:bg-red-100/50'
                    }`}
                    title={`Dinner: ${dStatus === 'eating' ? 'Eating' : 'Off'} (Cutoff ${dinnerCutoffStr})`}
                  >
                    D
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  const renderSheetView = () => {
    return (
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
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
    )
  }

  const renderGuestList = () => {
    return (
      <Card className="border-0 shadow-lg bg-white overflow-hidden mt-6 rounded-3xl">
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
    )
  }



  const renderDailyAccordionView = () => {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-primary/5 to-primary/0 border border-slate-100 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-slate-800">
              Daily Roster Roll-Call
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Expand any day to view meal lists & duty roster
            </p>
          </div>
          <Badge className="bg-primary/10 text-primary border-0 font-bold text-[10px] py-1 px-3 rounded-full">
            {daysInMonth.length} Days
          </Badge>
        </div>

        <div className="space-y-3">
          {daysInMonth.map((day) => {
            const dateStr = day.toISOString().split('T')[0]
            const isToday = dateStr === new Date().toISOString().split('T')[0]
            const dayNum = day.getDate()
            const dayName = day.toLocaleDateString('en-IN', { weekday: 'short' })
            const isExpanded = expandedDay === dateStr

            // Find duties for this day
            const dayDuties = rosterRecords.find(r => r.date === dateStr)
            
            // Calculate Lunch and Dinner totals
            let lunchEatingCount = 0
            let dinnerEatingCount = 0
            const lunchEatersList: Profile[] = []
            const dinnerEatersList: Profile[] = []
            const lunchOffList: Profile[] = []
            const dinnerOffList: Profile[] = []

            profiles.forEach(p => {
              const statusLunch = getMealStatus(p.id, dateStr, 'lunch')
              const statusDinner = getMealStatus(p.id, dateStr, 'dinner')

              if (statusLunch === 'eating') {
                lunchEatingCount++
                lunchEatersList.push(p)
              } else {
                lunchOffList.push(p)
              }

              if (statusDinner === 'eating') {
                dinnerEatingCount++
                dinnerEatersList.push(p)
              } else {
                dinnerOffList.push(p)
              }
            })

            // Guests for this day
            const dayGuests = guestList.filter(g => g.date === dateStr)
            const lunchGuests = dayGuests.filter(g => g.type === 'lunch')
            const dinnerGuests = dayGuests.filter(g => g.type === 'dinner')
            
            const totalLunch = lunchEatingCount + lunchGuests.length
            const totalDinner = dinnerEatingCount + dinnerGuests.length

            return (
              <div 
                key={dateStr}
                className={`bg-white rounded-2xl border transition-all ${
                  isExpanded 
                    ? 'border-primary shadow-md ring-2 ring-primary/5' 
                    : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'
                } overflow-hidden`}
              >
                {/* Header Row */}
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer select-none"
                  onClick={() => setExpandedDay(isExpanded ? null : dateStr)}
                >
                  <div className="flex items-center gap-3.5">
                    {/* Date Badge */}
                    <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center border ${
                      isToday 
                        ? 'bg-primary text-white border-primary shadow-sm' 
                        : 'bg-slate-50 text-slate-700 border-slate-200/60'
                    }`}>
                      <span className="text-base font-black leading-none">{dayNum}</span>
                      <span className="text-[8px] font-black uppercase tracking-wider mt-0.5 leading-none opacity-80">{dayName}</span>
                    </div>

                    <div className="space-y-1">
                      {/* Duties indicator */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {dayDuties?.bazar_id && (
                          <Badge className="bg-orange-50 text-orange-700 border border-orange-100 text-[8px] px-1.5 py-0.5 rounded font-black gap-1">
                            <ShoppingBag className="w-2.5 h-2.5" />
                            {profiles.find(p => p.id === dayDuties.bazar_id)?.full_name.split(' ')[0]}
                          </Badge>
                        )}
                        {dayDuties?.water_id && (
                          <Badge className="bg-blue-50 text-blue-700 border border-blue-100 text-[8px] px-1.5 py-0.5 rounded font-black gap-1">
                            <Droplets className="w-2.5 h-2.5" />
                            {profiles.find(p => p.id === dayDuties.water_id)?.full_name.split(' ')[0]}
                          </Badge>
                        )}
                        {!dayDuties?.bazar_id && !dayDuties?.water_id && (
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">No duties</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {dateStr === new Date().toISOString().split('T')[0] ? 'TODAY' : 'Scheduled'}
                      </p>
                    </div>
                  </div>

                  {/* Summary counts */}
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <div className="text-right bg-slate-50 border border-slate-100 py-1.5 px-3 rounded-xl">
                        <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-none">Lunch</p>
                        <p className="text-xs font-black text-slate-700 mt-1">{totalLunch} <span className="text-[9px] text-slate-400 font-medium">on</span></p>
                      </div>
                      <div className="text-right bg-slate-50 border border-slate-100 py-1.5 px-3 rounded-xl">
                        <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-none">Dinner</p>
                        <p className="text-xs font-black text-slate-700 mt-1">{totalDinner} <span className="text-[9px] text-slate-400 font-medium">on</span></p>
                      </div>
                    </div>
                    <ChevronRight className={`w-5 h-5 text-slate-300 transition-all ${isExpanded ? 'rotate-90 text-primary' : ''}`} />
                  </div>
                </div>

                {/* Expanded Section */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Lunch Details */}
                      <Card className="border-slate-100 shadow-sm rounded-2xl bg-white">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-xs font-black uppercase text-slate-700">Lunch Eaters ({totalLunch})</span>
                            {lunchGuests.length > 0 && <Badge className="bg-primary/10 text-primary text-[8px] font-bold border-0">+{lunchGuests.length} Guests</Badge>}
                          </div>
                          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                            {lunchEatersList.map(p => {
                              const locked = isLocked(dateStr, 'lunch')
                              const isMe = p.id === user?.id
                              const isManager = myProfile?.role === 'manager' || myProfile?.role === 'co_manager'
                              return (
                                <div key={p.id} className="flex justify-between items-center text-xs">
                                  <span className={`font-semibold ${isMe ? 'text-primary font-bold' : 'text-slate-600'}`}>{p.full_name} {isMe ? '(You)' : ''}</span>
                                  <Button
                                    size="sm"
                                    variant={locked ? "ghost" : "outline"}
                                    className={`h-7 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                                      locked ? 'bg-slate-100 text-slate-400 border-0 cursor-not-allowed' : 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100'
                                    }`}
                                    onClick={() => !locked && toggleMeal(p.id, dateStr, 'lunch')}
                                    disabled={locked && !isManager}
                                  >
                                    🟢 EATING
                                  </Button>
                                </div>
                              )
                            })}
                            {lunchGuests.map(g => (
                              <div key={g.id} className="flex justify-between items-center text-xs text-slate-500 italic">
                                <span>👤 {g.guest_name || 'Guest'} (Hosted by {profiles.find(p => p.id === g.user_id)?.full_name.split(' ')[0]})</span>
                                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">GUEST</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Dinner Details */}
                      <Card className="border-slate-100 shadow-sm rounded-2xl bg-white">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-xs font-black uppercase text-slate-700">Dinner Eaters ({totalDinner})</span>
                            {dinnerGuests.length > 0 && <Badge className="bg-primary/10 text-primary text-[8px] font-bold border-0">+{dinnerGuests.length} Guests</Badge>}
                          </div>
                          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                            {dinnerEatersList.map(p => {
                              const locked = isLocked(dateStr, 'dinner')
                              const isMe = p.id === user?.id
                              const isManager = myProfile?.role === 'manager' || myProfile?.role === 'co_manager'
                              return (
                                <div key={p.id} className="flex justify-between items-center text-xs">
                                  <span className={`font-semibold ${isMe ? 'text-primary font-bold' : 'text-slate-600'}`}>{p.full_name} {isMe ? '(You)' : ''}</span>
                                  <Button
                                    size="sm"
                                    variant={locked ? "ghost" : "outline"}
                                    className={`h-7 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                                      locked ? 'bg-slate-100 text-slate-400 border-0 cursor-not-allowed' : 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100'
                                    }`}
                                    onClick={() => !locked && toggleMeal(p.id, dateStr, 'dinner')}
                                    disabled={locked && !isManager}
                                  >
                                    🟢 EATING
                                  </Button>
                                </div>
                              )
                            })}
                            {dinnerGuests.map(g => (
                              <div key={g.id} className="flex justify-between items-center text-xs text-slate-500 italic">
                                <span>👤 {g.guest_name || 'Guest'} (Hosted by {profiles.find(p => p.id === g.user_id)?.full_name.split(' ')[0]})</span>
                                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">GUEST</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Off List Details */}
                      <Card className="border-slate-100 shadow-sm rounded-2xl bg-white md:col-span-2">
                        <CardContent className="p-4 space-y-2">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Off / Absent Status List</span>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {profiles.map(p => {
                              const statusLunch = getMealStatus(p.id, dateStr, 'lunch')
                              const statusDinner = getMealStatus(p.id, dateStr, 'dinner')
                              const isMe = p.id === user?.id

                              if (statusLunch === 'off' || statusDinner === 'off') {
                                return (
                                  <Badge 
                                    key={p.id} 
                                    variant="outline" 
                                    className={`px-3 py-1.5 rounded-xl border border-slate-100 flex items-center gap-1.5 text-slate-500 font-semibold ${
                                      isMe ? 'bg-primary/5 text-primary border-primary/20' : 'bg-slate-50'
                                    }`}
                                  >
                                    <span>{p.full_name}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                      ({statusLunch === 'off' ? 'L' : ''}{statusLunch === 'off' && statusDinner === 'off' ? '+' : ''}{statusDinner === 'off' ? 'D' : ''} OFF)
                                    </span>
                                  </Badge>
                                )
                              }
                              return null
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
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
              className="rounded-full shadow-lg border-0 h-10 gap-2 px-4 font-bold bg-[#6A2C70] hover:bg-[#4D1C54] text-white"
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
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6A2C70]">Attendance</p>
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

      <div className="mx-auto px-4 space-y-6 max-w-4xl">
        {/* Today's Confirmed Eaters Card */}
        <Card className="border-0 shadow-sm bg-primary text-white overflow-hidden rounded-[2.5rem]">
          <div className="bg-white/5 p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              <h3 className="text-xs font-black uppercase tracking-wider text-accent">Confirmed Eaters Today</h3>
            </div>
            <Badge className="bg-accent hover:bg-accent/90 text-accent-foreground font-black text-[9px] px-2 rounded-lg border-0">
              {eatersSummary.confirmedLunchMembers + eatersSummary.confirmedLunchGuests.length + eatersSummary.confirmedDinnerMembers + eatersSummary.confirmedDinnerGuests.length} Portions
            </Badge>
          </div>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Lunch */}
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">Lunch Eaters</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-black text-white">{eatersSummary.confirmedLunchMembers + eatersSummary.confirmedLunchGuests.length}</span>
                  <span className="text-[10px] text-slate-400">portions</span>
                </div>
                <p className="text-[9px] text-slate-300/80 font-medium">
                  {eatersSummary.confirmedLunchMembers} Members • {eatersSummary.confirmedLunchGuests.length} Guests
                </p>
              </div>

              {/* Dinner */}
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">Dinner Eaters</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-black text-white">{eatersSummary.confirmedDinnerMembers + eatersSummary.confirmedDinnerGuests.length}</span>
                  <span className="text-[10px] text-slate-400">portions</span>
                </div>
                <p className="text-[9px] text-slate-300/80 font-medium">
                  {eatersSummary.confirmedDinnerMembers} Members • {eatersSummary.confirmedDinnerGuests.length} Guests
                </p>
              </div>
            </div>

            {/* Guest breakdown details */}
            {eatersSummary.todayGuests.length > 0 && (
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5 space-y-2">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Guest Items List</p>
                <div className="divide-y divide-white/5 max-h-[120px] overflow-y-auto">
                  {eatersSummary.todayGuests.map((g, idx) => (
                    <div key={idx} className="flex justify-between py-1.5 text-xs text-slate-200">
                      <span className="font-semibold">{g.guest_name || 'Guest'} <span className="text-[9px] text-slate-400 uppercase font-medium">({g.type})</span></span>
                      <span className="text-accent font-bold">{g.guest_type || 'Standard'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Layout and Member Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          <div className="space-y-1">
            <h3 className="text-[9px] font-black uppercase tracking-wider text-slate-400">View Layout</h3>
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/50 shadow-inner w-fit">
              <button 
                className={`rounded-xl font-black uppercase text-[9px] tracking-wider px-3.5 py-2 transition-all flex items-center gap-1.5 ${
                  viewMode === 'calendar' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setViewMode('calendar')}
              >
                <Calendar className="w-3.5 h-3.5" /> Calendar View
              </button>
              <button 
                className={`rounded-xl font-black uppercase text-[9px] tracking-wider px-3.5 py-2 transition-all flex items-center gap-1.5 ${
                  viewMode === 'sheet' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setViewMode('sheet')}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Sheet Matrix
              </button>
              <button 
                className={`rounded-xl font-black uppercase text-[9px] tracking-wider px-3.5 py-2 transition-all flex items-center gap-1.5 ${
                  viewMode === 'daily' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'
                }`}
                onClick={() => setViewMode('daily')}
              >
                <Clock className="w-3.5 h-3.5" /> Daily Accordion
              </button>
            </div>
          </div>

          {(viewMode !== 'sheet' && viewMode !== 'daily') && (
            <div className="space-y-1 self-stretch md:self-auto">
              <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Viewing Calendar For</label>
              <select
                className="w-full md:w-[220px] h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
                value={selectedCalendarUserId}
                onChange={(e) => setSelectedCalendarUserId(e.target.value)}
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} {p.id === user?.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Dynamic view rendering */}
        {viewMode === 'calendar' && (
          <div className="space-y-6">
            {renderCalendarView()}
            {renderGuestList()}
          </div>
        )}

        {viewMode === 'sheet' && (
          <div className="space-y-6">
            {renderSheetView()}
            {renderGuestList()}
          </div>
        )}

        {viewMode === 'daily' && (
          <div className="space-y-6">
            {renderDailyAccordionView()}
          </div>
        )}
      </div>

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

      {/* Day Details Modal */}
      <Dialog open={!!selectedDayDetails} onOpenChange={(open) => !open && setSelectedDayDetails(null)}>
        <DialogContent className="max-w-[95vw] rounded-3xl sm:max-w-md">
          {selectedDayDetails && (() => {
            const dateStr = selectedDayDetails.toISOString().split('T')[0]
            const formatted = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(selectedDayDetails)
            const dayGuests = guestList.filter(g => g.date === dateStr && g.user_id === selectedCalendarUserId)
            const dayDuties = rosterRecords.filter(r => r.date === dateStr && r.user_id === selectedCalendarUserId)
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-lg font-black tracking-tight">{formatted}</DialogTitle>
                  <DialogDescription className="text-xs">
                    View schedule, pre-registered guests, and roster duties for this day.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {/* Duties */}
                  {dayDuties.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Duties Assigned</Label>
                      <div className="flex gap-2">
                        {dayDuties.map(d => (
                          <Badge 
                            key={d.id} 
                            className={`rounded-xl px-3 py-1 font-bold text-[10px] uppercase gap-1.5 ${
                              d.duty_type === 'bazar' 
                                ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                            }`}
                          >
                            {d.duty_type === 'bazar' ? <ShoppingBag className="w-3 h-3" /> : <Droplets className="w-3 h-3" />}
                            {d.duty_type === 'bazar' ? 'Bazar Duty' : 'Water Duty'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No duty roster assignments for you on this day.</p>
                  )}

                  {/* Pre-Registered Guests */}
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pre-Registered Guests ({dayGuests.length})</Label>
                    {dayGuests.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No guests pre-registered for this day.</p>
                    ) : (
                      <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                        {dayGuests.map(guest => {
                          const locked = isLocked(guest.date, guest.type)
                          return (
                            <div key={guest.id} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                              <div>
                                <p className="font-bold text-xs text-slate-800">{guest.guest_name}</p>
                                <p className="text-[9px] font-bold text-primary uppercase mt-0.5">{guest.type} • {guest.guest_type || 'Standard'}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-600">₹{guest.guest_price}</span>
                                {(myProfile?.role === 'manager' || myProfile?.role === 'co_manager' || guest.user_id === user?.id) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 rounded-lg text-slate-400 hover:text-red-500"
                                    onClick={async () => {
                                      await handleDeleteGuest(guest.id, guest.user_id)
                                    }}
                                    disabled={isProcessing || (locked && myProfile?.role !== 'manager' && myProfile?.role !== 'co_manager')}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Quick Guest Add */}
                  <Button 
                    className="w-full h-11 rounded-xl font-bold uppercase tracking-wider text-xs bg-primary hover:bg-primary/90 text-white"
                    onClick={() => {
                      setGuestForm(prev => ({ ...prev, date: dateStr, userId: selectedCalendarUserId }))
                      setSelectedDayDetails(null)
                      setShowAddGuest(true)
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Pre-Register Guest for this Day
                  </Button>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
