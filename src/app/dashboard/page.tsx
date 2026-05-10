import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { User, CreditCard, Settings, UtensilsCrossed, ChevronRight, CheckCircle2, TrendingUp, Utensils, Users, Receipt, TriangleAlert, AlertCircle, ShoppingBag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { computeRoster, Member, DutyRecord } from '@/lib/roster-engine'
import { LogoutButton } from '@/components/LogoutButton'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.mess_id) {
    redirect('/onboarding')
  }

  // Handle Pending Approval State
  if (profile.status === 'pending') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center space-y-8">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          <div className="relative bg-white w-24 h-24 rounded-[2rem] shadow-2xl flex items-center justify-center text-primary border border-slate-100">
            <Users className="w-10 h-10" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Wait for Approval</h1>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest px-4">
            Hello {profile.full_name}, your request to join this mess is pending manager approval.
          </p>
        </div>

        <div className="w-full max-w-xs p-6 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 space-y-4">
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <AlertCircle className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-tight">
              Access is restricted until your role is verified.
            </p>
          </div>
          
          <form action="/auth/signout" method="post" className="w-full">
            <Button variant="ghost" className="w-full h-12 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-500 hover:bg-red-50" type="submit">
              Sign Out & Try Again
            </Button>
          </form>
        </div>

        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
          MMS - Secure Multi-Mess Platform
        </p>
      </div>
    )
  }

  // Fetch data for calculations (Filtered by mess_id)
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { data: configRows },
    { count: guestMealCount },
    { data: bazarData },
    { count: pendingCountResult },
    { data: membersData },
    { data: rosterData },
    { data: messData }
  ] = await Promise.all([
    supabase.from('mess_config').select('key, value').eq('mess_id', profile.mess_id),
    supabase.from('meals').select('*', { count: 'exact', head: true }).eq('mess_id', profile.mess_id).eq('is_guest', true).gte('date', monthStart),
    supabase.from('bazar_logs').select('amount').eq('mess_id', profile.mess_id).eq('verified', true).gte('date', monthStart),
    profile?.role === 'manager' 
      ? supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('mess_id', profile.mess_id).eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
    supabase.from('profiles').select('id, full_name, joined_at').eq('mess_id', profile.mess_id).eq('status', 'approved').order('joined_at'),
    supabase.from('duty_roster').select('*').eq('mess_id', profile.mess_id).order('date'),
    supabase.from('messes').select('created_at').eq('id', profile.mess_id).single()
  ])

  // Fetch explicit meal overrides
  const { data: mealOverrides } = await supabase
    .from('meals')
    .select('*')
    .eq('mess_id', profile.mess_id)
    .eq('is_guest', false)
    .gte('date', monthStart)

  const overrideMap: Record<string, string> = {}
  mealOverrides?.forEach(m => {
    overrideMap[`${m.user_id}-${m.date}-${m.type}`] = m.status
  })

  // Calculate total member meals accurately
  let totalMemberMeals = 0
  const messCreatedDate = messData ? new Date(messData.created_at).toISOString().split('T')[0] : null
  const today = new Date()
  
  // Iterate through each day from start of month to today
  const current = new Date(monthStart)
  while (current <= today) {
    const dateStr = current.toISOString().split('T')[0]
    
    membersData?.forEach(m => {
      const joinedDate = new Date(m.joined_at).toISOString().split('T')[0]
      
      // For each type (lunch, dinner)
      ;(['lunch', 'dinner'] as const).forEach(type => {
        const key = `${m.id}-${dateStr}-${type}`
        if (overrideMap[key]) {
          if (overrideMap[key] === 'eating') totalMemberMeals++
        } else {
          // Default logic
          const isBeforeJoin = dateStr < joinedDate
          const isBeforeMess = messCreatedDate && dateStr < messCreatedDate
          if (!isBeforeJoin && !isBeforeMess) {
            totalMemberMeals++
          }
        }
      })
    })
    current.setDate(current.getDate() + 1)
  }

  // Compute today's duty
  const roster = computeRoster(
    (membersData as Member[]) || [],
    (rosterData as DutyRecord[]) || [],
    today,
    1
  )
  const todayDuty = roster[0]

  // Process Config
  const config: Record<string, string> = {}
  configRows?.forEach(row => config[row.key] = row.value)
  const guestMealRate = Number(config['guest_meal_rate'] || 60)
  
  // Process Bazar
  const totalExpense = bazarData?.reduce((sum, r) => sum + Number(r.amount), 0) || 0
  
  // Calculate Meal Rate
  const guestContribution = (guestMealCount || 0) * guestMealRate
  const netExpense = totalExpense - guestContribution
  const mealRate = totalMemberMeals > 0
    ? (netExpense / totalMemberMeals).toFixed(2)
    : '0.00'

  const pendingCount = pendingCountResult || 0

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="font-bold text-xl text-primary">MMS Dashboard</h1>
          <div className="flex items-center gap-2">
            <a href="/dashboard/settings">
              <Button variant="ghost" size="icon">
                <Settings className="w-5 h-5 text-slate-500" />
              </Button>
            </a>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4 pb-10">
        {profile?.balance < 200 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 animate-pulse">
            <div className="bg-red-100 p-2 rounded-xl text-red-600">
              <TriangleAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-red-800">Balance Low!</p>
              <p className="text-[10px] text-red-600">Your current balance (₹{profile.balance}) is below ₹200. Top up soon.</p>
            </div>
          </div>
        )}

        <Card className="border-0 shadow-xl overflow-hidden bg-primary text-white relative rounded-[2.5rem]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/10 rounded-full -ml-24 -mb-24 blur-3xl" />
          
          <div className="p-8 relative z-10">
            <div className="flex items-center space-x-4 mb-8">
              <div className="bg-white/20 p-3 rounded-[1.5rem] backdrop-blur-md border border-white/30 shadow-inner">
                <User className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-white/60 text-[10px] uppercase font-black tracking-[0.2em] mb-0.5">Member Profile</p>
                <h2 className="text-2xl font-black tracking-tight">{profile?.full_name}</h2>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md border border-white/20 flex flex-col justify-center shadow-sm">
                <p className="text-white/60 text-[8px] font-black uppercase tracking-widest mb-1.5">Balance</p>
                <h3 className="text-base font-black tracking-tight leading-none">₹{profile?.balance || 0}</h3>
              </div>
              <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md border border-white/20 flex flex-col justify-center shadow-sm">
                <p className="text-white/60 text-[8px] font-black uppercase tracking-widest mb-1.5">Role</p>
                <h3 className="text-[10px] font-black uppercase tracking-tight leading-none truncate">{profile?.role}</h3>
              </div>
              <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md border border-white/20 flex flex-col justify-center shadow-sm">
                <p className="text-white/60 text-[8px] font-black uppercase tracking-widest mb-1.5">Status</p>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${profile?.is_inactive ? 'bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)]' : 'bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.8)]'}`} />
                  <h3 className="text-[10px] font-black uppercase tracking-tight leading-none">
                    {profile?.is_inactive ? 'Absent' : 'Active'}
                  </h3>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-3">
          <a href="/dashboard/roster" className="col-span-2">
            <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer bg-orange-50/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-orange-100 p-3 rounded-2xl text-orange-600">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black uppercase tracking-wider text-slate-700">Today&apos;s Duty</p>
                      <Badge className="bg-orange-200 text-orange-700 text-[8px] h-4 border-0 font-black">ACTIVE</Badge>
                    </div>
                    <div className="flex flex-col gap-0.5 mt-1">
                      <p className="text-[11px] font-bold text-slate-500 truncate">
                        Bazaar: <span className="text-orange-600">{todayDuty?.bazar?.member.full_name || 'Unassigned'}</span>
                      </p>
                      <p className="text-[11px] font-bold text-slate-500 truncate">
                        Water: <span className="text-blue-600">{todayDuty?.water?.member.full_name || 'Unassigned'}</span>
                      </p>
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300" />
              </CardContent>
            </Card>
          </a>

          <a href="/dashboard/meals">
            <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer bg-green-50/50">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                <div className="bg-green-100 p-3 rounded-2xl text-green-600">
                  <UtensilsCrossed className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700">Meals</p>
              </CardContent>
            </Card>
          </a>

          <a href="/dashboard/funds">
            <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer bg-blue-50/50">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
                  <CreditCard className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700">Funds</p>
              </CardContent>
            </Card>
          </a>

          {profile?.role === 'manager' && (
            <>
              <a href="/dashboard/approvals" className="col-span-2">
                <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer bg-amber-50/50">
                  <CardContent className="p-3 px-6 flex items-center justify-between text-left space-x-4">
                    <div className="flex items-center space-x-4">
                      <div className="bg-amber-100 p-3 rounded-2xl text-amber-600 relative">
                        <CheckCircle2 className="w-6 h-6" />
                        {pendingCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-white">
                            {pendingCount}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">Approval Center</p>
                        <p className="text-[10px] text-slate-500 font-medium">{pendingCount} items awaiting verification</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </CardContent>
                </Card>
              </a>

              <a href="/dashboard/members" className="col-span-2">
                <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer bg-indigo-50/50">
                  <CardContent className="p-3 px-6 flex items-center justify-between text-left space-x-4">
                    <div className="flex items-center space-x-4">
                      <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">Mess Members</p>
                        <p className="text-[10px] text-slate-500 font-medium">View balances & join dates</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </CardContent>
                </Card>
              </a>

              <a href="/dashboard/mess-config" className="col-span-2">
                <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer bg-emerald-50/50">
                  <CardContent className="p-3 px-6 flex items-center justify-between text-left space-x-4">
                    <div className="flex items-center space-x-4">
                      <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600">
                        <Settings className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">Mess Configuration</p>
                        <p className="text-[10px] text-slate-500 font-medium">UPI, guest prices & handover</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </CardContent>
                </Card>
              </a>
            </>
          )}

          <a href="/dashboard/settings" className="col-span-2">
            <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer bg-slate-50">
              <CardContent className="p-3 px-6 flex items-center justify-between text-left space-x-4">
                <div className="flex items-center space-x-4">
                  <div className="bg-slate-200 p-3 rounded-2xl text-slate-600">
                    <Settings className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">Account Settings</p>
                    <p className="text-[10px] text-slate-500 font-medium">Update profile, email & password</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </CardContent>
            </Card>
          </a>
        </div>

        {/* Mess Statistics Panel */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="p-4 pb-2 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Mess Statistics (This Month)
              </CardTitle>
              <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-wider">Estimated</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-2 divide-x divide-y border-b">
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-slate-500">
                  <Utensils className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-tight">Meal Rate</p>
                </div>
                <p className={`text-xl font-black ${Number(mealRate) > 50 ? 'text-red-600' : Number(mealRate) > 30 ? 'text-amber-600' : 'text-green-600'}`}>
                  ₹{mealRate}
                </p>
                <p className="text-[9px] text-slate-400 font-medium">per member meal</p>
              </div>
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-slate-500">
                  <Receipt className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-tight">Total Expense</p>
                </div>
                <p className="text-xl font-black text-slate-900">₹{totalExpense}</p>
                <p className="text-[9px] text-slate-400 font-medium">verified bazar logs</p>
              </div>
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-slate-500">
                  <Users className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-tight">Member Meals</p>
                </div>
                <p className="text-lg font-bold text-slate-700">{totalMemberMeals || 0}</p>
                <p className="text-[9px] text-slate-400 font-medium">eating status: ON</p>
              </div>
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-slate-500">
                  <User className="w-3.5 h-3.5" />
                  <p className="text-[10px] font-bold uppercase tracking-tight">Guest Meals</p>
                </div>
                <p className="text-lg font-bold text-slate-700">{guestMealCount || 0}</p>
                <p className="text-[9px] text-slate-400 font-medium">fixed rate: ₹{guestMealRate}</p>
              </div>
            </div>
            <div className="p-3 bg-slate-50 flex items-center justify-center">
              <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 italic">
                <AlertCircle className="w-3 h-3" />
                Calculated since {new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date())}
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
