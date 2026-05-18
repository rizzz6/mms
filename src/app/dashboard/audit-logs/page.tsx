'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, ChevronRight, RotateCcw, ShieldCheck, Info, IndianRupee } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// --- Types ---
interface AuditLog {
  id: string
  mess_id: string
  manager_id: string
  action_type: string
  target_user_id: string | null
  old_data: Record<string, any> | null
  new_data: Record<string, any> | null
  created_at: string
  profiles?: { full_name: string } | null
  target_profile?: { full_name: string } | null
}

export default function AuditLogsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [revertingId, setRevertingId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'payments' | 'meals' | 'settings'>('all')
  const [retentionDays, setRetentionDays] = useState('90')
  const [confirmRevertLog, setConfirmRevertLog] = useState<AuditLog | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 1. Get user profile and mess ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('mess_id, role')
        .eq('id', user.id)
        .single()

      if (!profile?.mess_id) return

      if (profile.role !== 'manager' && profile.role !== 'co_manager') {
        toast.error('Unauthorized access.')
        router.push('/dashboard')
        return
      }

      // 2. Fetch Retention Days
      const { data: config } = await supabase
        .from('mess_config')
        .select('value')
        .eq('mess_id', profile.mess_id)
        .eq('key', 'audit_log_retention_days')
        .maybeSingle()

      if (config) {
        setRetentionDays(config.value || '90')
      }

      // 3. Fetch Audit Logs with joins
      const { data: auditLogs, error } = await supabase
        .from('audit_logs')
        .select('*, profiles!manager_id(full_name)')
        .eq('mess_id', profile.mess_id)
        .order('created_at', { ascending: false })

      if (error) throw error

      // 4. Resolve names of target users manually or in batch (Since Supabase multiple joins on same table is complex)
      const targetUserIds = auditLogs
        .map(l => l.target_user_id)
        .filter((id): id is string => !!id)

      const uniqueTargetIds = Array.from(new Set(targetUserIds))
      
      const targetProfilesMap: Record<string, string> = {}
      if (uniqueTargetIds.length > 0) {
        const { data: targets } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uniqueTargetIds)
        
        targets?.forEach(t => {
          targetProfilesMap[t.id] = t.full_name
        })
      }

      const formattedLogs: AuditLog[] = (auditLogs || []).map(l => ({
        ...l,
        target_profile: l.target_user_id ? { full_name: targetProfilesMap[l.target_user_id] || 'Unknown Member' } : null
      }))

      setLogs(formattedLogs)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load logs')
    } finally {
      setLoading(false)
    }
  }, [supabase, router])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleRevertAction = async (log: AuditLog) => {
    setConfirmRevertLog(null)
    setRevertingId(log.id)
    try {
      const { error } = await supabase.rpc('revert_audit_log', {
        log_id: log.id
      })

      if (error) throw error

      toast.success('Action successfully reverted!')
      fetchLogs()
    } catch (err: any) {
      toast.error(err.message || 'Failed to revert action')
    } finally {
      setRevertingId(null)
    }
  }

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'payment_approved': return 'Approved Payment'
      case 'payment_rejected': return 'Rejected Payment'
      case 'meal_override_insert': return 'Added Meal Override'
      case 'meal_override_update': return 'Toggled Meal Status'
      case 'meal_override_delete': return 'Removed Meal Override'
      case 'setting_changed': return 'Changed Mess Setting'
      default: return type
    }
  }

  const getActionColor = (type: string) => {
    if (type.includes('payment_approved')) return 'bg-green-500'
    if (type.includes('payment_rejected')) return 'bg-red-500'
    if (type.includes('meal_override')) return 'bg-amber-500'
    if (type.includes('setting')) return 'bg-indigo-500'
    return 'bg-slate-500'
  }

  // Filter logs based on category
  const filteredLogs = logs.filter(log => {
    if (filterType === 'all') return true
    if (filterType === 'payments') return log.action_type.includes('payment')
    if (filterType === 'meals') return log.action_type.includes('meal')
    if (filterType === 'settings') return log.action_type.includes('setting')
    return true
  })

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
          <Badge className="bg-indigo-50 hover:bg-indigo-50 text-indigo-600 font-bold border border-indigo-100 flex gap-1 rounded-full px-3 py-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Retaining logs for {retentionDays} days</span>
          </Badge>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Audit Trail</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Manager Logs</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">
        {/* Category Toggles */}
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
          {(['all', 'payments', 'meals', 'settings'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
                filterType === type ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-[1.02]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading audit history...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-[2rem] border border-dashed border-slate-200">
            <ShieldCheck className="w-12 h-12 mx-auto text-slate-200 mb-4" />
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">No logs found in this category</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLogs.map(log => (
              <Card key={log.id} className="border-0 shadow-lg shadow-slate-200/50 rounded-[2rem] overflow-hidden">
                <div className="p-6 space-y-4">
                  {/* Header: Manager details and timestamp */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black">
                        {log.profiles?.full_name.charAt(0) || 'M'}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">{log.profiles?.full_name || 'Manager'}</p>
                        <p className="text-[9px] font-bold text-slate-400">
                          {new Intl.DateTimeFormat('en-IN', { 
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
                          }).format(new Date(log.created_at))}
                        </p>
                      </div>
                    </div>
                    <Badge className={`${getActionColor(log.action_type)} text-white font-black text-[9px] border-0 rounded-lg px-2`}>
                      {getActionLabel(log.action_type)}
                    </Badge>
                  </div>

                  {/* Diff / Details Panel */}
                  <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 space-y-3">
                    {/* Payments */}
                    {log.action_type.includes('payment') && log.new_data && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-500">Member:</span>
                          <span className="font-black text-slate-700">{log.target_profile?.full_name}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-500">Amount:</span>
                          <span className="font-black text-emerald-600 flex items-center gap-0.5">
                            <IndianRupee className="w-3 h-3" /> {log.new_data.amount}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-500">Status Change:</span>
                          <span className="flex items-center gap-1 font-black">
                            <span className="text-red-500 line-through">{log.old_data?.status}</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-emerald-600">{log.new_data.status}</span>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Meal Overrides */}
                    {log.action_type.includes('meal_override') && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-500">Member Affected:</span>
                          <span className="font-black text-slate-700">{log.target_profile?.full_name}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-500">Meal Date & Type:</span>
                          <span className="font-black text-slate-700">
                            {new Date(log.old_data?.date || log.new_data?.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • <span className="uppercase text-[9px]">{log.old_data?.type || log.new_data?.type}</span>
                          </span>
                        </div>
                        {log.action_type === 'meal_override_update' && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-500">Meal Status:</span>
                            <span className="flex items-center gap-1 font-black">
                              <span className="text-red-500 uppercase">{log.old_data?.status}</span>
                              <span className="text-slate-400">→</span>
                              <span className="text-emerald-600 uppercase">{log.new_data?.status}</span>
                            </span>
                          </div>
                        )}
                        {log.action_type === 'meal_override_insert' && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-500">Action:</span>
                            <span className="text-emerald-600 font-black uppercase">Set eating to &quot;{log.new_data?.status}&quot;</span>
                          </div>
                        )}
                        {log.action_type === 'meal_override_delete' && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-500">Action:</span>
                            <span className="text-red-500 font-black uppercase">Deleted meal setting (was {log.old_data?.status})</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Settings */}
                    {log.action_type.includes('setting') && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-500 font-mono">Setting Key:</span>
                          <Badge variant="outline" className="font-mono text-[9px] bg-white border-slate-200">
                            {log.old_data?.key || log.new_data?.key}
                          </Badge>
                        </div>
                        <div className="space-y-1 pt-1">
                          <span className="font-bold text-slate-500 text-[10px] block">Value Diff:</span>
                          <div className="grid grid-cols-2 gap-2 text-xs font-mono p-2 bg-white rounded-xl border border-slate-100">
                            <div className="text-red-500 border-r border-slate-100 pr-1 truncate" title={log.old_data?.value}>
                              - {log.old_data?.value || '(NULL)'}
                            </div>
                            <div className="text-emerald-600 pl-1 truncate" title={log.new_data?.value}>
                              + {log.new_data?.value}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Revert Button */}
                  <Button
                    variant="outline"
                    className="w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 bg-white hover:bg-slate-50 text-indigo-600 border-indigo-100 hover:border-indigo-200 active:scale-95 transition-all shadow-sm shadow-indigo-50/50"
                    onClick={() => setConfirmRevertLog(log)}
                    disabled={revertingId === log.id}
                  >
                    {revertingId === log.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    Revert Manager Action
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Revert Dialog */}
      <Dialog open={!!confirmRevertLog} onOpenChange={(open) => !open && setConfirmRevertLog(null)}>
        <DialogContent className="max-w-[90vw] rounded-[2rem] sm:max-w-md border-0 shadow-2xl">
          <DialogHeader className="flex flex-col items-center text-center space-y-4">
            <div className="bg-indigo-50 p-4 rounded-full text-indigo-600 border border-indigo-100 animate-bounce">
              <RotateCcw className="w-8 h-8" />
            </div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-slate-800">
              Confirm Revert?
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-slate-500 leading-relaxed px-2">
              Are you sure you want to completely undo this manager action? The database state will be restored exactly as it was beforehand.
            </DialogDescription>
          </DialogHeader>

          {confirmRevertLog && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="font-bold text-slate-400">Action:</span>
                <span className="font-black text-slate-700">{getActionLabel(confirmRevertLog.action_type)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-400">By Manager:</span>
                <span className="font-black text-slate-700">{confirmRevertLog.profiles?.full_name}</span>
              </div>
              {confirmRevertLog.target_profile && (
                <div className="flex justify-between">
                  <span className="font-bold text-slate-400">Affected Member:</span>
                  <span className="font-black text-slate-700">{confirmRevertLog.target_profile.full_name}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-row gap-3 mt-4">
            <Button 
              variant="ghost" 
              className="flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400"
              onClick={() => setConfirmRevertLog(null)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-[2] h-12 rounded-xl text-[10px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 active:scale-95 transition-all"
              onClick={() => confirmRevertLog && handleRevertAction(confirmRevertLog)}
            >
              Confirm Revert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
