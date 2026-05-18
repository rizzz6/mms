'use server'

import { createClient } from '@/utils/supabase/server'
import { sendNotificationToUser } from '@/app/actions/push'

// Action to preview or recalculate the billing cycle
export async function previewBillingCycle(monthStr: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const { data, error } = await supabase.functions.invoke('billing-engine', {
      body: { action: 'preview', monthStr }
    })

    if (error) {
      throw error
    }

    if (!data.success) {
      return { success: false, error: data.error || 'Failed to preview billing cycle' }
    }

    return data
  } catch (error: any) {
    console.error('Error previewing billing:', error)
    return { success: false, error: error.message }
  }
}

// Action to close and archive the billing cycle
export async function closeBillingCycle(monthStr: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  try {
    const { data, error } = await supabase.functions.invoke('billing-engine', {
      body: { action: 'close', monthStr }
    })

    if (error) {
      throw error
    }

    if (!data.success) {
      return { success: false, error: data.error || 'Failed to close billing cycle' }
    }

    const stats = data.stats
    const monthStart = `${monthStr}-01`

    // Send low balance push alerts in the background if fines are enabled
    if (stats.finesEnabled) {
      const minReqBalance = Number(stats.config?.['minimum_required_balance'] || 200)
      const penaltyLowBalance = Number(stats.config?.['penalty_low_balance'] || 100)

      stats.memberBills.forEach(async (mb: any) => {
        if (mb.balance_after < minReqBalance) {
          try {
            await sendNotificationToUser(mb.user_id, 'billing', {
              title: '⚠️ Low Balance Fine Assessed',
              body: `Failing to maintain a ₹${minReqBalance} balance has incurred a ₹${penaltyLowBalance} fine.`,
              url: '/dashboard/bills'
            })
          } catch (penaltyErr) {
            console.error('Failed to send low balance push alert:', mb.user_id, penaltyErr)
          }
        }
      })
    }

    // Send Web Push Notifications to all billed members in the background
    stats.memberBills.forEach(async (mb: any) => {
      try {
        const formattedMonth = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(monthStart))
        await sendNotificationToUser(mb.user_id, 'billing', {
          title: `Billing Closed for ${formattedMonth}!`,
          body: `Your final bill is ₹${mb.bill_amount}. Open MMS to download your statement.`,
          url: '/dashboard/bills'
        })
      } catch (notifyErr) {
        console.error(`Failed to send push notification to user ${mb.user_id}:`, notifyErr)
      }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error closing billing cycle:', error)
    return { success: false, error: error.message }
  }
}
