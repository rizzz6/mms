export interface Member {
  id: string
  full_name: string
  joined_at: string
  is_inactive?: boolean
  inactive_until?: string | null
  role?: string
}

export interface DutyRecord {
  id: string
  user_id: string
  date: string
  duty_type: 'bazar' | 'water'
  is_skipped: boolean
  is_cancelled?: boolean
}

export interface AssignmentDetail {
  member: Member
  isSkipped: boolean
  isCancelled: boolean
  isPenalty: boolean
  recordId?: string
}

export interface DayAssignment {
  date: string
  bazar: AssignmentDetail | null
  water: AssignmentDetail | null
}

function computeQueueForType(
  type: 'bazar' | 'water',
  members: Member[],
  allRecords: DutyRecord[],
  startDate: Date,
  numDays: number
): { [date: string]: AssignmentDetail } {
  const result: { [date: string]: AssignmentDetail } = {}
  
  // 1. Get history and current window records
  const startDateStr = startDate.toISOString().split('T')[0]
  
  // 2. Derive queue pointer from historical non-skipped records
  const historicalConfirmed = allRecords.filter(
    r => r.duty_type === type && !r.is_skipped && r.date < startDateStr
  )
  let queuePointer = historicalConfirmed.length % members.length

  // 3. Build penalty pool (members who skipped and haven't served penalty yet)
  // A penalty is served if there is a later record for that user of the same type that is NOT skipped
  const penaltyPool: Member[] = []
  const skips = allRecords.filter(r => r.duty_type === type && r.is_skipped)
  
  skips.forEach(skip => {
    const served = allRecords.some(r => 
      r.duty_type === type && 
      r.user_id === skip.user_id && 
      !r.is_skipped && 
      r.date > skip.date &&
      r.date < startDateStr
    )
    if (!served) {
      const member = members.find(m => m.id === skip.user_id)
      if (member) penaltyPool.push(member)
    }
  })

  // 4. Compute assignments for the requested range
  for (let i = 0; i < numDays; i++) {
    const current = new Date(startDate)
    current.setDate(current.getDate() + i)
    const dateStr = current.toISOString().split('T')[0]

    // Check if DB already has a record for this day/type
    let existing: DutyRecord | undefined = allRecords.find(r => r.duty_type === type && r.date === dateStr)

    if (existing) {
      const e = existing // Capture for narrowing
      const member = members.find(m => m.id === e.user_id)
      const isInactive = member && (member.is_inactive || (member.inactive_until && new Date(member.inactive_until).toISOString().split('T')[0] >= dateStr))
      
      if (member && !isInactive) {
        result[dateStr] = {
          member,
          isSkipped: e.is_skipped,
          isCancelled: !!e.is_cancelled,
          isPenalty: false,
          recordId: e.id
        }
      } else {
        // Member is inactive or not found, fall through to replacement logic
        // We'll treat this day as having no valid record for this type
        existing = undefined
      }
    }

    if (!existing) {
      let assignedMember: Member | null = null
      let isPenalty = false

      // Try penalty pool first
      while (penaltyPool.length > 0) {
        const candidate = penaltyPool.shift()!
        const isInactive = candidate.is_inactive || (candidate.inactive_until && new Date(candidate.inactive_until).toISOString().split('T')[0] >= dateStr)
        if (!isInactive) {
          assignedMember = candidate
          isPenalty = true
          break
        }
      }

      // If no penalty or penalty was inactive, try normal queue
      if (!assignedMember) {
        let attempts = 0
        while (attempts < members.length) {
          const candidate = members[queuePointer % members.length]
          const isInactive = candidate.is_inactive || (candidate.inactive_until && new Date(candidate.inactive_until).toISOString().split('T')[0] >= dateStr)
          
          if (!isInactive) {
            assignedMember = candidate
            queuePointer++
            break
          }
          queuePointer++
          attempts++
        }
      }

      if (assignedMember) {
        result[dateStr] = {
          member: assignedMember,
          isSkipped: false,
          isCancelled: false,
          isPenalty
        }
      }
    }
  }

  return result
}

export function computeRoster(
  members: Member[],
  allRecords: DutyRecord[],
  startDate: Date,
  numDays: number
): DayAssignment[] {
  if (members.length === 0) return []

  const bazarAssignments = computeQueueForType('bazar', members, allRecords, startDate, numDays)
  const waterAssignments = computeQueueForType('water', members, allRecords, startDate, numDays)

  const roster: DayAssignment[] = []
  for (let i = 0; i < numDays; i++) {
    const current = new Date(startDate)
    current.setDate(current.getDate() + i)
    const dateStr = current.toISOString().split('T')[0]

    roster.push({
      date: dateStr,
      bazar: bazarAssignments[dateStr] || null,
      water: waterAssignments[dateStr] || null
    })
  }

  return roster
}
