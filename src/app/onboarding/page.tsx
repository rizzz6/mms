'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, UserCircle, Building2, Hash, ArrowRight, PlusCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function OnboardingPage() {
  const [step, setStep] = useState<'profile' | 'mess'>('profile')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Mess State
  const [messMode, setMessMode] = useState<'join' | 'create' | null>(null)
  const [messName, setMessName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push('/login')
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, mess_id')
        .eq('id', user.id)
        .single()
      
      if (profile?.full_name) {
        setFullName(profile.full_name)
        setStep('mess')
      }
      
      if (profile?.mess_id) {
        router.push('/dashboard')
      }
    }
    checkUser()
  }, [supabase, router])

  const handleProfileComplete = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id)

      if (error) throw error
      setStep('mess')
    } catch (err) {
      if (err instanceof Error) toast.error(err.message)
      else toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCreateMess = async () => {
    if (!messName) return toast.error('Enter mess name')
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Auth error')

      // 1. Generate unique code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase()

      // 2. Create mess
      const { data: mess, error: messError } = await supabase
        .from('messes')
        .insert({ 
          name: messName, 
          join_code: code,
          manager_id: user.id 
        })
        .select()
        .single()
      
      if (messError) throw messError

      // 3. Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          mess_id: mess.id, 
          role: 'manager',
          status: 'approved'
        })
        .eq('id', user.id)
      
      if (profileError) throw profileError

      toast.success(`Mess "${messName}" created! Code: ${code}`)
      router.push('/dashboard')
    } catch (err) {
      if (err instanceof Error) toast.error(err.message)
      else toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleJoinMess = async () => {
    if (!joinCode) return toast.error('Enter join code')
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Auth error')

      // 1. Find mess
      const { data: mess, error: messError } = await supabase
        .from('messes')
        .select('id, name')
        .eq('join_code', joinCode.toUpperCase())
        .single()
      
      if (messError || !mess) throw new Error('Invalid join code')

      // 2. Update profile (pending approval)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          mess_id: mess.id, 
          role: 'member',
          status: 'pending'
        })
        .eq('id', user.id)
      
      if (profileError) throw profileError

      toast.success(`Request sent to join ${mess.name}`)
      router.push('/dashboard')
    } catch (err) {
      if (err instanceof Error) toast.error(err.message)
      else toast.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md space-y-8">
        
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-[2rem] bg-primary/10 text-primary mb-2 shadow-inner">
            {step === 'profile' ? <UserCircle className="w-8 h-8" /> : <Building2 className="w-8 h-8" />}
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {step === 'profile' ? 'Welcome!' : 'Almost there'}
          </h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            {step === 'profile' ? 'Setup your profile' : 'Choose your mess'}
          </p>
        </div>

        {step === 'profile' ? (
          <Card className="border-0 shadow-2xl shadow-slate-200 rounded-[2.5rem] overflow-hidden">
            <CardContent className="p-8">
              <form onSubmit={handleProfileComplete} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Your Full Name
                  </label>
                  <Input
                    placeholder="Enter your name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold text-lg focus:ring-primary focus:border-primary px-6"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-2xl font-black uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95 flex gap-2" 
                  disabled={loading || !fullName}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {!messMode ? (
              <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button 
                  onClick={() => setMessMode('join')}
                  className="group relative flex flex-col items-center p-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 hover:border-primary/50 transition-all active:scale-95"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Hash className="w-6 h-6" />
                  </div>
                  <span className="text-lg font-black text-slate-800">Join Existing Mess</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">I have a 6-digit code</span>
                </button>

                <button 
                  onClick={() => setMessMode('create')}
                  className="group relative flex flex-col items-center p-8 bg-slate-900 rounded-[2.5rem] shadow-2xl hover:bg-slate-800 transition-all active:scale-95"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/10 text-white flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <PlusCircle className="w-6 h-6" />
                  </div>
                  <span className="text-lg font-black text-white">Start New Mess</span>
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">I am the mess manager</span>
                </button>
              </div>
            ) : (
              <Card className="border-0 shadow-2xl shadow-slate-200 rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 duration-300">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black text-slate-800">
                      {messMode === 'join' ? 'Enter Join Code' : 'Mess Name'}
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">
                      {messMode === 'join' ? 'Ask your manager for the code' : 'Give your mess a unique name'}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest" onClick={() => setMessMode(null)}>
                    Back
                  </Button>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  {messMode === 'join' ? (
                    <div className="space-y-4">
                      <Input 
                        placeholder="ABCDEF"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        maxLength={6}
                        className="h-16 text-center text-3xl font-black tracking-[0.5em] rounded-2xl bg-slate-50 border-slate-100 focus:border-primary transition-all uppercase"
                      />
                      <Button 
                        onClick={handleJoinMess}
                        className="w-full h-14 rounded-2xl font-black uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 active:scale-95 transition-all"
                        disabled={loading || joinCode.length < 6}
                      >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Request to Join'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Input 
                        placeholder="e.g. Royal Mess"
                        value={messName}
                        onChange={(e) => setMessName(e.target.value)}
                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold text-lg px-6"
                      />
                      <Button 
                        onClick={handleCreateMess}
                        className="w-full h-14 rounded-2xl font-black uppercase tracking-widest bg-slate-900 hover:bg-slate-800 text-white shadow-xl active:scale-95 transition-all"
                        disabled={loading || !messName}
                      >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Mess'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
        
        {step === 'mess' && (
          <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest px-8 leading-relaxed">
            Joining a mess will allow you to track your meals, payments and duty roster.
          </p>
        )}
      </div>
    </div>
  )
}
