export interface Member {
  id: string
  full_name: string
  joined_at: string
}

export interface DutyRecord {
  id: string
  user_id: string
  date: string
  duty_type: 'bazar' | 'water'
  is_skipped: boolean
}

export interface AssignmentDetail {
  member: Member
  isSkipped: boolean
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
    const existing = allRecords.find(r => r.duty_type === type && r.date === dateStr)

    if (existing) {
      const member = members.find(m => m.id === existing.user_id)
      if (member) {
        result[dateStr] = {
          member,
          isSkipped: existing.is_skipped,
          isPenalty: false, // existing records are treated as final
          recordId: existing.id
        }
      }
    } else {
      // Logic: Penalty Pool FIRST, then normal Queue
      let assignedMember: Member
      let isPenalty = false

      if (penaltyPool.length > 0) {
        assignedMember = penaltyPool.shift()!
        isPenalty = true
      } else {
        assignedMember = members[queuePointer % members.length]
        queuePointer++
      }

      result[dateStr] = {
        member: assignedMember,
        isSkipped: false,
        isPenalty
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
