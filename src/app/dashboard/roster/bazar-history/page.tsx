'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, ShoppingBag, Calendar, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface BazarLog {
  id: string
  amount: number
  items: string
  date: string
  verified: boolean
  shopper_id: string
  profiles: { full_name: string }
}

export default function BazarHistoryPage() {
  const router = useRouter()
  const supabase = createClient()

  const [logs, setLogs] = useState<BazarLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // const [userRole, setUserRole] = useState<string>('member')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push('/login')

      const { data: profile } = await supabase.from('profiles').select('role, mess_id').eq('id', user.id).single()
      if (!profile?.mess_id) return
      // setUserRole(profile.role || 'member')

      const { data: bzrs } = await supabase
        .from('bazar_logs')
        .select('*, profiles!shopper_id(full_name)')
        .eq('mess_id', profile.mess_id)
        .order('date', { ascending: false })

      setLogs((bzrs as BazarLog[]) || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [supabase, router])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const filteredLogs = logs.filter(log => 
    log.profiles.full_name.toLowerCase().includes(search.toLowerCase()) ||
    log.items.toLowerCase().includes(search.toLowerCase()) ||
    log.date.includes(search)
  )

  const totalSpent = filteredLogs.reduce((sum, log) => sum + log.amount, 0)

  return (
    <div className="max-w-md mx-auto p-4 space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            ← Back
          </Button>
          <h1 className="text-xl font-bold">Bazar History</h1>
        </div>
      </div>

      <Card className="bg-[#6A2C70] text-white border-0 shadow-lg overflow-hidden">
        <CardContent className="p-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-white/70 text-xs font-bold uppercase tracking-wider">Total Bazar Expense</p>
              <h2 className="text-3xl font-black mt-1">₹{totalSpent.toLocaleString()}</h2>
              <p className="text-[10px] text-white/50 mt-1 font-medium">{filteredLogs.length} entries shown</p>
            </div>
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
              <ShoppingBag className="w-8 h-8" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input 
          placeholder="Search items, members or dates..." 
          className="pl-10 h-11 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-[#6A2C70]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#6A2C70]" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No bazaar logs found</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <Card key={log.id} className="border-0 shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-700">{log.profiles.full_name}</span>
                        {log.verified ? (
                          <Badge className="bg-[#6A2C70]/10 text-[#6A2C70] hover:bg-[#6A2C70]/20 text-[8px] h-4 border-0">VERIFIED</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[8px] h-4 border-[#F08A5D]/20 text-[#F08A5D] bg-[#F08A5D]/5">PENDING</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[10px] font-bold">
                          {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(log.date))}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-[#6A2C70]">₹{log.amount}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {log.items}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
