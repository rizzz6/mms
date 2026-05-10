'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, QrCode, Save, Upload, AlertTriangle, ArrowRightLeft, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function SettingsPage() {
  const [upiId, setUpiId] = useState('')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [guestRate, setGuestRate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  // Handover State
  const [members, setMembers] = useState<any[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [transferring, setTransferring] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function fetchProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [pRes, mRes, cRes] = await Promise.all([
        supabase.from('profiles').select('upi_id, qr_code_url, role').eq('id', user.id).single(),
        supabase.from('profiles').select('id, full_name').eq('role', 'member').order('joined_at', { ascending: true }),
        supabase.from('mess_config').select('key, value').eq('key', 'guest_meal_rate').single()
      ])

      if (pRes.data) {
        if (pRes.data.role !== 'manager') {
          window.location.href = '/dashboard'
          return
        }
        setUpiId(pRes.data.upi_id || '')
        setQrUrl(pRes.data.qr_code_url || null)
      }

      if (mRes.data) {
        setMembers(mRes.data)
      }

      if (cRes.data) {
        setGuestRate(cRes.data.value)
      }
      
      setLoading(false)
    }
    fetchProfile()
  }, [supabase])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

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
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const updates = [
        supabase.from('profiles').update({
          upi_id: upiId,
          qr_code_url: qrUrl
        }).eq('id', user.id),
        supabase.from('mess_config').upsert({
          key: 'guest_meal_rate',
          value: guestRate,
          description: 'Fixed charge per guest meal in INR'
        })
      ]

      const results = await Promise.all(updates)
      const error = results.find(r => r.error)?.error

      if (error) throw error
      toast.success('Settings saved successfully!')
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
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
    } catch (error: any) {
      toast.error(error.message)
      setTransferring(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const selectedMember = members.find(m => m.id === selectedMemberId)

  return (
    <div className="max-w-md mx-auto p-4 space-y-6 pb-20">
      <div className="flex items-center space-x-2">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          ← Back
        </Button>
        <h1 className="text-xl font-bold">Manager Settings</h1>
      </div>

      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Mess Configuration
          </CardTitle>
          <CardDescription>
            Update general mess settings and payment details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="upi">UPI ID</Label>
              <Input
                id="upi"
                placeholder="name@okaxis"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="h-11 bg-white"
              />
            </div>
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="g-rate">Guest Rate (₹)</Label>
              <Input
                id="g-rate"
                type="number"
                placeholder="60"
                value={guestRate}
                onChange={(e) => setGuestRate(e.target.value)}
                className="h-11 bg-white"
              />
            </div>
          </div>

          <div className="space-y-4">
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

          <Button 
            className="w-full h-11 font-bold shadow-md shadow-primary/20 bg-primary hover:bg-primary/90 text-white" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save All Settings
          </Button>
        </CardContent>
      </Card>

      {/* Handover Section */}
      <Card className="border-2 border-red-100 shadow-sm bg-red-50/30 overflow-hidden">
        <CardHeader className="bg-red-50">
          <CardTitle className="text-lg flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            Manager Handover
          </CardTitle>
          <CardDescription className="text-red-600/80">
            Permanently transfer your manager role to another member.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-manager" className="text-red-900">Select New Manager</Label>
            <select
              id="new-manager"
              className="w-full h-11 rounded-md border border-red-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
            variant="destructive"
            className="w-full h-11 font-bold shadow-md" 
            onClick={() => {
              if (!selectedMemberId) return toast.error('Please select a member first')
              setShowConfirm(true)
            }}
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Transfer Role
          </Button>
        </CardContent>
      </Card>

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
                  {selectedMember?.full_name}'s UPI & QR will become the new payment destination.
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
  )
}
