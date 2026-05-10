'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Lock, Unlock, Users, Calendar, ChevronLeft, ChevronRight, PlusCircle } from 'lucide-react'
import { toast } from 'sonner'

// --- Types & Utilities ---

type MealType = 'lunch' | 'dinner'
type MealStatus = 'eating' | 'off'

interface MealRecord {
  id?: string
  type: MealType
  status: MealStatus
  is_guest: boolean
  user_id?: string
}

const LUNCH_CUTOFF = 9 // 9:00 AM
const DINNER_CUTOFF = 17 // 5:00 PM

function getCutoffStatus(date: Date) {
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const isPast = date < new Date(now.setHours(0, 0, 0, 0))
  const isFuture = date > new Date(now.setHours(23, 59, 59, 999))

  if (isPast) return { lunchLocked: true, dinnerLocked: true, isToday: false }
  if (isFuture) return { lunchLocked: false, dinnerLocked: false, isToday: false }

  const currentHour = now.getHours()
  return {
    lunchLocked: currentHour >= LUNCH_CUTOFF,
    dinnerLocked: currentHour >= DINNER_CUTOFF,
    isToday: true
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(date)
}

// --- Main Component ---

export default function MealsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [meals, setMeals] = useState<MealRecord[]>([])
  const [allMemberMeals, setAllMemberMeals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>('member')
  const [userId, setUserId] = useState<string | null>(null)
  
  const supabase = createClient()

  const fetchMeals = useCallback(async (date: Date) => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const dateStr = date.toISOString().split('T')[0]

      // Fetch user's own meals
      const { data: userMeals } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', dateStr)

      setMeals(userMeals || [])

      // Fetch profile for role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      
      setUserRole(profile?.role || 'member')

      // If manager, fetch everyone's meals
      if (profile?.role === 'manager') {
        const { data: members } = await supabase
          .from('profiles')
          .select('id, full_name')
        
        const { data: allMeals } = await supabase
          .from('meals')
          .select('*')
          .eq('date', dateStr)

        const memberStatusList = members?.map(m => ({
          ...m,
          lunch: allMeals?.find(ml => ml.user_id === m.id && ml.type === 'lunch'),
          dinner: allMeals?.find(ml => ml.user_id === m.id && ml.type === 'dinner'),
          guests: allMeals?.filter(ml => ml.user_id === m.id && ml.is_guest) || []
        }))

        setAllMemberMeals(memberStatusList || [])
      }
    } catch (error) {
      console.error(error)
      toast.error('Failed to load attendance')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchMeals(selectedDate)
  }, [selectedDate, fetchMeals])

  const toggleMeal = async (type: MealType, currentStatus: MealStatus | undefined, overrideUserId?: string) => {
    const targetUserId = overrideUserId || userId
    if (!targetUserId) return

    const newStatus: MealStatus = currentStatus === 'off' ? 'eating' : 'off'
    const dateStr = selectedDate.toISOString().split('T')[0]

    try {
      const { error } = await supabase
        .from('meals')
        .upsert({
          user_id: targetUserId,
          date: dateStr,
          type,
          status: newStatus,
          is_guest: false
        }, { onConflict: 'user_id, date, type' })

      if (error) throw error
      toast.success(`${type.toUpperCase()} marked as ${newStatus}`)
      fetchMeals(selectedDate)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const addGuestMeal = async (type: MealType) => {
    if (!userId) return
    const dateStr = selectedDate.toISOString().split('T')[0]

    try {
      const { error } = await supabase
        .from('meals')
        .insert({
          user_id: userId,
          date: dateStr,
          type,
          status: 'eating',
          is_guest: true
        })

      if (error) throw error
      toast.success(`Guest ${type} added!`)
      fetchMeals(selectedDate)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + days)
    setSelectedDate(newDate)
  }

  const cutoff = getCutoffStatus(selectedDate)

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      {/* Date Picker Header */}
      <div className="flex items-center justify-between bg-white p-2 rounded-2xl shadow-sm border">
        <Button variant="ghost" size="icon" onClick={() => changeDate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 font-bold text-slate-700">
          <Calendar className="w-4 h-4 text-primary" />
          {formatDate(selectedDate)}
          {cutoff.isToday && <Badge variant="outline" className="ml-1 text-[10px]">Today</Badge>}
        </div>
        <Button variant="ghost" size="icon" onClick={() => changeDate(1)}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Member Toggles */}
          <div className="grid gap-4">
            {(['lunch', 'dinner'] as const).map((type) => {
              const record = meals.find(m => m.type === type && !m.is_guest)
              const isLocked = type === 'lunch' ? cutoff.lunchLocked : cutoff.dinnerLocked
              const status = record?.status || 'eating'

              return (
                <Card key={type} className={`border-0 shadow-md overflow-hidden ${isLocked ? 'opacity-80' : ''}`}>
                  <CardContent className="p-0">
                    <div className={`p-4 flex items-center justify-between ${status === 'eating' ? 'bg-green-50' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${status === 'eating' ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          {type === 'lunch' ? '☀️' : '🌙'}
                        </div>
                        <div>
                          <h3 className="font-bold capitalize">{type}</h3>
                          <p className="text-[10px] text-slate-500">
                            {isLocked ? (
                              <span className="flex items-center gap-1 text-red-500">
                                <Lock className="w-2.5 h-2.5" /> Locked
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-green-600">
                                <Unlock className="w-2.5 h-2.5" /> Open until {type === 'lunch' ? '9 AM' : '5 PM'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={status === 'eating' ? 'bg-green-600' : 'bg-slate-400'}>
                          {status.toUpperCase()}
                        </Badge>
                        <Switch
                          checked={status === 'eating'}
                          disabled={isLocked}
                          onCheckedChange={() => toggleMeal(type, status)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Guest Meals Section */}
          <Card className="border-0 shadow-sm bg-white">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Guest Meals
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => addGuestMeal('lunch')}>
                  + Guest Lunch
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => addGuestMeal('dinner')}>
                  + Guest Dinner
                </Button>
              </div>
              
              {meals.filter(m => m.is_guest).length > 0 && (
                <div className="pt-2 border-t text-[10px] text-slate-500 space-y-1">
                  {meals.filter(m => m.is_guest).map((g, i) => (
                    <div key={i} className="flex justify-between items-center bg-slate-50 p-1.5 rounded-lg px-3">
                      <span className="capitalize">{g.type} Guest</span>
                      <span className="font-bold text-primary">Added</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manager Override Section */}
          {userRole === 'manager' && (
            <Card className="border-0 shadow-lg bg-slate-900 text-white">
              <CardHeader className="p-4">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <div className="bg-primary p-1 rounded-md">
                    <Users className="w-3 h-3" />
                  </div>
                  Member Attendance (Manager Override)
                </CardTitle>
                <CardDescription className="text-slate-400 text-[10px]">
                  Override members' status regardless of cut-offs.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 border-t border-slate-800">
                <div className="divide-y divide-slate-800">
                  {allMemberMeals.map((m) => (
                    <div key={m.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold">{m.full_name}</p>
                        <p className="text-[9px] text-slate-500">
                          {m.guests.length > 0 ? `${m.guests.length} guests` : 'No guests'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[8px] uppercase text-slate-500">L</span>
                          <Switch
                            className="scale-75"
                            checked={m.lunch?.status !== 'off'}
                            onCheckedChange={() => toggleMeal('lunch', m.lunch?.status || 'eating', m.id)}
                          />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[8px] uppercase text-slate-500">D</span>
                          <Switch
                            className="scale-75"
                            checked={m.dinner?.status !== 'off'}
                            onCheckedChange={() => toggleMeal('dinner', m.dinner?.status || 'eating', m.id)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
