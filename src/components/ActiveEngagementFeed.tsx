'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Megaphone, Utensils, Vote, CheckCircle2, ChevronDown, ChevronUp, Clock, HelpCircle, Users } from 'lucide-react'
import { castVote } from '@/app/actions/engagement'

interface Announcement {
  id: string
  title: string
  content: string
  pinned: boolean
  created_at: string
}

interface DailyMenu {
  id: string
  date: string
  lunch_menu: string | null
  dinner_menu: string | null
}

interface PollOption {
  id: string
  option_text: string
}

interface Profile {
  full_name: string
}

interface PollVote {
  id: string
  poll_id: string
  option_id: string
  user_id: string
  profiles?: Profile
}

interface Poll {
  id: string
  question: string
  is_closed: boolean
  expires_at: string | null
  poll_options: PollOption[]
  poll_votes: PollVote[]
}

interface ActiveEngagementFeedProps {
  announcements: Announcement[]
  menu: DailyMenu | null
  polls: Poll[]
  userId: string
}

export default function ActiveEngagementFeed({
  announcements,
  menu,
  polls: initialPolls,
  userId
}: ActiveEngagementFeedProps) {
  const [polls, setPolls] = useState<Poll[]>(initialPolls)
  const [votingPollId, setVotingPollId] = useState<string | null>(null)
  const [expandedPollVoters, setExpandedPollVoters] = useState<Record<string, boolean>>({})

  const handleVote = async (pollId: string, optionId: string) => {
    setVotingPollId(pollId)
    const res = await castVote(pollId, optionId)
    if (res.success) {
      toast.success('Vote cast successfully!')
      // Optimistically fetch/update the polls state locally
      // We rebuild the poll votes array to reflect the new/updated vote
      setPolls(prevPolls => prevPolls.map(p => {
        if (p.id !== pollId) return p

        // Remove any previous vote by this user in this poll
        const filteredVotes = p.poll_votes.filter(v => v.user_id !== userId)

        // Find the user's full name from existing votes if available, or use "You"
        const existingVote = p.poll_votes.find(v => v.user_id === userId)
        const myName = existingVote?.profiles?.full_name || 'You'

        // Add the new vote
        const newVote: PollVote = {
          id: Math.random().toString(), // temp ID
          poll_id: pollId,
          option_id: optionId,
          user_id: userId,
          profiles: {
            full_name: myName
          }
        }

        return {
          ...p,
          poll_votes: [...filteredVotes, newVote]
        }
      }))
    } else {
      toast.error(res.error || 'Failed to cast vote')
    }
    setVotingPollId(null)
  }

  const toggleVotersList = (pollId: string) => {
    setExpandedPollVoters(prev => ({
      ...prev,
      [pollId]: !prev[pollId]
    }))
  }

  const getVoteStatistics = (poll: Poll) => {
    const totalVotes = poll.poll_votes.length
    const optionCounts: Record<string, number> = {}
    const optionVoters: Record<string, string[]> = {}

    // Initialize counts and voter names lists
    poll.poll_options.forEach(o => {
      optionCounts[o.id] = 0
      optionVoters[o.id] = []
    })

    // Populate counts and voter names lists
    poll.poll_votes.forEach(v => {
      if (optionCounts[v.option_id] !== undefined) {
        optionCounts[v.option_id]++
        const voterName = v.user_id === userId ? 'You' : v.profiles?.full_name || 'Anonymous'
        optionVoters[v.option_id].push(voterName)
      }
    })

    const userVote = poll.poll_votes.find(v => v.user_id === userId)

    return {
      totalVotes,
      optionCounts,
      optionVoters,
      userVote
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. Pinned Announcements Section */}
      {announcements.map((ann) => (
        <Card key={ann.id} className="border-0 shadow-sm bg-[#F9ED69]/5 border border-[#F9ED69]/20 rounded-3xl overflow-hidden">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="bg-[#F9ED69]/20 p-2.5 rounded-2xl text-[#6A2C70] shrink-0 mt-0.5">
              <Megaphone className="w-5 h-5" />
            </div>
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-black uppercase text-[#6A2C70] tracking-wider">Pinned Announcement</span>
                <span className="text-[8px] font-bold text-slate-400">
                  {new Date(ann.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </span>
              </div>
              <h3 className="text-sm font-black text-slate-800 truncate leading-none mt-1">{ann.title}</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed whitespace-pre-wrap mt-2">{ann.content}</p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* 2. Today's Culinary Menu Card */}
      {menu && (
        <Card className="border-0 shadow-sm bg-white rounded-3xl overflow-hidden border border-slate-100">
          <CardHeader className="p-4 pb-2 border-b border-slate-50/60 bg-[#F08A5D]/5">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Utensils className="w-4 h-4 text-[#F08A5D]" />
              Today&apos;s Culinary Menu
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-2 gap-4">
            <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50">
              <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Lunch</span>
              <p className="text-xs font-black text-slate-700 leading-normal">
                {menu.lunch_menu || 'Not configured'}
              </p>
            </div>
            <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50">
              <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Dinner</span>
              <p className="text-xs font-black text-slate-700 leading-normal">
                {menu.dinner_menu || 'Not configured'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Active Polls Feed */}
      {polls.map((poll) => {
        const { totalVotes, optionCounts, optionVoters, userVote } = getVoteStatistics(poll)
        const isVoted = !!userVote
        const votersExpanded = !!expandedPollVoters[poll.id]
        
        // Calculate cutoff time string
        const isExpired = poll.expires_at ? new Date(poll.expires_at) < new Date() : false
        const timeRemaining = poll.expires_at && !isExpired
          ? `Closes at ${new Date(poll.expires_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
          : null

        return (
          <Card key={poll.id} className="border-0 shadow-sm bg-white border border-slate-100 rounded-3xl overflow-hidden">
            <CardContent className="p-5 space-y-4">
              {/* Poll Header */}
              <div className="flex items-start gap-3">
                <div className="bg-[#6A2C70]/5 p-2 rounded-xl text-[#6A2C70] shrink-0 mt-0.5">
                  <Vote className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-[#6A2C70] uppercase tracking-widest">Active Mess Poll</span>
                    {timeRemaining && (
                      <span className="text-[8px] font-bold text-slate-400 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {timeRemaining}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-black text-slate-800 leading-normal mt-1.5">{poll.question}</h3>
                </div>
              </div>

              {/* Poll Options Grid */}
              <div className="space-y-2.5 pt-1">
                {poll.poll_options.map((opt) => {
                  const votes = optionCounts[opt.id] || 0
                  const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
                  const votersList = optionVoters[opt.id] || []
                  const isMyVote = userVote?.option_id === opt.id

                  return (
                    <div key={opt.id} className="space-y-1">
                      {isVoted ? (
                        /* Voted State (Progress display) */
                        <div 
                          onClick={() => votingPollId === null && handleVote(poll.id, opt.id)}
                          className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col ${
                            isMyVote 
                              ? 'border-[#6A2C70]/20 bg-[#6A2C70]/5 shadow-inner' 
                              : 'border-slate-100 bg-slate-50/40 hover:bg-slate-50/70'
                          }`}
                        >
                          <div className="flex justify-between items-center z-10 text-xs font-bold">
                            <span className="flex items-center gap-1.5 text-slate-700 truncate max-w-[80%]">
                              {isMyVote && <CheckCircle2 className="w-3.5 h-3.5 text-[#6A2C70] shrink-0" />}
                              {opt.option_text}
                            </span>
                            <span className="text-[#6A2C70] font-black shrink-0">{percent}%</span>
                          </div>
                          
                          {/* Animated Progress bar */}
                          <Progress 
                            value={percent} 
                            className="h-1.5 mt-2 bg-slate-100 z-10" 
                            indicatorClassName={isMyVote ? 'bg-[#6A2C70]' : 'bg-[#F08A5D]'}
                          />
                        </div>
                      ) : (
                        /* Unvoted State (Casting buttons) */
                        <Button
                          variant="outline"
                          disabled={votingPollId !== null}
                          onClick={() => handleVote(poll.id, opt.id)}
                          className="w-full h-11 justify-start rounded-2xl border-[#6A2C70]/10 bg-gradient-to-r from-white to-[#6A2C70]/5 hover:border-[#6A2C70]/30 hover:bg-[#6A2C70]/10 text-slate-800 font-bold text-xs active:scale-[0.98] transition-all shadow-sm flex items-center gap-2"
                        >
                          <HelpCircle className="w-4 h-4 text-[#F08A5D]" />
                          {opt.option_text}
                        </Button>
                      )}

                      {/* Display Named Voters List (Required: named votes) */}
                      {isVoted && votersList.length > 0 && votersExpanded && (
                        <div className="pl-4 pr-2 py-1 text-[9px] text-slate-400 font-bold bg-slate-50/30 rounded-xl flex flex-wrap gap-1 leading-relaxed">
                          <Users className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-slate-400 uppercase tracking-tighter">Voters:</span>
                          <span className="text-slate-500">{votersList.join(', ')} ({votersList.length})</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Poll Expand Voter Details Control */}
              {isVoted && totalVotes > 0 && (
                <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
                  <button 
                    onClick={() => toggleVotersList(poll.id)}
                    className="text-[9px] font-black text-[#6A2C70] hover:text-[#6A2C70]/80 uppercase tracking-wider flex items-center gap-1 outline-none"
                  >
                    {votersExpanded ? (
                      <>Hide Voters List <ChevronUp className="w-3 h-3" /></>
                    ) : (
                      <>Reveal Named Voters <ChevronDown className="w-3 h-3" /></>
                    )}
                  </button>

                  <span className="text-[9px] font-bold text-slate-400">
                    {totalVotes} total votes cast
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
