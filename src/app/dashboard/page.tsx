import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { LogOut, User, CreditCard, Settings, UtensilsCrossed, ChevronRight, CheckCircle2, Calendar, TrendingUp, Utensils, Users, Receipt, TriangleAlert, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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

  // Fetch data for calculations
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { data: configRows },
    { count: memberMealCount },
    { count: guestMealCount },
    { data: bazarData },
    { count: pendingCountResult }
  ] = await Promise.all([
    supabase.from('mess_config').select('key, value'),
    supabase.from('meals').select('*', { count: 'exact', head: true }).eq('status', 'eating').eq('is_guest', false).gte('date', monthStart),
    supabase.from('meals').select('*', { count: 'exact', head: true }).eq('is_guest', true).gte('date', monthStart),
    supabase.from('bazar_logs').select('amount').eq('verified', true).gte('date', monthStart),
    profile?.role === 'manager' 
      ? supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      : Promise.resolve({ count: 0 })
  ])

  // Process Config
  const config: Record<string, string> = {}
  configRows?.forEach(row => config[row.key] = row.value)
  const guestMealRate = Number(config['guest_meal_rate'] || 60)
  
  // Process Bazar
  const totalExpense = bazarData?.reduce((sum, r) => sum + Number(r.amount), 0) || 0
  
  // Calculate Meal Rate
  const guestContribution = (guestMealCount || 0) * guestMealRate
  const netExpense = totalExpense - guestContribution
  const mealRate = memberMealCount && memberMealCount > 0
    ? (netExpense / memberMealCount).toFixed(2)
    : '0.00'

  const pendingCount = pendingCountResult || 0

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="font-bold text-xl text-primary">MMS Dashboard</h1>
          <form action="/auth/signout" method="post">
            <Button variant="ghost" size="icon">
              <LogOut className="w-5 h-5 text-slate-500" />
            </Button>
          </form>
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

        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="bg-primary p-6 text-white">
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-white/20 p-2 rounded-full">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-white/80 text-xs uppercase tracking-wider font-semibold">Welcome back,</p>
                <h2 className="text-xl font-bold">{profile?.full_name}</h2>
              </div>
            </div>
            <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/20">
              <p className="text-white/80 text-sm">Current Balance</p>
              <h3 className="text-3xl font-black">₹{profile?.balance || 0}</h3>
            </div>
          </div>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-100 p-3 rounded-xl">
                <p className="text-[10px] uppercase font-bold text-slate-500">Role</p>
                <p className="font-semibold capitalize text-slate-700">{profile?.role}</p>
              </div>
              <div className="bg-slate-100 p-3 rounded-xl">
                <p className="text-[10px] uppercase font-bold text-slate-500">Status</p>
                <p className="font-semibold text-green-600 italic">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-3">
          <a href="/dashboard/meals">
            <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer bg-green-50/50">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                <div className="bg-green-100 p-3 rounded-2xl text-green-600">
                  <UtensilsCrossed className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700">Meal Toggle</p>
              </CardContent>
            </Card>
          </a>

          <a href="/dashboard/add-funds">
            <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
                  <CreditCard className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700">Add Funds</p>
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

              <a href="/dashboard/settings" className="col-span-2">
                <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer">
                  <CardContent className="p-3 px-6 flex items-center justify-between text-left space-x-4">
                    <div className="flex items-center space-x-4">
                      <div className="bg-orange-100 p-3 rounded-2xl text-orange-600">
                        <Settings className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">Manager Settings</p>
                        <p className="text-[10px] text-slate-500 font-medium">Update UPI & QR Details</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </CardContent>
                </Card>
              </a>
            </>
          )}

          <a href="/dashboard/roster" className="col-span-2">
            <Card className="border-0 shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer bg-slate-900 text-white">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-3 rounded-2xl">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Duty Roster</p>
                    <p className="text-[10px] text-white/50">Check Bazar & Water assignments</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-white/20" />
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
                <p className="text-lg font-bold text-slate-700">{memberMealCount || 0}</p>
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
