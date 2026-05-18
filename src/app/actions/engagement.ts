'use server'

import { createClient } from '@/utils/supabase/server'
import { sendNotificationToUser } from '@/app/actions/push'

// Helper to verify manager role
async function verifyManager(allowCoManager = true) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('mess_id, role')
    .eq('id', user.id)
    .single()

  const allowedRoles = allowCoManager ? ['manager', 'co_manager'] : ['manager']
  if (!profile || !allowedRoles.includes(profile.role) || !profile.mess_id) {
    throw new Error('Unauthorized. Access restricted.')
  }

  return { user, profile }
}

// 1. Announcements Server Actions
export async function createAnnouncement(title: string, content: string, pinned: boolean) {
  try {
    const { user, profile } = await verifyManager()

    const { error } = await (await createClient())
      .from('announcements')
      .insert({
        mess_id: profile.mess_id,
        title,
        content,
        pinned,
        created_by: user.id
      })
      .select()
      .single()

    if (error) throw error

    // Send push notification to all approved members
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: members } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('mess_id', profile.mess_id)
      .eq('status', 'approved')

    members?.forEach(async (member) => {
      // Don't send notification to the author themselves
      if (member.id === user.id) return
      try {
        await sendNotificationToUser(member.id, 'announcement', {
          title: `📢 New Notice: ${title}`,
          body: content.length > 80 ? `${content.substring(0, 80)}...` : content,
          url: '/dashboard'
        })
      } catch (err) {
        console.error('Failed to send announcement push notification:', err)
      }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error creating announcement:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteAnnouncement(id: string) {
  try {
    await verifyManager()

    const { error } = await (await createClient())
      .from('announcements')
      .delete()
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting announcement:', error)
    return { success: false, error: error.message }
  }
}

export async function togglePinAnnouncement(id: string, pinned: boolean) {
  try {
    await verifyManager()

    const { error } = await (await createClient())
      .from('announcements')
      .update({ pinned })
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    console.error('Error toggling pin:', error)
    return { success: false, error: error.message }
  }
}

// 2. Daily Menus Server Actions
export async function upsertDailyMenu(dateStr: string, lunchMenu: string, dinnerMenu: string) {
  try {
    const { user, profile } = await verifyManager()

    const { error } = await (await createClient())
      .from('daily_menus')
      .upsert({
        mess_id: profile.mess_id,
        date: dateStr,
        lunch_menu: lunchMenu || null,
        dinner_menu: dinnerMenu || null,
        created_by: user.id
      }, { onConflict: 'mess_id,date' })

    if (error) throw error

    // Notify members of menu update
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: members } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('mess_id', profile.mess_id)
      .eq('status', 'approved')

    const dateFormatted = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'short' }).format(new Date(dateStr))

    members?.forEach(async (member) => {
      if (member.id === user.id) return
      try {
        await sendNotificationToUser(member.id, 'menu', {
          title: `🍽️ Menu Updated!`,
          body: `The menu for ${dateFormatted} has been set. Tap to view details.`,
          url: '/dashboard'
        })
      } catch (err) {
        console.error('Failed to send menu push notification:', err)
      }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error saving daily menu:', error)
    return { success: false, error: error.message }
  }
}

// 3. Polls Server Actions
export async function createPoll(question: string, options: string[], expiresAt: string | null) {
  try {
    const { user, profile } = await verifyManager()

    if (options.length < 2) {
      return { success: false, error: 'At least 2 options are required.' }
    }

    const supabase = await createClient()

    // 1. Insert poll
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .insert({
        mess_id: profile.mess_id,
        question,
        expires_at: expiresAt || null,
        created_by: user.id
      })
      .select()
      .single()

    if (pollError || !poll) throw pollError

    // 2. Insert poll options
    const optionInserts = options.map(opt => ({
      poll_id: poll.id,
      option_text: opt
    }))

    const { error: optionsError } = await supabase
      .from('poll_options')
      .insert(optionInserts)

    if (optionsError) throw optionsError

    // 3. Send Push Notifications to members to trigger voting
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: members } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('mess_id', profile.mess_id)
      .eq('status', 'approved')

    members?.forEach(async (member) => {
      if (member.id === user.id) return
      try {
        await sendNotificationToUser(member.id, 'poll', {
          title: `🗳️ Vote Now!`,
          body: `New poll launched: "${question}"`,
          url: '/dashboard'
        })
      } catch (err) {
        console.error('Failed to send poll push notification:', err)
      }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error launching poll:', error)
    return { success: false, error: error.message }
  }
}

export async function castVote(pollId: string, optionId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Verify member is approved in the mess
    const { data: profile } = await supabase
      .from('profiles')
      .select('mess_id, status')
      .eq('id', user.id)
      .single()

    if (!profile || profile.status !== 'approved' || !profile.mess_id) {
      return { success: false, error: 'Unauthorized. Approved members only.' }
    }

    // Verify the poll is open and not expired
    const { data: poll } = await supabase
      .from('polls')
      .select('*')
      .eq('id', pollId)
      .single()

    if (!poll) {
      return { success: false, error: 'Poll not found.' }
    }

    if (poll.is_closed) {
      return { success: false, error: 'This poll has already been closed.' }
    }

    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      return { success: false, error: 'This poll has expired.' }
    }

    // Perform switchable named voting using upsert
    const { error: voteError } = await supabase
      .from('poll_votes')
      .upsert({
        poll_id: pollId,
        option_id: optionId,
        user_id: user.id
      }, { onConflict: 'poll_id,user_id' })

    if (voteError) throw voteError
    return { success: true }
  } catch (error: any) {
    console.error('Error casting vote:', error)
    return { success: false, error: error.message }
  }
}

export async function closePoll(pollId: string) {
  try {
    const { profile } = await verifyManager()
    const supabase = await createClient()

    // 1. Mark poll as closed
    const { error: closeError } = await supabase
      .from('polls')
      .update({ is_closed: true })
      .eq('id', pollId)

    if (closeError) throw closeError

    // 2. Fetch the poll question
    const { data: poll } = await supabase
      .from('polls')
      .select('question')
      .eq('id', pollId)
      .single()

    // 3. Retrieve winning option and vote count
    const { data: votes } = await supabase
      .from('poll_votes')
      .select('option_id, poll_options(option_text)')
      .eq('poll_id', pollId)

    // Calculate count per option
    const counts: Record<string, { text: string, count: number }> = {}
    votes?.forEach(v => {
      const optId = v.option_id
      const optText = Array.isArray(v.poll_options) 
        ? (v.poll_options[0] as any)?.option_text 
        : (v.poll_options as any)?.option_text || 'Unknown Option'
      if (!counts[optId]) {
        counts[optId] = { text: optText, count: 0 }
      }
      counts[optId].count++
    })

    let winnerOptionText = 'No votes'
    let winnerCount = 0

    Object.values(counts).forEach(c => {
      if (c.count > winnerCount) {
        winnerCount = c.count
        winnerOptionText = c.text
      }
    })

    // 4. Broadcast Winner Notification to all members
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: members } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('mess_id', profile.mess_id)
      .eq('status', 'approved')

    members?.forEach(async (member) => {
      try {
        await sendNotificationToUser(member.id, 'poll', {
          title: `🏆 Poll Winner Declared!`,
          body: `For "${poll?.question || 'Menu Choice'}", the winner is: "${winnerOptionText}" with ${winnerCount} votes!`,
          url: '/dashboard'
        })
      } catch (err) {
        console.error('Failed to send winner poll notification:', err)
      }
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error closing poll:', error)
    return { success: false, error: error.message }
  }
}

export async function deletePoll(pollId: string) {
  try {
    await verifyManager()

    const { error } = await (await createClient())
      .from('polls')
      .delete()
      .eq('id', pollId)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting poll:', error)
    return { success: false, error: error.message }
  }
}
