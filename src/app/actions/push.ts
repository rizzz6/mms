'use server'

import { createClient } from '@/utils/supabase/server'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:admin@mms.com', // Push services require a contact email
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function saveSubscription(subscription: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  // Ensure subscription object is valid
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new Error('Invalid subscription object')
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('Error saving push subscription:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function updateNotificationPrefs(prefs: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('profiles')
    .update({ notification_prefs: prefs })
    .eq('id', user.id)

  if (error) throw error
  return { success: true }
}

export async function sendNotificationToUser(userId: string, type: string, payload: { title: string, body: string, url?: string }) {
  const { createClient: createAdminClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Check user preferences
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('notification_prefs')
    .eq('id', userId)
    .single()

  const prefs = profile?.notification_prefs as any || {}
  
  // If the user turned off this specific type, or "all" is false (if we decide to have an "all" key)
  if (prefs[type] === false) {
    console.log(`Notification of type ${type} is disabled for user ${userId}`)
    return { success: false, error: 'Disabled by user' }
  }

  const { data: sub, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !sub) {
    console.log(`No push subscription found for user ${userId}`)
    return { success: false, error: 'No subscription found' }
  }

  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth
    }
  }

  try {
    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload)
    )
    return { success: true }
  } catch (err: any) {
    console.error('Error sending push notification:', err)
    
    // If the endpoint is expired or invalid (410 Gone), we should delete it
    if (err.statusCode === 410 || err.statusCode === 404) {
      await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', userId)
    }
    
    return { success: false, error: err.message }
  }
}

export async function notifyManager(messId: string, type: string, payload: { title: string, body: string, url?: string }) {
  const { createClient: createAdminClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find the manager for this mess
  const { data: manager } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('mess_id', messId)
    .eq('role', 'manager')
    .single()

  if (!manager) return { success: false, error: 'No manager found' }

  return sendNotificationToUser(manager.id, type, payload)
}

