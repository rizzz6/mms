'use server'

import { createClient } from '@/utils/supabase/server'

// Helper to verify authenticated approved profile
async function verifyApprovedUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, mess_id, status, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status !== 'approved' || !profile.mess_id) {
    throw new Error('Unauthorized. Approved members only.')
  }

  return { user, profile }
}

// Helper to verify manager
async function verifyManager(allowCoManager = false) {
  const { user, profile } = await verifyApprovedUser()
  const allowedRoles = allowCoManager ? ['manager', 'co_manager'] : ['manager']
  if (!allowedRoles.includes(profile.role)) {
    throw new Error('Unauthorized. Access restricted.')
  }
  return { user, profile }
}

// 1. Smart Text Description Parser
export interface ParsedItem {
  name: string
  quantity: number
  unit: string
  price: number
}

export async function parseDescriptionItems(description: string): Promise<ParsedItem[]> {
  if (!description) return []

  const parsedItems: ParsedItem[] = []
  // Split items by commas or semicolons
  const parts = description.split(/[,;]+/)

  // Pattern: [Item Name] [Quantity] [Unit] [Price]
  // Matches: "oil 2L 100", "rice 5kg 300", "dal 1.5 kg 150", "potatoes 10 kg 200"
  const regex = /([a-zA-Z\s]+)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(\d+(?:\.\d+)?)/

  parts.forEach(part => {
    const trimmed = part.trim()
    const match = trimmed.match(regex)
    if (match) {
      const nameRaw = match[1].trim()
      const quantity = parseFloat(match[2])
      const unit = (match[3] || 'kg').trim()
      const price = parseFloat(match[4])

      // Clean item name (capitalize first letter)
      const name = nameRaw.charAt(0).toUpperCase() + nameRaw.slice(1).toLowerCase()

      if (name && !isNaN(quantity) && !isNaN(price)) {
        parsedItems.push({ name, quantity, unit, price })
      }
    }
  })

  return parsedItems
}

// Helper function to count total meals consumed by members & guests in a date range
async function countTotalMealsInInterval(messId: string, startDateStr: string, endDateStr: string): Promise<number> {
  const { createClient: createAdminClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Fetch profiles, overrides, guests, mess created date
  const [
    { data: members },
    { data: mealOverrides },
    { count: guestMealsCount },
    { data: messData }
  ] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, joined_at').eq('mess_id', messId).eq('status', 'approved'),
    supabaseAdmin.from('meals').select('*').eq('mess_id', messId).eq('is_guest', false).gte('date', startDateStr).lte('date', endDateStr),
    supabaseAdmin.from('meals').select('*', { count: 'exact', head: true }).eq('mess_id', messId).eq('is_guest', true).gte('date', startDateStr).lte('date', endDateStr),
    supabaseAdmin.from('messes').select('created_at').eq('id', messId).single()
  ])

  const overrideMap: Record<string, string> = {}
  mealOverrides?.forEach(m => {
    overrideMap[`${m.user_id}-${m.date}-${m.type}`] = m.status
  })

  const messCreatedDate = messData ? new Date(messData.created_at).toISOString().split('T')[0] : null
  let totalMeals = 0

  const start = new Date(startDateStr)
  const end = new Date(endDateStr)
  const current = new Date(start)

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]

    members?.forEach(m => {
      const joinedDate = new Date(m.joined_at).toISOString().split('T')[0]

      ;(['lunch', 'dinner'] as const).forEach(type => {
        const key = `${m.id}-${dateStr}-${type}`
        if (overrideMap[key]) {
          if (overrideMap[key] === 'eating') {
            totalMeals++
          }
        } else {
          const isBeforeJoin = dateStr < joinedDate
          const isBeforeMess = messCreatedDate && dateStr < messCreatedDate
          if (!isBeforeJoin && !isBeforeMess) {
            totalMeals++
          }
        }
      })
    })

    current.setDate(current.getDate() + 1)
  }

  const guestMeals = guestMealsCount || 0
  return totalMeals + guestMeals
}

// 2. Fetch inventory items with predictive analytics
export async function getInventoryItemsWithPredictions() {
  try {
    const { profile } = await verifyApprovedUser()
    const supabase = await createClient()

    // Fetch items
    const { data: items, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('mess_id', profile.mess_id)
      .order('item_name', { ascending: true })

    if (error) throw error

    // Fetch active meal rate for the last 7 days to know current usage speed (meals/day)
    const today = new Date()
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(today.getDate() - 6)

    const activeMealsLastWeek = await countTotalMealsInInterval(
      profile.mess_id,
      sevenDaysAgo.toISOString().split('T')[0],
      today.toISOString().split('T')[0]
    )
    const currentMealsPerDay = Math.max(1, activeMealsLastWeek / 7)

    // Fetch predictive data
    const itemsWithPredictions = await Promise.all((items || []).map(async (item) => {
      const { data: logs } = await supabase
        .from('inventory_logs')
        .select('*')
        .eq('item_id', item.id)
        .order('recorded_at', { ascending: true })

      if (!logs || logs.length === 0) {
        return { 
          ...item, 
          prediction: {
            status: 'no_logs',
            message: 'No purchase logs recorded yet.'
          } 
        }
      }

      // Filter empty stock reset events
      const resetLogs = logs.filter(l => l.log_type === 'empty_reset')

      if (resetLogs.length === 0) {
        return {
          ...item,
          prediction: {
            status: 'insufficient_data',
            message: 'Awaiting first "Empty Bin" click to calibrate usage speed.'
          }
        }
      }

      // Compute consumption rates over completed batches based on meals eaten!
      let totalPurchased = 0
      let totalMealsConsumedInCompletedBatches = 0

      // First batch: from start of tracking to the first stock depletion reset
      const startOfLogsStr = new Date(logs[0].recorded_at).toISOString().split('T')[0]
      const firstResetStr = new Date(resetLogs[0].recorded_at).toISOString().split('T')[0]

      const firstBatchPurchases = logs
        .filter(l => l.log_type === 'purchase' && new Date(l.recorded_at).getTime() <= new Date(resetLogs[0].recorded_at).getTime())
        .reduce((sum, l) => sum + Number(l.quantity_changed), 0)

      const firstBatchMeals = await countTotalMealsInInterval(profile.mess_id, startOfLogsStr, firstResetStr)

      totalPurchased += firstBatchPurchases
      totalMealsConsumedInCompletedBatches += Math.max(1, firstBatchMeals)

      // Subsequent batches (between consecutive stock reset logs)
      for (let i = 1; i < resetLogs.length; i++) {
        const prevResetStr = new Date(resetLogs[i - 1].recorded_at).toISOString().split('T')[0]
        const currResetStr = new Date(resetLogs[i].recorded_at).toISOString().split('T')[0]

        const batchPurchases = logs
          .filter(l => l.log_type === 'purchase' && 
                       new Date(l.recorded_at).getTime() > new Date(resetLogs[i - 1].recorded_at).getTime() && 
                       new Date(l.recorded_at).getTime() <= new Date(resetLogs[i].recorded_at).getTime())
          .reduce((sum, l) => sum + Number(l.quantity_changed), 0)

        const batchMeals = await countTotalMealsInInterval(profile.mess_id, prevResetStr, currResetStr)

        totalPurchased += batchPurchases
        totalMealsConsumedInCompletedBatches += Math.max(1, batchMeals)
      }

      // Average consumption quantity per single meal eaten in the mess
      const quantityPerMeal = totalPurchased / totalMealsConsumedInCompletedBatches

      if (quantityPerMeal <= 0) {
        return {
          ...item,
          prediction: {
            status: 'calibration_error',
            message: 'Calibration failed: no historical purchases.'
          }
        }
      }

      const currentStock = Number(item.current_stock)
      if (currentStock <= 0) {
        return {
          ...item,
          prediction: {
            status: 'empty',
            daysRemaining: 0,
            message: 'Empty pantry stock. Record restocks.'
          }
        }
      }

      // Estimate runout using current roster meals/day
      const predictedMealsRemaining = currentStock / quantityPerMeal
      const daysRemaining = predictedMealsRemaining / currentMealsPerDay
      const runoutDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000)

      const dailyRateEstimate = quantityPerMeal * currentMealsPerDay

      return {
        ...item,
        prediction: {
          status: 'calculated',
          daysRemaining: Math.round(daysRemaining),
          runoutDate: runoutDate.toISOString().split('T')[0],
          dailyRate: dailyRateEstimate.toFixed(2),
          message: `Est. usage: ~${dailyRateEstimate.toFixed(1)} ${item.unit}/day (based on ${currentMealsPerDay.toFixed(1)} meals/day active). Out in ~${Math.round(daysRemaining)} days (${runoutDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}).`
        }
      }
    }))

    return { success: true, items: itemsWithPredictions }
  } catch (error: any) {
    console.error('Error fetching inventory:', error)
    return { success: false, error: error.message }
  }
}



// 3. Add a custom inventory item
export async function addCustomInventoryItem(name: string, category: string, unit: string, threshold: number) {
  try {
    const { profile } = await verifyApprovedUser()
    const supabase = await createClient()

    const cleanedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase()

    const { data: item, error } = await supabase
      .from('inventory_items')
      .upsert({
        mess_id: profile.mess_id,
        item_name: cleanedName,
        category: category || 'Staple',
        unit: unit || 'kg',
        low_stock_threshold: threshold || 2
      }, { onConflict: 'mess_id,item_name' })
      .select()
      .single()

    if (error) throw error
    return { success: true, item }
  } catch (error: any) {
    console.error('Error creating custom item:', error)
    return { success: false, error: error.message }
  }
}

// 4. Record restock purchase log
export async function restockInventoryItem(itemId: string, quantity: number) {
  try {
    const { user } = await verifyApprovedUser()
    const supabase = await createClient()

    if (quantity <= 0) {
      return { success: false, error: 'Restock quantity must be positive' }
    }

    // Get current item stock
    const { data: item } = await supabase
      .from('inventory_items')
      .select('current_stock')
      .eq('id', itemId)
      .single()

    if (!item) throw new Error('Item not found')

    const newStock = Number(item.current_stock) + quantity

    // 1. Update stock
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ current_stock: newStock })
      .eq('id', itemId)

    if (updateError) throw updateError

    // 2. Log transaction
    const { error: logError } = await supabase
      .from('inventory_logs')
      .insert({
        item_id: itemId,
        log_type: 'purchase',
        quantity_changed: quantity,
        recorded_by: user.id
      })

    if (logError) throw logError

    return { success: true }
  } catch (error: any) {
    console.error('Error restocking item:', error)
    return { success: false, error: error.message }
  }
}

// 5. Manager stock empty reset hit
export async function markInventoryItemEmpty(itemId: string) {
  try {
    const { user } = await verifyManager(true)
    const supabase = await createClient()

    // Get current stock
    const { data: item } = await supabase
      .from('inventory_items')
      .select('current_stock')
      .eq('id', itemId)
      .single()

    if (!item) throw new Error('Item not found')

    const currentQty = Number(item.current_stock)

    // 1. Update stock to 0
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ current_stock: 0 })
      .eq('id', itemId)

    if (updateError) throw updateError

    // 2. Log adjustment transaction
    const { error: logError } = await supabase
      .from('inventory_logs')
      .insert({
        item_id: itemId,
        log_type: 'empty_reset',
        quantity_changed: -currentQty,
        recorded_by: user.id
      })

    if (logError) throw logError

    return { success: true }
  } catch (error: any) {
    console.error('Error emptying item stock:', error)
    return { success: false, error: error.message }
  }
}
