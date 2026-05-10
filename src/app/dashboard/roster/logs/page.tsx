import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { History, User, Calendar, Clock } from 'lucide-react'

export default async function RosterLogsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  if (profile?.role !== 'manager') {
    redirect('/dashboard')
  }

  const { data: logs } = await supabase
    .from('duty_roster_logs')
    .select('*, profiles!changed_by(full_name)')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div className="flex items-center space-x-2">
        <a href="/dashboard/roster">
          <Button variant="ghost" size="sm">
            ← Back
          </Button>
        </a>
        <h1 className="text-xl font-bold">Audit Log</h1>
      </div>

      <div className="space-y-3">
        {logs && logs.length > 0 ? (
          logs.map((log) => (
            <Card key={log.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-slate-100 p-1.5 rounded-full">
                      <User className="w-3 h-3 text-slate-500" />
                    </div>
                    <span className="text-xs font-bold text-slate-700">{log.profiles?.full_name}</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] uppercase border-red-100 text-red-600 bg-red-50">
                    {log.action}
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 mb-3 bg-slate-50 p-2 rounded-lg">
                  {log.note}
                </p>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(log.created_at))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-20 text-slate-400">
            <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No edit logs found</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Badge({ children, className, variant }: any) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
      {children}
    </span>
  )
}
