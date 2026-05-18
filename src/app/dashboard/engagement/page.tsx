'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { 
  ChevronRight, Megaphone, Utensils, Vote, Plus, Trash2, Loader2, 
  CheckCircle, HelpCircle, Pin, AlertTriangle
} from 'lucide-react'
import { 
  createAnnouncement, deleteAnnouncement, togglePinAnnouncement, 
  upsertDailyMenu, createPoll, closePoll, deletePoll 
} from '@/app/actions/engagement'

export default function ManagerEngagementPage() {
  const [myRole, setMyRole] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [messId, setMessId] = useState<string | null>(null)

  // Lists state
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [polls, setPolls] = useState<any[]>([])
  const [, setDailyMenu] = useState<any | null>(null)

  // Form states
  // 1. Announcements
  const [annTitle, setAnnTitle] = useState('')
  const [annContent, setAnnContent] = useState('')
  const [annPinned, setAnnPinned] = useState(false)

  // 2. Daily Menus
  const [menuDate, setMenuDate] = useState('')
  const [lunchMenu, setLunchMenu] = useState('')
  const [dinnerMenu, setDinnerMenu] = useState('')

  // 3. Polls
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [pollExpiry, setPollExpiry] = useState('')

  const supabase = createClient()

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setMenuDate(today)
  }, [])

  // Verify Role and Fetch initial data
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, mess_id')
      .eq('id', user.id)
      .single()

    setMyRole(profile?.role || null)
    setMessId(profile?.mess_id || null)

    if (profile?.role === 'manager' && profile?.mess_id) {
      // Fetch notices
      const { data: notices } = await supabase
        .from('announcements')
        .select('*')
        .eq('mess_id', profile.mess_id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })

      // Fetch polls
      const { data: activePolls } = await supabase
        .from('polls')
        .select('*, poll_options(*), poll_votes(count)')
        .eq('mess_id', profile.mess_id)
        .order('created_at', { ascending: false })

      setAnnouncements(notices || [])
      setPolls(activePolls || [])
    }
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fetch Menu specifically when menuDate changes
  useEffect(() => {
    async function fetchMenuForDate() {
      if (!messId || !menuDate) return
      const { data } = await supabase
        .from('daily_menus')
        .select('*')
        .eq('mess_id', messId)
        .eq('date', menuDate)
        .maybeSingle()

      if (data) {
        setDailyMenu(data)
        setLunchMenu(data.lunch_menu || '')
        setDinnerMenu(data.dinner_menu || '')
      } else {
        setDailyMenu(null)
        setLunchMenu('')
        setDinnerMenu('')
      }
    }
    fetchMenuForDate()
  }, [menuDate, messId, supabase])

  // Form handlers
  const handleAnnouncementSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!annTitle || !annContent) return toast.error('Please fill in all fields')

    setIsSubmitting(true)
    const res = await createAnnouncement(annTitle, annContent, annPinned)
    if (res.success) {
      toast.success('Announcement published successfully!')
      setAnnTitle('')
      setAnnContent('')
      setAnnPinned(false)
      fetchData()
    } else {
      toast.error(res.error || 'Failed to create announcement')
    }
    setIsSubmitting(false)
  }

  const handleMenuSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!menuDate) return toast.error('Please select a date')

    setIsSubmitting(true)
    const res = await upsertDailyMenu(menuDate, lunchMenu, dinnerMenu)
    if (res.success) {
      toast.success('Daily Menu updated successfully!')
      fetchData()
    } else {
      toast.error(res.error || 'Failed to update daily menu')
    }
    setIsSubmitting(false)
  }

  const handlePollSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pollQuestion) return toast.error('Please enter a poll question')
    
    const filteredOptions = pollOptions.filter(o => o.trim() !== '')
    if (filteredOptions.length < 2) {
      return toast.error('At least 2 non-empty options are required')
    }

    setIsSubmitting(true)
    const expiryDateStr = pollExpiry ? new Date(pollExpiry).toISOString() : null
    const res = await createPoll(pollQuestion, filteredOptions, expiryDateStr)
    
    if (res.success) {
      toast.success('Poll launched successfully!')
      setPollQuestion('')
      setPollOptions(['', ''])
      setPollExpiry('')
      fetchData()
    } else {
      toast.error(res.error || 'Failed to create poll')
    }
    setIsSubmitting(false)
  }

  // Poll options dynamics
  const handleAddPollOption = () => {
    setPollOptions([...pollOptions, ''])
  }

  const handleRemovePollOption = (index: number) => {
    if (pollOptions.length <= 2) return
    setPollOptions(pollOptions.filter((_, i) => i !== index))
  }

  const handlePollOptionChange = (index: number, val: string) => {
    const updated = [...pollOptions]
    updated[index] = val
    setPollOptions(updated)
  }

  // Quick Action handlers
  const handleUnpinAnnouncement = async (id: string, currentPinned: boolean) => {
    const res = await togglePinAnnouncement(id, !currentPinned)
    if (res.success) {
      toast.success(currentPinned ? 'Notice unpinned!' : 'Notice pinned to top!')
      fetchData()
    } else {
      toast.error(res.error || 'Failed to change pin status')
    }
  }

  const handleDeleteAnnouncement = async (id: string) => {
    const res = await deleteAnnouncement(id)
    if (res.success) {
      toast.success('Announcement deleted successfully')
      fetchData()
    } else {
      toast.error(res.error || 'Failed to delete announcement')
    }
  }

  const handleClosePoll = async (id: string) => {
    const res = await closePoll(id)
    if (res.success) {
      toast.success('Poll closed & results broadcasted!')
      fetchData()
    } else {
      toast.error(res.error || 'Failed to close poll')
    }
  }

  const handleDeletePoll = async (id: string) => {
    const res = await deletePoll(id)
    if (res.success) {
      toast.success('Poll deleted successfully')
      fetchData()
    } else {
      toast.error(res.error || 'Failed to delete poll')
    }
  }

  if (myRole !== null && myRole !== 'manager') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center bg-slate-50">
        <AlertTriangle className="w-12 h-12 text-slate-300 mb-4" />
        <h1 className="text-xl font-bold text-slate-800">Access Denied</h1>
        <p className="text-sm text-slate-500 max-w-xs">Only Mess Managers can access the Engagement Center.</p>
        <Button className="mt-6" onClick={() => window.location.href = '/dashboard'}>Go Back</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Premium Header */}
      <div className="bg-white px-6 pt-8 pb-6 rounded-b-[2.5rem] shadow-sm border-b border-slate-100 mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 shadow-sm active:scale-90 transition-all"
            onClick={() => window.location.href = '/dashboard'}
          >
            <ChevronRight className="w-5 h-5 text-slate-600 rotate-180" />
          </Button>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6A2C70]">Engagement Center</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Manager Board</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-[#6A2C70]" />
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading Engagement Data...</p>
          </div>
        ) : (
          <>
            {/* 1. Daily Culinary Menu Board Form */}
            <Card className="border-0 shadow-sm bg-white rounded-[2rem] border border-slate-100">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-[#F08A5D]" />
                  Daily Culinary Menu Board
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Set what meals members are eating on specific dates.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-4">
                <form onSubmit={handleMenuSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="menu-date" className="text-[10px] font-bold uppercase text-slate-400">Target Date</Label>
                    <input 
                      id="menu-date"
                      type="date"
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-2xl px-4 text-xs font-bold text-slate-700 outline-none focus:border-[#F08A5D] transition-all"
                      value={menuDate}
                      onChange={(e) => setMenuDate(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="lunch-menu" className="text-[10px] font-bold uppercase text-slate-400">Lunch Menu</Label>
                      <textarea
                        id="lunch-menu"
                        placeholder="Rice, Fish, Dal"
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-semibold text-slate-700 outline-none resize-none focus:border-[#F08A5D] transition-all"
                        value={lunchMenu}
                        onChange={(e) => setLunchMenu(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dinner-menu" className="text-[10px] font-bold uppercase text-slate-400">Dinner Menu</Label>
                      <textarea
                        id="dinner-menu"
                        placeholder="Roti, Chicken Curry"
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-semibold text-slate-700 outline-none resize-none focus:border-[#F08A5D] transition-all"
                        value={dinnerMenu}
                        onChange={(e) => setDinnerMenu(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full h-11 bg-[#6A2C70] hover:bg-[#4D1C54] text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-[#6A2C70]/15"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Save Daily Menu Card
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* 2. Create Announcement / Notice Card */}
            <Card className="border-0 shadow-sm bg-white rounded-[2rem] border border-slate-100">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[#F08A5D]" />
                  Publish Announcements
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Send official notifications and pin notices to top.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <form onSubmit={handleAnnouncementSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ann-title" className="text-[10px] font-bold uppercase text-slate-400">Notice Title</Label>
                    <Input 
                      id="ann-title"
                      placeholder="e.g. Shopper Shift Change or Roster Alert"
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-semibold text-slate-700 focus-visible:ring-[#F08A5D]/10 focus-visible:border-[#F08A5D]"
                      value={annTitle}
                      onChange={(e) => setAnnTitle(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ann-content" className="text-[10px] font-bold uppercase text-slate-400">Message Content</Label>
                    <textarea 
                      id="ann-content"
                      placeholder="Type details..."
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-semibold text-slate-700 outline-none resize-none focus:border-[#F08A5D] transition-all"
                      value={annContent}
                      onChange={(e) => setAnnContent(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-[#F08A5D]/5 border border-[#F08A5D]/10 p-3.5 rounded-2xl">
                    <input 
                      id="ann-pin"
                      type="checkbox"
                      className="w-4 h-4 text-[#F08A5D] rounded border-slate-200 outline-none accent-[#F08A5D]"
                      checked={annPinned}
                      onChange={(e) => setAnnPinned(e.target.checked)}
                    />
                    <Label htmlFor="ann-pin" className="text-xs font-bold text-[#6A2C70] cursor-pointer flex items-center gap-1.5">
                      <Pin className="w-3.5 h-3.5 text-[#F08A5D] fill-[#F08A5D]" />
                      Pin to top of member dashboards
                    </Label>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full h-11 bg-[#6A2C70] hover:bg-[#4D1C54] text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-[#6A2C70]/15"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Megaphone className="w-4 h-4 mr-2" />}
                    Broadcast Notice
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* 3. Create Interactive Poll */}
            <Card className="border-0 shadow-sm bg-white rounded-[2rem] border border-slate-100">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Vote className="w-4 h-4 text-[#B83B5E]" />
                  Launch Voting Poll
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Gather opinions on menus or special dinner adjustments.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <form onSubmit={handlePollSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="poll-question" className="text-[10px] font-bold uppercase text-slate-400">Poll Question</Label>
                    <Input 
                      id="poll-question"
                      placeholder="e.g. Chicken Biryani vs Mutton Rezala?"
                      className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-semibold text-slate-700 focus-visible:ring-[#B83B5E]/10 focus-visible:border-[#B83B5E]"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Voting Options</Label>
                    
                    {pollOptions.map((opt, index) => (
                      <div key={index} className="flex gap-2">
                        <Input 
                          placeholder={`Option ${index + 1}`}
                          className="h-10 rounded-xl bg-slate-50 border-slate-200 text-xs font-semibold text-slate-700 focus-visible:ring-[#B83B5E]/10 focus-visible:border-[#B83B5E]"
                          value={opt}
                          onChange={(e) => handlePollOptionChange(index, e.target.value)}
                        />
                        {pollOptions.length > 2 && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleRemovePollOption(index)}
                            className="h-10 w-10 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}

                    <Button 
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddPollOption}
                      className="h-9 w-full rounded-xl font-black text-[9px] uppercase tracking-wider gap-1 border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add New Option
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="poll-cutoff" className="text-[10px] font-bold uppercase text-slate-400">Voting Cutoff Date & Time (Optional)</Label>
                    <input 
                      id="poll-cutoff"
                      type="datetime-local"
                      className="w-full h-11 bg-slate-50 border border-slate-200 rounded-2xl px-4 text-xs font-bold text-slate-700 outline-none focus:border-[#B83B5E] transition-all"
                      value={pollExpiry}
                      onChange={(e) => setPollExpiry(e.target.value)}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full h-11 bg-[#6A2C70] hover:bg-[#4D1C54] text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-[#6A2C70]/15"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Vote className="w-4 h-4 mr-2" />}
                    Launch Active Poll
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* 4. Active Notices list */}
            <div className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 px-1">
                Active Published Notices
              </h2>

              {announcements.map((ann) => (
                <Card key={ann.id} className="border-0 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardContent className="p-4 flex items-start gap-4 justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-800 text-sm truncate">{ann.title}</h3>
                        {ann.pinned && (
                          <Badge className="bg-[#F9ED69]/20 text-[#6A2C70] font-bold border-0 text-[8px] h-4">PINNED</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{ann.content}</p>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleUnpinAnnouncement(ann.id, ann.pinned)}
                        className={`h-8 w-8 rounded-lg border border-slate-100 ${ann.pinned ? 'text-[#F08A5D] bg-[#F08A5D]/5' : 'text-slate-400'}`}
                        title={ann.pinned ? 'Unpin Notice' : 'Pin to Top'}
                      >
                        <Pin className={`w-3.5 h-3.5 ${ann.pinned ? 'fill-[#F08A5D]' : ''}`} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDeleteAnnouncement(ann.id)}
                        className="h-8 w-8 rounded-lg border border-slate-100 text-red-500 hover:text-red-600 hover:bg-red-50"
                        title="Delete Announcement"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {announcements.length === 0 && (
                <div className="text-center py-8 bg-white border border-slate-100 shadow-sm rounded-3xl text-slate-400 text-xs italic">
                  No active notices published.
                </div>
              )}
            </div>

            {/* 5. Active Polls list */}
            <div className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 px-1">
                Active Launch Polls
              </h2>

              {polls.map((poll) => {
                const totalVotes = poll.poll_votes?.[0]?.count || 0
                const isClosed = poll.is_closed

                return (
                  <Card key={poll.id} className="border-0 shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Poll Audit</span>
                            <Badge className={`border-0 text-[8px] font-bold h-4 ${isClosed ? 'bg-slate-100 text-slate-600' : 'bg-green-100 text-green-700 animate-pulse'}`}>
                              {isClosed ? 'CLOSED' : 'OPEN / ACTIVE'}
                            </Badge>
                          </div>
                          <h3 className="font-bold text-slate-800 text-xs mt-1 leading-normal">{poll.question}</h3>
                          <p className="text-[9px] text-slate-400 mt-0.5">{totalVotes} total votes cast</p>
                        </div>

                        <div className="flex gap-1 shrink-0">
                          {!isClosed && (
                            <Button 
                              variant="outline"
                              size="sm"
                              onClick={() => handleClosePoll(poll.id)}
                              className="h-8 rounded-lg font-black text-[9px] uppercase tracking-wider gap-1 border-slate-200 text-slate-600 active:scale-95 bg-slate-50 hover:bg-slate-100"
                            >
                              Close Poll
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeletePoll(poll.id)}
                            className="h-8 w-8 rounded-lg border border-slate-100 text-red-500 hover:text-red-600 hover:bg-red-50"
                            title="Delete Poll"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Display Poll Options Summary */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50/40 p-2.5 rounded-xl border border-slate-50">
                        {poll.poll_options.map((o: any) => (
                          <div key={o.id} className="text-[10px] text-slate-600 font-semibold truncate flex items-center gap-1.5">
                            <HelpCircle className="w-3 h-3 text-slate-400" />
                            {o.option_text}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}

              {polls.length === 0 && (
                <div className="text-center py-8 bg-white border border-slate-100 shadow-sm rounded-3xl text-slate-400 text-xs italic">
                  No active polls launched.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
