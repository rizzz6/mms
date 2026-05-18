import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { User, CreditCard, Settings, UtensilsCrossed, ChevronRight, CheckCircle2, TrendingUp, Utensils, Users, Receipt, TriangleAlert, AlertCircle, ShoppingBag, Megaphone, History, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { computeRoster, Member, DutyRecord } from '@/lib/roster-engine'
import { LogoutButton } from '@/components/LogoutButton'
import ActiveEngagementFeed from '@/components/ActiveEngagementFeed'
import ManagerCharts from '@/components/ManagerCharts'

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
  const todayDateStr = now.toISOString().split('T')[0]

  // Calculate 90 days ago for chart data
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const ninetyDaysAgoStart = ninetyDaysAgo.toISOString().split('T')[0]

  const [
    { data: configRows },
    { count: guestMealCount },
    { data: bazarData },
    { count: pendingCountResult },
    { data: membersData },
    { data: rosterData },
    { data: messData },
    { data: announcementsData },
    { data: menuData },
    { data: pollsData },
    { data: chartBazarLogs }
  ] = await Promise.all([
    supabase.from('mess_config').select('key, value').eq('mess_id', profile.mess_id),
    supabase.from('meals').select('*', { count: 'exact', head: true }).eq('mess_id', profile.mess_id).eq('is_guest', true).gte('date', monthStart),
    supabase.from('bazar_logs').select('amount').eq('mess_id', profile.mess_id).eq('verified', true).gte('date', monthStart),
    (profile?.role === 'manager' || profile?.role === 'co_manager') 
      ? supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('mess_id', profile.mess_id).eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
    supabase.from('profiles').select('id, full_name, joined_at, is_inactive, inactive_until, role').eq('mess_id', profile.mess_id).eq('status', 'approved').order('joined_at'),
    supabase.from('duty_roster').select('*').eq('mess_id', profile.mess_id).order('date'),
    supabase.from('messes').select('created_at').eq('id', profile.mess_id).single(),
    supabase.from('announcements').select('*').eq('mess_id', profile.mess_id).eq('pinned', true).order('created_at', { ascending: false }),
    supabase.from('daily_menus').select('*').eq('mess_id', profile.mess_id).eq('date', todayDateStr).maybeSingle(),
    supabase.from('polls').select('*, poll_options(*), poll_votes(*, profiles(full_name))').eq('mess_id', profile.mess_id).eq('is_closed', false).order('created_at', { ascending: false }),
    supabase.from('bazar_logs').select('amount, date').eq('mess_id', profile.mess_id).eq('verified', true).gte('date', ninetyDaysAgoStart)
  ])

  // Filter out expired polls in JS to ensure timezone reliability
  const activePolls = (pollsData || []).filter(p => {
    if (!p.expires_at) return true
    return new Date(p.expires_at) > new Date()
  })

  // Fetch explicit meal overrides for the last 90 days to populate both calculations and charts
  const { data: mealOverrides } = await supabase
    .from('meals')
    .select('*')
    .eq('mess_id', profile.mess_id)
    .eq('is_guest', false)
    .gte('date', ninetyDaysAgoStart)

  const overrideMap: Record<string, string> = {}
  mealOverrides?.forEach(m => {
    overrideMap[`${m.user_id}-${m.date}-${m.type}`] = m.status
  })

  // Fetch today's meals (members + guests) for confirmed eater stats
  const { data: todayMeals } = await supabase
    .from('meals')
    .select('*')
    .eq('mess_id', profile.mess_id)
    .eq('date', todayDateStr)

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
  const excludeManagers = configRows?.some(row => row.key === 'exclude_managers_from_duty' && row.value === 'true')
  const excludeCoManagers = configRows?.some(row => row.key === 'exclude_comanagers_from_duty' && row.value === 'true')
  const rosterMembers = (membersData || []).filter(m => {
    if (excludeManagers && m.role === 'manager') {
      return false
    }
    if (excludeCoManagers && m.role === 'co_manager') {
      return false
    }
    return true
  })

  const roster = computeRoster(
    (rosterMembers as Member[]) || [],
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

        {(() => {
          let confirmedLunchMembers = 0
          let confirmedDinnerMembers = 0

          membersData?.forEach(m => {
            if ((m as any).is_inactive) return
            const joinedDateStr = new Date(m.joined_at).toISOString().split('T')[0]
            
            // Lunch
            const lunchOverride = todayMeals?.find(me => me.user_id === m.id && me.type === 'lunch' && !me.is_guest)
            if (lunchOverride) {
              if (lunchOverride.status === 'eating') confirmedLunchMembers++
            } else {
              if (todayDateStr >= joinedDateStr) confirmedLunchMembers++
            }

            // Dinner
            const dinnerOverride = todayMeals?.find(me => me.user_id === m.id && me.type === 'dinner' && !me.is_guest)
            if (dinnerOverride) {
              if (dinnerOverride.status === 'eating') confirmedDinnerMembers++
            } else {
              if (todayDateStr >= joinedDateStr) confirmedDinnerMembers++
            }
          })

          const todayGuests = todayMeals?.filter(me => me.is_guest) || []
          const confirmedLunchGuests = todayGuests.filter(me => me.type === 'lunch')
          const confirmedDinnerGuests = todayGuests.filter(me => me.type === 'dinner')

          const isTodayShopper = todayDuty?.bazar?.member.id === profile.id && !todayDuty?.bazar?.isSkipped && !todayDuty?.bazar?.isCancelled
          const isManager = profile?.role === 'manager' || profile?.role === 'co_manager'

          if (!isTodayShopper && !isManager) return null

          return (
            <div className="space-y-4">
              {/* Shopper View Widget */}
              {isTodayShopper && (
                <Card className="border-0 shadow-lg bg-gradient-to-br from-[#6A2C70] to-[#B83B5E] text-white overflow-hidden rounded-[2rem]">
                  <div className="bg-white/5 p-4 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-[#F9ED69]" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-[#F9ED69]">Your Confirmed Eaters Sheet</h3>
                    </div>
                    <Badge className="bg-[#F08A5D] hover:bg-[#F08A5D]/90 text-white font-bold text-[9px] px-2 rounded-lg border-0">
                      Shopper View
                    </Badge>
                  </div>
                  <CardContent className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Lunch */}
                      <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1">
                        <p className="text-[9px] text-slate-200 font-bold uppercase tracking-widest leading-none">Lunch</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-xl font-black text-white">{confirmedLunchMembers + confirmedLunchGuests.length}</span>
                          <span className="text-[10px] text-slate-200">portions</span>
                        </div>
                        <p className="text-[9px] text-white/70 font-medium">
                          {confirmedLunchMembers} Members • {confirmedLunchGuests.length} Guests
                        </p>
                      </div>

                      {/* Dinner */}
                      <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1">
                        <p className="text-[9px] text-slate-200 font-bold uppercase tracking-widest leading-none">Dinner</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-xl font-black text-white">{confirmedDinnerMembers + confirmedDinnerGuests.length}</span>
                          <span className="text-[10px] text-slate-200">portions</span>
                        </div>
                        <p className="text-[9px] text-white/70 font-medium">
                          {confirmedDinnerMembers} Members • {confirmedDinnerGuests.length} Guests
                        </p>
                      </div>
                    </div>

                    {/* Guest breakdown details for the shopper */}
                    {todayGuests.length > 0 && (
                      <div className="bg-white/5 rounded-2xl p-3 border border-white/5 space-y-2">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Guest Items List</p>
                        <div className="divide-y divide-white/5 max-h-[120px] overflow-y-auto">
                          {todayGuests.map((g, idx) => (
                            <div key={idx} className="flex justify-between py-1.5 text-xs text-slate-200">
                              <span className="font-semibold">{g.guest_name || 'Guest'} <span className="text-[9px] text-slate-400 uppercase font-medium">({g.type})</span></span>
                              <span className="text-[#F9ED69] font-bold">{g.guest_type || 'Standard'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Dedicated Manager's Roster Count Widget */}
              {isManager && (
                <Card className="border-0 shadow-lg bg-gradient-to-br from-[#6A2C70] to-[#4D1C54] text-white overflow-hidden rounded-[2rem]">
                  <div className="bg-white/5 p-4 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Utensils className="w-4 h-4 text-[#F9ED69]" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-[#F9ED69]">Manager&apos;s Roster Count</h3>
                    </div>
                    <Badge className="bg-[#B83B5E] hover:bg-[#B83B5E]/90 text-white font-bold text-[9px] px-2 rounded-lg border-0">
                      Live Overview
                    </Badge>
                  </div>
                  <CardContent className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Lunch */}
                      <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1">
                        <p className="text-[9px] text-[#F9ED69] font-bold uppercase tracking-widest leading-none">Lunch Meals Today</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-xl font-black text-white">{confirmedLunchMembers + confirmedLunchGuests.length}</span>
                          <span className="text-[10px] text-white/70">portions</span>
                        </div>
                        <p className="text-[9px] text-[#FFA37C] font-semibold">
                          {confirmedLunchMembers} Members • {confirmedLunchGuests.length} Guests
                        </p>
                      </div>

                      {/* Dinner */}
                      <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1">
                        <p className="text-[9px] text-[#F9ED69] font-bold uppercase tracking-widest leading-none">Dinner Meals Today</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-xl font-black text-white">{confirmedDinnerMembers + confirmedDinnerGuests.length}</span>
                          <span className="text-[10px] text-white/70">portions</span>
                        </div>
                        <p className="text-[9px] text-[#FFA37C] font-semibold">
                          {confirmedDinnerMembers} Members • {confirmedDinnerGuests.length} Guests
                        </p>
                      </div>
                    </div>

                    {/* Shopper link info for the manager */}
                    <div className="text-[10px] text-white/80 font-medium bg-white/5 p-3 rounded-2xl border border-white/5 flex items-center justify-between">
                      <span>Today&apos;s Shopper: <strong className="text-white">{todayDuty?.bazar?.member.full_name || 'Unassigned'}</strong></span>
                      <a href="/dashboard/meals" className="text-[#F9ED69] hover:text-[#F9ED69]/80 font-bold uppercase tracking-wider text-[9px]">View Meals →</a>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )
        })()}

        {/* Bento Grid Profile & Wallet Overview */}
        <div className="grid grid-cols-3 gap-3">
          {/* Welcome Card (Wide 2-col) */}
          <Card className="col-span-2 border-0 shadow-lg bg-gradient-to-br from-[#6A2C70] to-[#4D1C54] text-white relative overflow-hidden rounded-[2rem] p-6 flex flex-col justify-between min-h-[140px]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
            <div className="relative z-10 space-y-1">
              <span className="text-white/60 text-[9px] uppercase font-black tracking-wider leading-none">Welcome Back</span>
              <h2 className="text-xl font-black tracking-tight leading-tight line-clamp-1">{profile?.full_name}</h2>
              <span className="inline-flex items-center gap-1.5 bg-white/10 text-white/90 text-[8px] font-black uppercase px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/10 mt-1">
                {profile?.role === 'co_manager' ? 'Co-Manager' : profile?.role === 'manager' ? 'Manager' : 'Member'}
              </span>
            </div>
            
            <div className="relative z-10 flex items-center gap-2 mt-4">
              <div className={`w-2.5 h-2.5 rounded-full ${profile?.is_inactive ? 'bg-[#F08A5D] shadow-[0_0_8px_rgba(240,138,93,0.8)]' : 'bg-[#F9ED69] animate-pulse shadow-[0_0_8px_rgba(249,237,105,0.8)]'}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                {profile?.is_inactive ? 'Absent Status' : 'Active & Eating'}
              </span>
            </div>
          </Card>

          {/* Wallet Balance (1-col) */}
          <Card className="col-span-1 border-0 shadow-lg bg-[#B83B5E] text-white relative overflow-hidden rounded-[2rem] p-4 flex flex-col justify-between min-h-[140px] text-left shadow-[#B83B5E]/20">
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/15 rounded-full blur-xl" />
            <div className="relative z-10">
              <p className="text-white/80 text-[8px] font-black uppercase tracking-wider leading-none">My Balance</p>
              <h3 className="text-xl font-black tracking-tight mt-1 leading-none">₹{profile?.balance || 0}</h3>
            </div>
            
            <a 
              href="/dashboard/funds" 
              className="relative z-10 w-full bg-white text-[#B83B5E] text-[9px] font-black uppercase text-center py-2 rounded-xl shadow-sm hover:shadow-md transition-all hover:bg-[#F9ED69] hover:text-[#6A2C70] active:scale-95 block mt-2"
            >
              Add Fund
            </a>
          </Card>
        </div>

        {/* Active Pinned Announcements, Culinary Menus, and Active Polls */}
        <ActiveEngagementFeed 
          announcements={announcementsData || []}
          menu={menuData || null}
          polls={activePolls || []}
          userId={user.id}
        />

        {/* Bento Grid Actions & Duties */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Today's Duties (Wide) */}
            <a href="/dashboard/roster" className="col-span-2">
              <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all active:scale-[0.99] cursor-pointer bg-gradient-to-r from-[#6A2C70]/5 to-[#B83B5E]/5 border border-[#6A2C70]/10">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-[#6A2C70]/10 p-3 rounded-2xl text-[#6A2C70]">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black uppercase tracking-wider text-slate-700">Today&apos;s Duty</p>
                        <Badge className="bg-[#F08A5D]/20 text-[#F08A5D] text-[8px] h-4 border-0 font-black">ACTIVE</Badge>
                      </div>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <p className="text-[11px] font-bold text-slate-500 truncate">
                          Bazaar: <span className="text-[#B83B5E] font-black">{todayDuty?.bazar?.member.full_name || 'Unassigned'}</span>
                        </p>
                        <p className="text-[11px] font-bold text-slate-500 truncate">
                          Water: <span className="text-[#6A2C70] font-black">{todayDuty?.water?.member.full_name || 'Unassigned'}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300" />
                </CardContent>
              </Card>
            </a>

            {/* Pantry Stock (Wide) */}
            <a href="/dashboard/inventory" className="col-span-2">
              <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all active:scale-[0.99] cursor-pointer bg-gradient-to-r from-[#F08A5D]/5 to-[#F9ED69]/5 border border-[#F08A5D]/10">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-[#F08A5D]/10 p-3 rounded-2xl text-[#F08A5D]">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">Pantry & Stock Inventory</p>
                      <p className="text-[10px] text-slate-500 font-medium">Track staples, oil & predictive runouts</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300" />
                </CardContent>
              </Card>
            </a>

            {/* Core Member Actions (1x1 Square Grid) */}
            <a href="/dashboard/meals" className="col-span-1">
              <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all active:scale-95 cursor-pointer bg-[#F9ED69]/5 border border-[#F9ED69]/20 h-[110px] flex flex-col justify-between p-4 text-left">
                <div className="bg-[#F9ED69]/20 p-2 w-fit rounded-xl text-[#6A2C70]">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-700">Meals</p>
                  <p className="text-[8px] text-slate-400 font-medium mt-0.5">Toggle meals</p>
                </div>
              </Card>
            </a>

            <a href="/dashboard/funds" className="col-span-1">
              <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all active:scale-95 cursor-pointer bg-[#F08A5D]/5 border border-[#F08A5D]/20 h-[110px] flex flex-col justify-between p-4 text-left">
                <div className="bg-[#F08A5D]/10 p-2 w-fit rounded-xl text-[#F08A5D]">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-700">Funds</p>
                  <p className="text-[8px] text-slate-400 font-medium mt-0.5">Add balance</p>
                </div>
              </Card>
            </a>

            <a href="/dashboard/bills" className="col-span-1">
              <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all active:scale-95 cursor-pointer bg-[#B83B5E]/5 border border-[#B83B5E]/20 h-[110px] flex flex-col justify-between p-4 text-left">
                <div className="bg-[#B83B5E]/10 p-2 w-fit rounded-xl text-[#B83B5E]">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-700">Bills</p>
                  <p className="text-[8px] text-slate-400 font-medium mt-0.5">Bills & reports</p>
                </div>
              </Card>
            </a>

            <a href="/dashboard/settings" className="col-span-1">
              <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all active:scale-95 cursor-pointer bg-[#6A2C70]/5 border border-[#6A2C70]/20 h-[110px] flex flex-col justify-between p-4 text-left">
                <div className="bg-[#6A2C70]/10 p-2 w-fit rounded-xl text-[#6A2C70]">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-700">Settings</p>
                  <p className="text-[8px] text-slate-400 font-medium mt-0.5">My profile</p>
                </div>
              </Card>
            </a>
          </div>

          {/* Dedicated Manager Admin Suite Accordion / Bento Section */}
          {(profile?.role === 'manager' || profile?.role === 'co_manager') && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Shield className="w-4 h-4 text-[#6A2C70]" />
                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Manager Admin Suite</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Approval Center (Wide) */}
                <a href="/dashboard/approvals" className="col-span-2">
                  <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all active:scale-[0.99] cursor-pointer bg-[#F08A5D] text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-8 -mt-8 blur-xl" />
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="bg-white/10 p-3 rounded-2xl text-white relative border border-white/10">
                          <CheckCircle2 className="w-6 h-6 text-[#F9ED69]" />
                          {pendingCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-[#6A2C70] text-white text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center border-2 border-[#F08A5D]">
                              {pendingCount}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">Approval Center</p>
                          <p className="text-[10px] text-white/80 font-medium">
                            {pendingCount > 0 ? `${pendingCount} verification items pending` : 'All items verified'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/60" />
                    </CardContent>
                  </Card>
                </a>

                {/* Mess Members */}
                <a href="/dashboard/members" className="col-span-1">
                  <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all active:scale-95 cursor-pointer bg-[#6A2C70]/5 h-[100px] flex flex-col justify-between p-4 text-left border border-[#6A2C70]/10">
                    <div className="bg-[#6A2C70]/10 p-2 w-fit rounded-xl text-[#6A2C70]">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-700">Members</p>
                      <p className="text-[8px] text-slate-400 font-medium mt-0.5">Roster & balances</p>
                    </div>
                  </Card>
                </a>

                {/* Mess Config */}
                <a href="/dashboard/mess-config" className="col-span-1">
                  <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all active:scale-95 cursor-pointer bg-[#F08A5D]/5 h-[100px] flex flex-col justify-between p-4 text-left border border-[#F08A5D]/10">
                    <div className="bg-[#F08A5D]/10 p-2 w-fit rounded-xl text-[#F08A5D]">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-700">Config</p>
                      <p className="text-[8px] text-slate-400 font-medium mt-0.5">Mess settings</p>
                    </div>
                  </Card>
                </a>

                {/* Billing Center */}
                <a href="/dashboard/billing" className="col-span-1">
                  <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all active:scale-95 cursor-pointer bg-[#B83B5E]/5 h-[100px] flex flex-col justify-between p-4 text-left border border-[#B83B5E]/10">
                    <div className="bg-[#B83B5E]/10 p-2 w-fit rounded-xl text-[#B83B5E]">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-700">Billing</p>
                      <p className="text-[8px] text-slate-400 font-medium mt-0.5">Monthly bills</p>
                    </div>
                  </Card>
                </a>

                {/* Audit Logs */}
                <a href="/dashboard/audit-logs" className="col-span-1">
                  <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all active:scale-95 cursor-pointer bg-[#F9ED69]/5 h-[100px] flex flex-col justify-between p-4 text-left border border-[#F9ED69]/25">
                    <div className="bg-[#F9ED69]/20 p-2 w-fit rounded-xl text-[#6A2C70]">
                      <History className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-700">Audits</p>
                      <p className="text-[8px] text-slate-400 font-medium mt-0.5">Logs</p>
                    </div>
                  </Card>
                </a>

                {/* Engagement Center (Wide) */}
                <a href="/dashboard/engagement" className="col-span-2">
                  <Card className="border-0 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all active:scale-[0.99] cursor-pointer bg-gradient-to-r from-[#6A2C70]/5 to-[#B83B5E]/5 border border-[#6A2C70]/10">
                    <CardContent className="p-3 px-6 flex items-center justify-between text-left space-x-4">
                      <div className="flex items-center space-x-4">
                        <div className="bg-[#6A2C70]/10 p-3 rounded-2xl text-[#6A2C70]">
                          <Megaphone className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">Engagement Center</p>
                          <p className="text-[10px] text-slate-500 font-medium">Post menus, notices & menu polls</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </CardContent>
                  </Card>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Manager Analytics Charts Section */}
        {(profile?.role === 'manager' || profile?.role === 'co_manager') && (
          <ManagerCharts 
            bazarLogs={chartBazarLogs || []}
            members={membersData || []}
            mealOverrides={mealOverrides || []}
            messCreatedDate={messCreatedDate}
          />
        )}

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
