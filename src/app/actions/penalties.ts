'use server'

import { createClient } from '@/utils/supabase/server'
import { sendNotificationToUser } from '@/app/actions/push'

// Helper to verify approved user and manager status
async function verifyManager(allowCoManager = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, mess_id, status, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status !== 'approved' || !profile.mess_id) {
    throw new Error('Unauthorized')
  }

  const allowedRoles = allowCoManager ? ['manager', 'co_manager'] : ['manager']
  if (!allowedRoles.includes(profile.role)) {
    throw new Error('Unauthorized. Access restricted.')
  }

  return { user, profile }
}

// 1. Issue a manual penalty
export async function issuePenalty(targetUserId: string, reason: 'skipped_duty' | 'low_balance' | 'custom', amount: number, description: string) {
  try {
    const { user, profile } = await verifyManager(true)
    const supabase = await createClient()

    if (amount <= 0) {
      return { success: false, error: 'Penalty amount must be greater than zero' }
    }

    // 1. Check if fines system is enabled in config
    const { data: config } = await supabase
      .from('mess_config')
      .select('value')
      .eq('mess_id', profile.mess_id)
      .eq('key', 'fines_enabled')
      .maybeSingle()

    const finesEnabled = config?.value === 'true'
    if (!finesEnabled) {
      return { success: false, error: 'Fine & Penalty system is currently disabled in configuration.' }
    }

    // 2. Fetch target user profile
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('balance, full_name')
      .eq('id', targetUserId)
      .eq('mess_id', profile.mess_id)
      .single()

    if (!targetProfile) throw new Error('Target member profile not found')

    // 3. Atomically update target user's balance
    const newBalance = Number(targetProfile.balance) - amount
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', targetUserId)

    if (balanceError) throw balanceError

    // 4. Log the penalty
    const { error: logError } = await supabase
      .from('penalties')
      .insert({
        mess_id: profile.mess_id,
        user_id: targetUserId,
        amount,
        reason,
        description: description || `Penalty issued for ${reason.replace('_', ' ')}`,
        issued_by: user.id
      })

    if (logError) throw logError

    // 5. Send push notification to target user
    try {
      await sendNotificationToUser(targetUserId, 'billing', {
        title: '⚠️ Penalty Logged',
        body: `A fine of ₹${amount} was deducted from your balance for ${reason.replace('_', ' ')}.`,
        url: '/dashboard/bills'
      })
    } catch (pushErr) {
      console.error('Failed to send penalty push notification:', pushErr)
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error issuing penalty:', error)
    return { success: false, error: error.message }
  }
}

// 2. Forgive/Waive a penalty
export async function forgivePenalty(penaltyId: string) {
  try {
    const { profile } = await verifyManager(true)
    const supabase = await createClient()

    // 1. Fetch penalty details
    const { data: penalty } = await supabase
      .from('penalties')
      .select('*')
      .eq('id', penaltyId)
      .eq('mess_id', profile.mess_id)
      .single()

    if (!penalty) throw new Error('Penalty record not found')

    // 2. Fetch target profile
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', penalty.user_id)
      .single()

    if (!targetProfile) throw new Error('Target profile not found')

    // 3. Add amount back to balance
    const refundedBalance = Number(targetProfile.balance) + Number(penalty.amount)
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ balance: refundedBalance })
      .eq('id', penalty.user_id)

    if (balanceError) throw balanceError

    // 4. Delete penalty log
    const { error: deleteError } = await supabase
      .from('penalties')
      .delete()
      .eq('id', penaltyId)

    if (deleteError) throw deleteError

    // 5. Send push notification
    try {
      await sendNotificationToUser(penalty.user_id, 'billing', {
        title: '✅ Penalty Waived/Refunded',
        body: `Your fine of ₹${penalty.amount} was refunded to your balance.`,
        url: '/dashboard/bills'
      })
    } catch (pushErr) {
      console.error('Failed to send refund push notification:', pushErr)
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error forgiving penalty:', error)
    return { success: false, error: error.message }
  }
}

// 3. Get user's penalties or all penalties (for manager audit trail)
export async function getPenalties(userId?: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('mess_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.mess_id) throw new Error('No mess associated')

    let query = supabase
      .from('penalties')
      .select('*, profiles!penalties_user_id_fkey(full_name), manager:profiles!penalties_issued_by_fkey(full_name)')
      .eq('mess_id', profile.mess_id)
      .order('created_at', { ascending: false })

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: penalties, error } = await query
    if (error) throw error

    const formattedPenalties = (penalties || []).map(p => ({
      ...p,
      full_name: (p.profiles as any)?.full_name || 'Unknown Member',
      manager_name: (p.manager as any)?.full_name || 'System Automated'
    }))

    return { success: true, penalties: formattedPenalties }
  } catch (error: any) {
    console.error('Error fetching penalties:', error)
    return { success: false, error: error.message }
  }
}
