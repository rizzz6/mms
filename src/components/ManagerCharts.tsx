'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  TrendingUp, 
  DollarSign, 
  Loader2, 
  PieChart as PieIcon, 
  Info
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'

interface Member {
  id: string
  full_name: string
  joined_at: string
  is_inactive?: boolean
  inactive_until?: string | null
}

interface BazarLog {
  amount: number
  date: string
}

interface MealOverride {
  user_id: string
  date: string
  type: 'lunch' | 'dinner'
  status: 'eating' | 'off'
}

interface ManagerChartsProps {
  bazarLogs: BazarLog[]
  members: Member[]
  mealOverrides: MealOverride[]
  messCreatedDate: string | null
}

const COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Rose
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#14b8a6', // Teal
]

export default function ManagerCharts({
  bazarLogs = [],
  members = [],
  mealOverrides = [],
  messCreatedDate
}: ManagerChartsProps) {
  const [timeframe, setTimeframe] = useState<'1M' | '3M'>('1M')
  const [mealFilter, setMealFilter] = useState<'all' | 'lunch' | 'dinner'>('all')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Calculate Date Ranges
  const dates = useMemo(() => {
    const today = new Date()
    const daysToSub = timeframe === '1M' ? 30 : 90
    
    const start = new Date()
    start.setDate(today.getDate() - daysToSub + 1)
    
    return { start, today, days: daysToSub }
  }, [timeframe])

  // Process Daily Expenses (Area Chart Data)
  const expenseData = useMemo(() => {
    if (!mounted) return []

    const startStr = dates.start.toISOString().split('T')[0]
    const todayStr = dates.today.toISOString().split('T')[0]
    
    // Group bazar logs by date
    const dailyMap: Record<string, number> = {}
    bazarLogs.forEach(log => {
      if (log.date >= startStr && log.date <= todayStr) {
        dailyMap[log.date] = (dailyMap[log.date] || 0) + Number(log.amount)
      }
    })

    // Generate consecutive dates to show a continuous line
    const data = []
    const current = new Date(dates.start)
    let cumulative = 0

    while (current <= dates.today) {
      const dateStr = current.toISOString().split('T')[0]
      const dailyAmount = dailyMap[dateStr] || 0
      cumulative += dailyAmount
      
      data.push({
        date: dateStr,
        formattedDate: current.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        expense: dailyAmount,
        cumulativeExpense: cumulative
      })
      
      current.setDate(current.getDate() + 1)
    }

    return data
  }, [bazarLogs, dates, mounted])

  // Process Meal Consumption (Pie Chart Data)
  const mealData = useMemo(() => {
    if (!mounted || members.length === 0) return []

    // Create a fast override map
    const overrideMap: Record<string, string> = {}
    mealOverrides.forEach(m => {
      overrideMap[`${m.user_id}-${m.date}-${m.type}`] = m.status
    })

    // Initialize counts for approved members
    const counts: Record<string, { id: string, name: string, count: number }> = {}
    members.forEach(m => {
      counts[m.id] = { id: m.id, name: m.full_name, count: 0 }
    })

    // Loop through each day in the selected timeframe
    const current = new Date(dates.start)
    while (current <= dates.today) {
      const dateStr = current.toISOString().split('T')[0]
      
      members.forEach(m => {
        const joinedDate = new Date(m.joined_at).toISOString().split('T')[0]
        
        // Skip default checks if member is inactive on this day
        // (Simple check: if they are inactive right now, we skip counting if it overlaps, 
        // but for simplicity we rely on joined date and overrides)
        
        const types: ('lunch' | 'dinner')[] = 
          mealFilter === 'all' ? ['lunch', 'dinner'] : [mealFilter]
          
        types.forEach(type => {
          const key = `${m.id}-${dateStr}-${type}`
          const override = overrideMap[key]
          
          if (override) {
            if (override === 'eating' && counts[m.id]) {
              counts[m.id].count++
            }
          } else {
            // Default logic: eating unless before join or mess creation
            const isBeforeJoin = dateStr < joinedDate
            const isBeforeMess = messCreatedDate && dateStr < messCreatedDate
            if (!isBeforeJoin && !isBeforeMess && counts[m.id]) {
              counts[m.id].count++
            }
          }
        })
      })

      current.setDate(current.getDate() + 1)
    }

    // Format & sort for Pie Chart
    return Object.values(counts)
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [members, mealOverrides, messCreatedDate, dates, mealFilter, mounted])

  // Calculations for summary card
  const stats = useMemo(() => {
    const totalExp = expenseData.reduce((sum, item) => sum + item.expense, 0)
    const totalMeals = mealData.reduce((sum, item) => sum + item.count, 0)
    const avgMealRate = totalMeals > 0 ? (totalExp / totalMeals).toFixed(2) : '0.00'
    const dailyAvg = expenseData.length > 0 ? (totalExp / expenseData.length).toFixed(2) : '0'

    return {
      totalExp,
      totalMeals,
      avgMealRate,
      dailyAvg
    }
  }, [expenseData, mealData])

  if (!mounted) {
    return (
      <Card className="border-0 shadow-lg bg-white overflow-hidden rounded-[2.5rem] p-8 flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading Analytics Engine...</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Chart Configuration Controls */}
      <Card className="border-0 shadow-xl bg-slate-900 text-white rounded-[2rem] overflow-hidden relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/20 rounded-full -mr-24 -mt-24 blur-3xl" />
        <div className="p-6 relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 backdrop-blur-md">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[9px] text-white/50 font-black uppercase tracking-[0.2em]">Dashboard</p>
                <h3 className="text-lg font-black tracking-tight">Manager Analytics</h3>
              </div>
            </div>
            
            {/* Timeframe pill toggle */}
            <div className="bg-white/5 p-1 rounded-xl border border-white/10 flex">
              {(['1M', '3M'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                    timeframe === t 
                      ? 'bg-primary text-white shadow-md' 
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t === '1M' ? '30 Days' : '90 Days'}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex flex-col justify-center">
              <span className="text-[8px] text-white/40 font-black uppercase tracking-widest mb-1">Expenses</span>
              <span className="text-sm font-black tracking-tight text-white">₹{stats.totalExp}</span>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex flex-col justify-center">
              <span className="text-[8px] text-white/40 font-black uppercase tracking-widest mb-1">Meals Served</span>
              <span className="text-sm font-black tracking-tight text-white">{stats.totalMeals}</span>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 flex flex-col justify-center">
              <span className="text-[8px] text-white/40 font-black uppercase tracking-widest mb-1">Avg Meal Rate</span>
              <span className="text-sm font-black tracking-tight text-emerald-400">₹{stats.avgMealRate}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Expense Line Chart Card */}
      <Card className="border-0 shadow-lg bg-white rounded-[2rem] overflow-hidden">
        <CardHeader className="p-5 pb-2 border-b flex flex-col space-y-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Expense Pulse & Trends
            </CardTitle>
            <Badge variant="secondary" className="text-[8px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border-0 h-5 px-2">
              Verified Bazar logs
            </Badge>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Daily and cumulative spending trends over the timeframe</p>
        </CardHeader>
        <CardContent className="p-5">
          <div className="h-64 w-full">
            {expenseData.length === 0 ? (
              <div className="h-full flex items-center justify-center flex-col text-slate-400">
                <Info className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider">No bazar logs recorded</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={expenseData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="formattedDate" 
                    tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: '700' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: '#94a3b8', fontSize: 8, fontWeight: '700' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderRadius: '16px', 
                      border: '0', 
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: '700',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}
                    labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                  />
                  <Area 
                    name="Daily Spend"
                    type="monotone" 
                    dataKey="expense" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorExpense)" 
                  />
                  <Area 
                    name="Total Budget"
                    type="monotone" 
                    dataKey="cumulativeExpense" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorCumulative)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          
          <div className="flex items-center justify-between border-t border-slate-100 mt-4 pt-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-500 inline-block" /> Daily Logs</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Cumulative Trend</span>
          </div>
        </CardContent>
      </Card>

      {/* Pie Chart Card (Who eats the most meals) */}
      <Card className="border-0 shadow-lg bg-white rounded-[2rem] overflow-hidden">
        <CardHeader className="p-5 pb-2 border-b flex flex-col space-y-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary" />
              Meal Consumption
            </CardTitle>
            
            {/* Meal Filter buttons */}
            <div className="bg-slate-100 p-0.5 rounded-lg flex border">
              {(['all', 'lunch', 'dinner'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setMealFilter(f)}
                  className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider transition-all duration-200 ${
                    mealFilter === f 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f === 'all' ? 'All' : f}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">Meal eating distribution across active members</p>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-center">
            <div className="h-48 w-full max-w-[200px]">
              {mealData.length === 0 ? (
                <div className="h-full flex items-center justify-center flex-col text-slate-400">
                  <Info className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider">No active eaters</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mealData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="count"
                    >
                      {mealData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#0f172a', 
                        borderRadius: '16px', 
                        border: '0', 
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: '700'
                      }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Custom Beautiful Legend/List with Percentages */}
          <div className="space-y-2 pt-2 border-t border-slate-50 max-h-[160px] overflow-y-auto pr-1">
            {mealData.slice(0, 8).map((item, index) => {
              const percentage = stats.totalMeals > 0 
                ? ((item.count / stats.totalMeals) * 100).toFixed(0) 
                : '0'

              return (
                <div key={item.id} className="flex items-center justify-between text-xs py-1">
                  <div className="flex items-center gap-2 truncate">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                    />
                    <span className="font-bold text-slate-700 truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-black">
                    <span className="text-slate-900">{item.count} meals</span>
                    <Badge variant="outline" className="text-[9px] font-black h-4 px-1 border-slate-200 text-slate-400">
                      {percentage}%
                    </Badge>
                  </div>
                </div>
              )
            })}
            {mealData.length > 8 && (
              <p className="text-[9px] text-center text-slate-400 italic pt-1">
                + {mealData.length - 8} more members eating active portions
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
