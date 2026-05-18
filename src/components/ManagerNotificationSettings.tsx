'use client'

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { ShoppingBag, Droplets, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import { updateNotificationPrefs } from '@/app/actions/push'
import { createClient } from '@/utils/supabase/client'

export default function ManagerNotificationSettings() {
  const [prefs, setPrefs] = useState({
    manager_bazaar_approval: true,
    manager_water_approval: true,
    manager_meal_toggles: true
  })
  const [isLoading, setIsLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function fetchPrefs() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('notification_prefs')
          .eq('id', user.id)
          .single()
        
        if (data?.notification_prefs) {
          setPrefs(prev => ({ ...prev, ...(data.notification_prefs as any) }))
        }
      }
      setIsLoading(false)
    }
    fetchPrefs()
  }, [supabase])

  const togglePref = async (key: keyof typeof prefs) => {
    const newPrefs = { ...prefs, [key]: !prefs[key] }
    setPrefs(newPrefs)
    try {
      await updateNotificationPrefs(newPrefs)
      toast.success('Manager alerts updated')
    } catch {
      toast.error('Failed to update preferences')
      setPrefs(prefs) // Revert
    }
  }

  if (isLoading) {
    return <div className="animate-pulse h-20 bg-slate-100 rounded-xl" />
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Manager Real-time Alerts:</p>
      
      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-slate-700">Bazaar Approvals</p>
            <p className="text-[9px] text-slate-400 font-medium">When a member submits a bazaar bill.</p>
          </div>
        </div>
        <Switch 
          checked={prefs.manager_bazaar_approval} 
          onCheckedChange={() => togglePref('manager_bazaar_approval')} 
        />
      </div>

      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Droplets className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-slate-700">Water Approvals</p>
            <p className="text-[9px] text-slate-400 font-medium">When a member submits water logs.</p>
          </div>
        </div>
        <Switch 
          checked={prefs.manager_water_approval} 
          onCheckedChange={() => togglePref('manager_water_approval')} 
        />
      </div>

      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
            <Utensils className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-slate-700">Meal Toggles</p>
            <p className="text-[9px] text-slate-400 font-medium">When a member turns a meal ON or OFF.</p>
          </div>
        </div>
        <Switch 
          checked={prefs.manager_meal_toggles} 
          onCheckedChange={() => togglePref('manager_meal_toggles')} 
        />
      </div>
    </div>
  )
}
