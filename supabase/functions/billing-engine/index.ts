import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Helper function to calculate billing statistics for a given month
async function calculateMonthStats(supabaseAdmin: any, messId: string, monthStr: string) {
  const year = parseInt(monthStr.split('-')[0])
  const month = parseInt(monthStr.split('-')[1])

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const todayStr = new Date().toISOString().split('T')[0]
  const calculationEndDate = monthEnd < todayStr ? monthEnd : todayStr

  // 1. Fetch data in parallel
  const [
    { data: configRows },
    { data: bazarData },
    { data: guestMealsData },
    { data: membersData },
    { data: messData },
    { data: penaltiesData }
  ] = await Promise.all([
    supabaseAdmin.from('mess_config').select('key, value').eq('mess_id', messId),
    supabaseAdmin.from('bazar_logs').select('amount').eq('mess_id', messId).eq('verified', true).gte('date', monthStart).lte('date', calculationEndDate),
    supabaseAdmin.from('meals').select('guest_price, guest_type').eq('mess_id', messId).eq('is_guest', true).gte('date', monthStart).lte('date', calculationEndDate),
    supabaseAdmin.from('profiles').select('id, full_name, joined_at, balance').eq('mess_id', messId).eq('status', 'approved').order('joined_at'),
    supabaseAdmin.from('messes').select('created_at').eq('id', messId).single(),
    supabaseAdmin.from('penalties').select('amount').eq('mess_id', messId).gte('created_at', monthStart + 'T00:00:00Z').lte('created_at', calculationEndDate + 'T23:59:59Z')
  ])

  // 2. Fetch meal overrides for approved members in this period
  const { data: mealOverrides } = await supabaseAdmin
    .from('meals')
    .select('*')
    .eq('mess_id', messId)
    .eq('is_guest', false)
    .gte('date', monthStart)
    .lte('date', calculationEndDate)

  const overrideMap: Record<string, string> = {}
  mealOverrides?.forEach((m: any) => {
    overrideMap[`${m.user_id}-${m.date}-${m.type}`] = m.status
  })

  // 3. Process Config & Rates
  const config: Record<string, string> = {}
  configRows?.forEach((row: any) => config[row.key] = row.value)
  const guestMealRate = Number(config['guest_meal_rate'] || 60)
  const finesEnabled = config['fines_enabled'] === 'true'

  // 4. Calculate total member meals eaten
  let totalMemberMeals = 0
  const memberMealsMap: Record<string, number> = {}
  const messCreatedDate = messData ? new Date(messData.created_at).toISOString().split('T')[0] : null

  // Initialize members map
  membersData?.forEach((m: any) => {
    memberMealsMap[m.id] = 0
  })

  // Loop through days from monthStart to calculationEndDate
  const start = new Date(monthStart)
  const end = new Date(calculationEndDate)
  const current = new Date(start)

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]

    membersData?.forEach((m: any) => {
      const joinedDate = new Date(m.joined_at).toISOString().split('T')[0]

      ;(['lunch', 'dinner'] as const).forEach(type => {
        const key = `${m.id}-${dateStr}-${type}`
        if (overrideMap[key]) {
          if (overrideMap[key] === 'eating') {
            memberMealsMap[m.id]++
            totalMemberMeals++
          }
        } else {
          // Default logic: eating if joined and mess was created
          const isBeforeJoin = dateStr < joinedDate
          const isBeforeMess = messCreatedDate && dateStr < messCreatedDate
          if (!isBeforeJoin && !isBeforeMess) {
            memberMealsMap[m.id]++
            totalMemberMeals++
          }
        }
      })
    })

    current.setDate(current.getDate() + 1)
  }

  // 5. Compute Bazar Expenses
  const totalFinesCollected = finesEnabled
    ? penaltiesData?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0
    : 0

  const totalExpense = bazarData?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) || 0
  const guestMeals = guestMealsData?.length || 0
  
  // Calculate total guest contribution summing up the locked guest_price values
  const guestContribution = guestMealsData?.reduce((sum: number, gm: any) => {
    const price = gm.guest_price !== null && gm.guest_price !== undefined
      ? Number(gm.guest_price)
      : guestMealRate
    return sum + price
  }, 0) || 0

  const netExpense = Math.max(0, totalExpense - guestContribution - totalFinesCollected)

  // 6. Compute Meal Rate
  const mealRate = totalMemberMeals > 0
    ? (netExpense / totalMemberMeals).toFixed(2)
    : '0.00'

  // 7. Calculate individual member bills
  const memberBills = (membersData || []).map((m: any) => {
    const mealsEaten = memberMealsMap[m.id] || 0
    const billAmount = Number((mealsEaten * Number(mealRate)).toFixed(2))
    return {
      user_id: m.id,
      full_name: m.full_name,
      meals_eaten: mealsEaten,
      bill_amount: billAmount,
      balance_before: m.balance,
      balance_after: Number((m.balance - billAmount).toFixed(2))
    }
  })

  return {
    monthStart,
    monthEnd,
    calculationEndDate,
    totalExpense,
    totalMemberMeals,
    totalGuestMeals: guestMeals,
    guestMealRate,
    netExpense,
    mealRate: Number(mealRate),
    memberBills,
    totalFinesCollected,
    finesEnabled,
    config
  }
}

// Action to preview or recalculate the billing cycle
async function previewBillingCycle(supabaseAdmin: any, messId: string, monthStr: string) {
  // Check if the month is already closed/billed
  const monthStart = `${monthStr}-01`
  const { data: existingCycle } = await supabaseAdmin
    .from('billing_cycles')
    .select('*')
    .eq('mess_id', messId)
    .eq('billing_month', monthStart)
    .single()

  if (existingCycle) {
    // If archived, fetch archived member bills
    const { data: archivedBills } = await supabaseAdmin
      .from('monthly_bills')
      .select('*, profiles(full_name)')
      .eq('billing_cycle_id', existingCycle.id)

    const formattedArchived = (archivedBills || []).map((ab: any) => ({
      user_id: ab.user_id,
      full_name: ab.profiles?.full_name || 'Unknown Member',
      meals_eaten: ab.meals_eaten,
      bill_amount: ab.bill_amount,
      balance_before: ab.balance_before,
      balance_after: ab.balance_after
    }))

    return {
      success: true,
      isClosed: true,
      stats: {
        monthStart: existingCycle.billing_month,
        totalExpense: Number(existingCycle.total_expense),
        totalMemberMeals: existingCycle.total_member_meals,
        totalGuestMeals: existingCycle.total_guest_meals,
        guestMealRate: Number(existingCycle.guest_meal_rate),
        mealRate: Number(existingCycle.meal_rate),
        memberBills: formattedArchived
      }
    }
  }

  // Live preview / Manual recalculation
  const stats = await calculateMonthStats(supabaseAdmin, messId, monthStr)
  return {
    success: true,
    isClosed: false,
    stats
  }
}

// Action to close and archive the billing cycle
async function closeBillingCycle(supabaseAdmin: any, messId: string, monthStr: string, userId: string) {
  const monthStart = `${monthStr}-01`
  
  // Double check if already closed
  const { data: existingCycle } = await supabaseAdmin
    .from('billing_cycles')
    .select('id')
    .eq('mess_id', messId)
    .eq('billing_month', monthStart)
    .single()

  if (existingCycle) {
    return { success: false, error: 'This month has already been billed.' }
  }

  // Perform live stats calculation
  const stats = await calculateMonthStats(supabaseAdmin, messId, monthStr)

  // Prepare JSON array for the PostgreSQL RPC
  const memberBillsRpc = stats.memberBills.map((mb: any) => ({
    user_id: mb.user_id,
    meals_eaten: mb.meals_eaten,
    bill_amount: mb.bill_amount
  }))

  const { error: rpcError } = await supabaseAdmin.rpc('close_billing_cycle', {
    p_mess_id: messId,
    p_month: monthStart,
    p_total_expense: stats.totalExpense,
    p_total_member_meals: stats.totalMemberMeals,
    p_total_guest_meals: stats.totalGuestMeals,
    p_guest_meal_rate: stats.guestMealRate,
    p_meal_rate: stats.mealRate,
    p_closed_by: userId,
    p_member_bills: memberBillsRpc
  })

  if (rpcError) {
    throw rpcError
  }

  // Assess Low Balance Penalty if enabled in config and member balance is below threshold
  if (stats.finesEnabled) {
    const minReqBalance = Number(stats.config?.['minimum_required_balance'] || 200)
    const penaltyLowBalance = Number(stats.config?.['penalty_low_balance'] || 100)

    for (const mb of stats.memberBills) {
      if (mb.balance_after < minReqBalance) {
        try {
          const formattedMonth = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(monthStart))
          
          // 1. Log penalty in system
          await supabaseAdmin
            .from('penalties')
            .insert({
              mess_id: messId,
              user_id: mb.user_id,
              amount: penaltyLowBalance,
              reason: 'low_balance',
              description: `System Assessed Low Balance Penalty for ${formattedMonth}`,
              issued_by: null
            })

          // 2. Subtract penalty from their balance in profiles
          await supabaseAdmin
            .from('profiles')
            .update({ balance: mb.balance_after - penaltyLowBalance })
            .eq('id', mb.user_id)
        } catch (penaltyErr) {
          console.error('Failed to log low balance penalty:', mb.user_id, penaltyErr)
        }
      }
    }
  }

  return { success: true, stats }
}

Deno.serve(async (req: Request) => {
  // CORS check
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    // Authenticate user with their user JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Get profile to check roles
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role, mess_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Unauthorized: Profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const allowedRoles = ["manager", "co_manager"]
    if (!allowedRoles.includes(profile.role) || !profile.mess_id) {
      return new Response(JSON.stringify({ error: "Forbidden: Managers or Co-Managers only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Initialize service role client for administrative mutations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const { action, monthStr } = body

    if (!action || !monthStr) {
      return new Response(JSON.stringify({ error: "Missing action or monthStr in request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const messId = profile.mess_id

    if (action === "preview") {
      const result = await previewBillingCycle(supabaseAdmin, messId, monthStr)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    } else if (action === "close") {
      const result = await closeBillingCycle(supabaseAdmin, messId, monthStr, user.id)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
