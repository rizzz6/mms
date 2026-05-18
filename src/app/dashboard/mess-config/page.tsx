'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, QrCode, Save, Upload, AlertTriangle, ArrowRightLeft, Check, X, Settings, Copy, ChevronRight, Bell } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import ManagerNotificationSettings from '@/components/ManagerNotificationSettings'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function MessConfigPage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<{mess_id: string, role: string} | null>(null)
  const [messInfo, setMessInfo] = useState<{ name: string, join_code: string } | null>(null)
  const [messName, setMessName] = useState('')
  
  const [upiId, setUpiId] = useState('')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [mealTypes, setMealTypes] = useState<{label: string, price: number}[]>([])
  const [newMealLabel, setNewMealLabel] = useState('')
  const [newMealPrice, setNewMealPrice] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  // Handover State
  const [members, setMembers] = useState<{id: string, full_name: string}[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [transferring, setTransferring] = useState(false)
  
  // Danger Zone State
  const [isPaused, setIsPaused] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Fine & Penalty states
  const [finesEnabled, setFinesEnabled] = useState(false)
  const [penaltySkippedDuty, setPenaltySkippedDuty] = useState('')
  const [penaltyLowBalance, setPenaltyLowBalance] = useState('')
  const [minRequiredBalance, setMinRequiredBalance] = useState('')
  const [auditLogRetentionDays, setAuditLogRetentionDays] = useState('90')

  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)

      const [pRes, mRes, cRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('profiles').select('id, full_name').eq('mess_id', (await supabase.from('profiles').select('mess_id').eq('id', user.id).single()).data?.mess_id).eq('role', 'member').order('joined_at', { ascending: true }),
        supabase.from('mess_config').select('key, value').in('key', ['guest_meal_rate', 'guest_meal_types', 'is_paused', 'fines_enabled', 'penalty_skipped_duty', 'penalty_low_balance', 'minimum_required_balance', 'audit_log_retention_days']).eq('mess_id', (await supabase.from('profiles').select('mess_id').eq('id', user.id).single()).data?.mess_id)
      ])

      if (pRes.data?.mess_id) {
        const { data: mess } = await supabase
          .from('messes')
          .select('name, join_code, upi_id, qr_code_url')
          .eq('id', pRes.data.mess_id)
          .single()
        
        if (mess) {
          setMessInfo(mess)
          setMessName(mess.name || '')
          setUpiId(mess.upi_id || '')
          setQrUrl(mess.qr_code_url || null)
        }
      }

      if (pRes.data) {
        setProfile(pRes.data)
        if (pRes.data.role !== 'manager') {
          setLoading(false)
          return
        }
      }

      if (mRes.data) {
        setMembers(mRes.data)
      }

      if (cRes.data) {
        const rateConfig = cRes.data.find(c => c.key === 'guest_meal_rate')
        const typesConfig = cRes.data.find(c => c.key === 'guest_meal_types')
        const pauseConfig = cRes.data.find(c => c.key === 'is_paused')
        
        if (pauseConfig) {
          setIsPaused(pauseConfig.value === 'true')
        }

        const finesEnabledConfig = cRes.data.find(c => c.key === 'fines_enabled')
        const penaltySkippedConfig = cRes.data.find(c => c.key === 'penalty_skipped_duty')
        const penaltyLowConfig = cRes.data.find(c => c.key === 'penalty_low_balance')
        const minReqConfig = cRes.data.find(c => c.key === 'minimum_required_balance')
        const auditLogRetentionConfig = cRes.data.find(c => c.key === 'audit_log_retention_days')

        if (finesEnabledConfig) setFinesEnabled(finesEnabledConfig.value === 'true')
        if (penaltySkippedConfig) setPenaltySkippedDuty(penaltySkippedConfig.value || '50')
        if (penaltyLowConfig) setPenaltyLowBalance(penaltyLowConfig.value || '100')
        if (minReqConfig) setMinRequiredBalance(minReqConfig.value || '200')
        if (auditLogRetentionConfig) setAuditLogRetentionDays(auditLogRetentionConfig.value || '90')

        if (typesConfig) {
          try {
            setMealTypes(JSON.parse(typesConfig.value))
          } catch {
            setMealTypes([])
          }
        } else if (rateConfig) {
          setMealTypes([{ label: 'Standard', price: parseInt(rateConfig.value) }])
        }
      }
      
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `qr-${user.id}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('payments')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('payments')
        .getPublicUrl(filePath)

      setQrUrl(publicUrl)
      toast.success('QR Code uploaded successfully!')
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setUploading(false)
    }
  }

  const handleAddMealType = () => {
    if (!newMealLabel || !newMealPrice) return
    setMealTypes([...mealTypes, { label: newMealLabel, price: parseInt(newMealPrice) }])
    setNewMealLabel('')
    setNewMealPrice('')
  }

  const handleRemoveMealType = (index: number) => {
    setMealTypes(mealTypes.filter((_, i) => i !== index))
  }

  const handleSaveConfig = async () => {
    if (!profile) return
    setSavingConfig(true)
    try {
      const updates = [
        supabase.from('messes').update({
          name: messName,
          upi_id: upiId,
          qr_code_url: qrUrl
        }).eq('id', profile.mess_id),
        supabase.from('mess_config').upsert({
          key: 'guest_meal_types',
          value: JSON.stringify(mealTypes),
          description: 'JSON array of guest meal types',
          mess_id: profile.mess_id
        }),
        supabase.from('mess_config').upsert({
          key: 'fines_enabled',
          value: finesEnabled.toString(),
          description: 'Is the fine & penalty system enabled',
          mess_id: profile.mess_id
        }),
        supabase.from('mess_config').upsert({
          key: 'penalty_skipped_duty',
          value: penaltySkippedDuty,
          description: 'Fine for skipping duty',
          mess_id: profile.mess_id
        }),
        supabase.from('mess_config').upsert({
          key: 'penalty_low_balance',
          value: penaltyLowBalance,
          description: 'Fine for low balance',
          mess_id: profile.mess_id
        }),
        supabase.from('mess_config').upsert({
          key: 'minimum_required_balance',
          value: minRequiredBalance,
          description: 'Threshold below which balance is low',
          mess_id: profile.mess_id
        }),
        supabase.from('mess_config').upsert({
          key: 'audit_log_retention_days',
          value: auditLogRetentionDays || '90',
          description: 'Days to keep audit logs before auto-deletion',
          mess_id: profile.mess_id
        })
      ]

      const results = await Promise.all(updates)
      const error = results.find(r => r.error)?.error

      if (error) throw error
      toast.success('Mess configuration saved!')
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
    } finally {
      setSavingConfig(false)
    }
  }

  const handleTransfer = async () => {
    if (!selectedMemberId) return toast.error('Please select a member first')
    
    setTransferring(true)
    try {
      const { error } = await supabase.rpc('transfer_manager_role', {
        new_manager_id: selectedMemberId
      })

      if (error) throw error

      toast.success('Role transferred successfully!')
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 2000)
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
      setTransferring(false)
    }
  }

  const togglePause = async (paused: boolean) => {
    if (!profile) return
    setIsPaused(paused)
    try {
      const { error } = await supabase.from('mess_config').upsert({
        key: 'is_paused',
        value: paused.toString(),
        mess_id: profile.mess_id
      })
      if (error) throw error
      toast.success(paused ? 'Mess operations paused' : 'Mess operations resumed')
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
      setIsPaused(!paused)
    }
  }

  const handleDeleteMess = async () => {
    if (!profile) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('messes')
        .delete()
        .eq('id', profile.mess_id)

      if (error) throw error

      toast.success('Mess deleted successfully')
      window.location.href = '/onboarding'
    } catch (error) {
      if (error instanceof Error) toast.error(error.message)
      else toast.error(String(error))
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (profile?.role !== 'manager') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <Settings className="w-12 h-12 text-slate-300 mb-4" />
        <h1 className="text-xl font-bold text-slate-800">Access Denied</h1>
        <p className="text-sm text-slate-500 max-w-xs">Mess configuration is restricted to Managers.</p>
        <Button className="mt-6" onClick={() => window.location.href = '/dashboard'}>Go Back</Button>
      </div>
    )
  }

  const selectedMember = members.find(m => m.id === selectedMemberId)

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
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Configuration</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Mess Settings</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

        {/* 1. General Settings (Mess Name & Join Code) */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              General Settings
            </CardTitle>
            <CardDescription>
              Manage your mess identity and access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="messName">Mess Name</Label>
                <Input
                  id="messName"
                  placeholder="Enter mess name"
                  value={messName}
                  onChange={(e) => setMessName(e.target.value)}
                  className="h-11 bg-white"
                />
              </div>

              {messInfo && (
                <div className="p-3 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-between">
                  <div className="flex flex-col">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60">Join Code</p>
                    <p className="text-lg font-black tracking-[0.1em] text-primary leading-none">{messInfo.join_code}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 rounded-xl border border-primary/20 hover:bg-primary/10 text-primary shadow-sm transition-all active:scale-95"
                    onClick={() => {
                      navigator.clipboard.writeText(messInfo.join_code)
                      toast.success('Code copied to clipboard!')
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Pricing Section */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
              Pricing & Guest Meals
            </CardTitle>
            <CardDescription>
              Set rates for guest meals and other services.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input 
                    placeholder="e.g. Chicken" 
                    value={newMealLabel}
                    onChange={(e) => setNewMealLabel(e.target.value)}
                    className="flex-1"
                  />
                  <Input 
                    type="number" 
                    placeholder="₹" 
                    value={newMealPrice}
                    onChange={(e) => setNewMealPrice(e.target.value)}
                    className="w-20"
                  />
                  <Button type="button" size="icon" onClick={handleAddMealType}>
                    <Check className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {mealTypes.map((type, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-sm font-medium">{type.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-primary">₹{type.price}</span>
                        <button onClick={() => handleRemoveMealType(idx)} className="text-slate-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {mealTypes.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic text-center">No guest meal types added yet.</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Payment Details (UPI & QR Together) */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Payment Settings
            </CardTitle>
            <CardDescription>
              UPI ID and QR code for member payments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="upi">UPI ID</Label>
                <Input
                  id="upi"
                  placeholder="name@okaxis"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="h-11 bg-white"
                />
              </div>
              
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-slate-400" />
                  Payment QR Code
                </Label>
                <div className="relative aspect-square w-full max-w-[200px] mx-auto border-2 border-dashed rounded-2xl flex items-center justify-center bg-slate-50 overflow-hidden group">
                  {qrUrl ? (
                    <Image
                      src={qrUrl}
                      alt="Payment QR"
                      fill
                      className="object-contain p-2"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <Upload className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="text-xs text-slate-400">No QR Code</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Label htmlFor="qr-upload" className="cursor-pointer bg-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-xl">
                      {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      Change
                    </Label>
                    <Input
                      id="qr-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUpload}
                      disabled={uploading}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button 
              className="w-full h-12 font-black uppercase tracking-widest shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-white" 
              onClick={handleSaveConfig}
              disabled={savingConfig}
            >
              {savingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save All Settings
            </Button>
          </CardContent>
        </Card>

        {/* Fine & Penalty System Card */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500 fill-amber-100" />
              Fine & Penalty Settings
            </CardTitle>
            <CardDescription>
              Configure manual skipped duties and automatic low balance rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-800">Enable Fines & Penalties</p>
                <p className="text-[10px] text-slate-500 font-medium max-w-[200px]">
                  Allow manual duty skips and monthly cycle closures to assess fines.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={finesEnabled} 
                  onChange={(e) => setFinesEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {finesEnabled && (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-2">
                  <Label htmlFor="penaltySkipped">Skipped Duty Fine (₹)</Label>
                  <Input
                    id="penaltySkipped"
                    type="number"
                    placeholder="e.g. 50"
                    value={penaltySkippedDuty}
                    onChange={(e) => setPenaltySkippedDuty(e.target.value)}
                    className="h-11 bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minBalance">Minimum Required Balance (₹)</Label>
                  <Input
                    id="minBalance"
                    type="number"
                    placeholder="e.g. 200"
                    value={minRequiredBalance}
                    onChange={(e) => setMinRequiredBalance(e.target.value)}
                    className="h-11 bg-white"
                  />
                  <p className="text-[9px] text-slate-400 font-medium ml-1">
                    Fine is assessed if a member falls below this after monthly deductions.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="penaltyLow">Low Balance Penalty Fine (₹)</Label>
                  <Input
                    id="penaltyLow"
                    type="number"
                    placeholder="e.g. 100"
                    value={penaltyLowBalance}
                    onChange={(e) => setPenaltyLowBalance(e.target.value)}
                    className="h-11 bg-white"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit & Security Settings Card */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-500" />
              Audit & Logging Settings
            </CardTitle>
            <CardDescription>
              Configure how long manager activity logs are saved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="retentionDays">Log Retention Period (Days)</Label>
              <Input
                id="retentionDays"
                type="number"
                placeholder="e.g. 90"
                value={auditLogRetentionDays}
                onChange={(e) => setAuditLogRetentionDays(e.target.value)}
                className="h-11 bg-white"
              />
              <p className="text-[10px] text-slate-400 font-medium ml-1">
                Activity logs older than this will be automatically deleted to save space. Default is 90 days.
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* 4. Handover Section (Manager Only) */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
              Manager Handover
            </CardTitle>
            <CardDescription>
              Permanently transfer your manager role to another member.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4 pt-0">
            <div className="space-y-2">
              <Label htmlFor="new-manager">Select New Manager</Label>
              <select
                id="new-manager"
                className="w-full h-11 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
              >
                <option value="">Select a member...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>

            <Button 
              className="w-full h-11 font-black uppercase tracking-widest text-[10px] bg-slate-900 hover:bg-black text-white rounded-2xl" 
              onClick={() => {
                if (!selectedMemberId) return toast.error('Please select a member first')
                setShowConfirm(true)
              }}
            >
              Transfer Role
            </Button>
          </CardContent>
        </Card>

        {/* 5. Notification Alerts (Manager Only) */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm rounded-[2rem] overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
              <Bell className="w-5 h-5 text-primary" />
              Manager Alerts
            </CardTitle>
            <CardDescription>
              Choose which events you want to be notified about.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <ManagerNotificationSettings />
          </CardContent>
        </Card>

        {/* 6. Danger Zone */}
        <Card className="border-2 border-red-200 shadow-sm bg-red-50/20 rounded-[2rem] overflow-hidden">
          <CardHeader className="bg-red-50/50">
            <CardTitle className="text-lg flex items-center gap-2 text-red-800">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </CardTitle>
            <CardDescription className="text-red-600/70">
              High-impact actions for your mess.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Pause Option */}
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-red-100">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-800">Pause Mess Operations</p>
                <p className="text-[10px] text-slate-500 font-medium max-w-[200px]"> Temporarily stop meal logging and bazaar activities.</p>
              </div>
              <Button 
                variant={isPaused ? "default" : "outline"}
                className={`h-10 px-6 rounded-xl font-bold uppercase tracking-widest text-[10px] ${isPaused ? 'bg-orange-500 hover:bg-orange-600' : 'border-slate-200 hover:bg-slate-50'}`}
                onClick={() => togglePause(!isPaused)}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
            </div>

            {/* Delete Option */}
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-red-100">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-red-800">Delete This Mess</p>
                <p className="text-[10px] text-red-600/60 font-medium max-w-[200px]">Permanently remove all data, members, and history.</p>
              </div>
              <Button 
                variant="destructive"
                className="h-10 px-6 rounded-xl font-bold uppercase tracking-widest text-[10px]"
                onClick={() => setShowDeleteDialog(true)}
              >
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-[90vw] rounded-[2rem] sm:max-w-md border-red-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-6 h-6" />
              Final Warning
            </DialogTitle>
            <DialogDescription className="space-y-4 pt-4">
              <div className="p-4 bg-red-50 rounded-2xl border border-red-100 text-sm text-red-900 leading-relaxed">
                You are about to <strong>permanently delete</strong> the mess <span className="font-black">&quot;{messInfo?.name}&quot;</span>.
                <ul className="mt-3 space-y-2 list-disc list-inside font-medium text-xs opacity-80">
                  <li>All member profiles will be unlinked.</li>
                  <li>Meal history and bazaar logs will be purged.</li>
                  <li>This action cannot be undone.</li>
                </ul>
              </div>
              <p className="text-xs font-bold text-slate-500 text-center uppercase tracking-widest">Are you absolutely sure?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end mt-4">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)} className="flex-1 sm:flex-none font-bold rounded-xl">
              Keep Mess
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteMess} 
              disabled={deleting}
              className="flex-1 sm:flex-none font-bold rounded-xl shadow-lg shadow-red-500/20"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-[90vw] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              Confirm Handover?
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>You are about to transfer the manager role to <strong>{selectedMember?.full_name}</strong>.</p>
              <div className="bg-red-50 p-3 rounded-xl border border-red-100 text-xs text-red-800 space-y-2">
                <p className="flex items-start gap-2">
                  <Check className="w-3 h-3 mt-0.5 shrink-0" />
                  You will become a regular member.
                </p>
                <p className="flex items-start gap-2">
                  <Check className="w-3 h-3 mt-0.5 shrink-0" />
                  {selectedMember?.full_name}&apos;s UPI & QR will become the new payment destination.
                </p>
                <p className="flex items-start gap-2 font-bold underline text-red-600">
                  <X className="w-3 h-3 mt-0.5 shrink-0" />
                  This action is permanent and irreversible.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="ghost" onClick={() => setShowConfirm(false)} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleTransfer} 
              disabled={transferring}
              className="flex-1 sm:flex-none font-bold"
            >
              {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Transfer Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  )
}
