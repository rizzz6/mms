'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save, User as UserIcon, Mail, Lock, Eye, EyeOff, ChevronLeft, Bell } from 'lucide-react'
import { toast } from 'sonner'
import PushNotificationToggle from '@/components/PushNotificationToggle'

export default function AccountSettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)
      setEmail(user.email || '')

      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()

      if (data) {
        setFullName(data.full_name || '')
      }
      
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  const handleUpdateProfile = async () => {
    if (!user) return
    setSavingProfile(true)
    try {
      // 1. Update Name in profiles table
      const { error: pError } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id)
      
      if (pError) throw pError

      // 2. Update Email/Password in Auth if changed
      const updates: { email?: string; password?: string } = {}
      if (email !== user.email) updates.email = email
      if (newPassword) updates.password = newPassword

      if (Object.keys(updates).length > 0) {
        const { error: aError } = await supabase.auth.updateUser(updates)
        if (aError) throw aError
        if (updates.email) toast.success('Confirmation email sent to new address!')
      }

      toast.success('Profile updated successfully!')
      setNewPassword('')
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setSavingProfile(false)
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
            onClick={() => window.history.back()}
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </Button>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Account</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Profile Settings</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">

      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-primary" />
            Personal Profile
          </CardTitle>
          <CardDescription>
            Manage your public identity and account access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-slate-400" />
              Full Name
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-11 bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400" />
              Email Address
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 bg-white"
            />
          </div>
          <div className="space-y-2 relative">
            <Label className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              New Password
            </Label>
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Leave blank to keep current"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11 bg-white pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-9 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button 
            className="w-full h-11 font-bold shadow-md border-0 bg-primary hover:bg-primary/90 text-white" 
            onClick={handleUpdateProfile}
            disabled={savingProfile}
          >
            {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : <Save className="mr-2 h-4 w-4" />}
            Update Profile
          </Button>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-3 duration-300">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notifications
          </CardTitle>
          <CardDescription>
            Enable push notifications to receive real-time alerts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PushNotificationToggle />
        </CardContent>
      </Card>
    </div>
    </div>
  )
}
