import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Printer, Utensils, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PageProps {
  params: Promise<{ bill_id: string }>
  searchParams: Promise<{ type?: string }>
}

export default async function PrintInvoicePage({ params, searchParams }: PageProps) {
  const { bill_id } = await params
  const { type = 'summary' } = await searchParams
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch the specific monthly bill with joining profiles and billing_cycles
  const { data: bill, error: billErr } = await supabase
    .from('monthly_bills')
    .select('*, profiles(*), billing_cycles(*)')
    .eq('id', bill_id)
    .single()

  if (billErr || !bill) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 text-center">
        <div className="max-w-md bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-4">
          <p className="text-red-600 font-bold">Failed to load statement.</p>
          <p className="text-xs text-slate-400">The statement record might have been deleted, or you do not have permission to view it.</p>
        </div>
      </div>
    )
  }

  const profile = bill.profiles
  const cycle = bill.billing_cycles

  // Fetch the Mess Details to get the Mess Name
  const { data: mess } = await supabase
    .from('messes')
    .select('*')
    .eq('id', cycle.mess_id)
    .single()

  // Calculate month parameters for itemized details
  const year = parseInt(cycle.billing_month.split('-')[0])
  const month = parseInt(cycle.billing_month.split('-')[1])
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const dailyMeals: any[] = []
  let bazarLogs: any[] = []

  // If detailed report, fetch itemized details
  if (type === 'detailed') {
    // 1. Fetch all verified bazar logs in this month
    const { data: bLogs } = await supabase
      .from('bazar_logs')
      .select('*, profiles(full_name)')
      .eq('mess_id', cycle.mess_id)
      .eq('verified', true)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .order('date')

    bazarLogs = bLogs || []

    // 2. Fetch user's personal meals and their hosted guests in this month
    const { data: userMeals } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', bill.user_id)
      .gte('date', monthStart)
      .lte('date', monthEnd)

    const overrideMap: Record<string, string> = {}
    const guestsByDate: Record<string, any[]> = {}
    
    userMeals?.forEach(m => {
      if (!m.is_guest) {
        overrideMap[`${m.date}-${m.type}`] = m.status
      } else {
        if (!guestsByDate[`${m.date}-${m.type}`]) guestsByDate[`${m.date}-${m.type}`] = []
        guestsByDate[`${m.date}-${m.type}`].push(m)
      }
    })

    // Construct daily meal attendance list
    const start = new Date(monthStart)
    const end = new Date(monthEnd)
    const todayStr = new Date().toISOString().split('T')[0]
    const calcEnd = monthEnd < todayStr ? end : new Date(todayStr)
    
    const current = new Date(start)
    const joinedDate = new Date(profile.joined_at).toISOString().split('T')[0]
    const messCreatedDate = mess?.created_at ? new Date(mess.created_at).toISOString().split('T')[0] : null

    while (current <= calcEnd) {
      const dateStr = current.toISOString().split('T')[0]
      const isBeforeJoin = dateStr < joinedDate
      const isBeforeMess = messCreatedDate && dateStr < messCreatedDate

      const lunchKey = `${dateStr}-lunch`
      const dinnerKey = `${dateStr}-dinner`

      const lunchStatus = overrideMap[lunchKey] 
        ? overrideMap[lunchKey] 
        : (!isBeforeJoin && !isBeforeMess ? 'eating' : 'off')

      const dinnerStatus = overrideMap[dinnerKey] 
        ? overrideMap[dinnerKey] 
        : (!isBeforeJoin && !isBeforeMess ? 'eating' : 'off')

      dailyMeals.push({
        date: dateStr,
        lunch: lunchStatus,
        dinner: dinnerStatus,
        lunchGuests: guestsByDate[lunchKey] || [],
        dinnerGuests: guestsByDate[dinnerKey] || []
      })

      current.setDate(current.getDate() + 1)
    }

    // Sort descending by date
    dailyMeals.reverse()
  }

  const getFormattedMonth = (monthStr: string) => {
    if (!monthStr) return ''
    const [y, m] = monthStr.split('-')
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(Number(y), Number(m) - 1, 1))
  }

  const billingMonthName = getFormattedMonth(cycle.billing_month)
  const isNegative = bill.balance_after < 0

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 print:bg-white print:py-0 print:px-0">
      {/* Printable Actions Bar */}
      <div className="max-w-2xl mx-auto mb-6 bg-white p-4 rounded-2xl shadow-sm flex items-center justify-between border border-slate-200/60 print:hidden">
        <div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Report Format</span>
          <h2 className="text-sm font-bold text-slate-800 capitalize">{type} Statement</h2>
        </div>
        <div className="flex gap-2">
          <a href="/dashboard/bills">
            <Button variant="ghost" className="h-10 rounded-xl text-xs font-bold">Back to App</Button>
          </a>
          <button 
            onClick={() => window.print()}
            className="h-10 px-4 bg-slate-900 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-slate-800 transition-all active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print Statement / Save PDF
          </button>
        </div>
      </div>

      {/* Invoice Document Wrapper */}
      <div className="max-w-2xl mx-auto bg-white p-12 rounded-[2rem] shadow-md border border-slate-200/50 print:border-0 print:shadow-none print:p-0 print:rounded-none">
        
        {/* Invoice Header */}
        <div className="flex justify-between items-start border-b border-slate-100 pb-8">
          <div>
            <h1 className="text-2xl font-black text-slate-950 tracking-tight uppercase leading-none">{mess?.name || 'MMS Mess'}</h1>
            <p className="text-xs font-black text-primary uppercase tracking-[0.2em] mt-2">Monthly Statement</p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-black text-slate-900 uppercase">INVOICE</h2>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Date: {new Date(bill.created_at).toLocaleDateString('en-IN')}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Cycle: {billingMonthName}</p>
          </div>
        </div>

        {/* Parties Grid */}
        <div className="grid grid-cols-2 gap-8 py-8 border-b border-slate-100">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Billing For</p>
            <h3 className="text-sm font-black text-slate-800 mt-2">{profile.full_name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Role: {profile.role}</p>
            <p className="text-[10px] text-slate-400 mt-1">Status: Approved Mess Member</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Mess Summary</p>
            <p className="text-xs font-bold text-slate-700 mt-2">Bazar Expenses: ₹{cycle.total_expense}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Member Meals: {cycle.total_member_meals}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Guest Meals: {cycle.total_guest_meals} (Custom Locked Rates)</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Calculated Rate: ₹{cycle.meal_rate}/meal</p>
          </div>
        </div>

        {/* Member Financial Computation */}
        <div className="py-8">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-4">Calculation Detail</p>
          
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase">
                <th className="pb-3">Description</th>
                <th className="pb-3 text-center">Meals Eaten</th>
                <th className="pb-3 text-right">Unit Rate</th>
                <th className="pb-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-50 text-xs">
                <td className="py-4 font-bold text-slate-800">
                  Member Meal Attendance Dues
                  <span className="block text-[10px] text-slate-400 font-medium mt-0.5">Accumulated lunch & dinner attendance</span>
                </td>
                <td className="py-4 text-center font-bold text-slate-700">{bill.meals_eaten}</td>
                <td className="py-4 text-right text-slate-500">₹{cycle.meal_rate}</td>
                <td className="py-4 text-right font-black text-slate-900">₹{bill.bill_amount}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Audit Statement Grid */}
        <div className="grid grid-cols-2 gap-4 py-6 bg-slate-50 rounded-2xl p-6 border border-slate-100/50 print:bg-slate-50">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Account Summary</h4>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Advance Deposit:</span>
                <span className="font-bold text-slate-700">₹{bill.balance_before}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Month Deduction:</span>
                <span className="font-bold text-slate-700">-₹{bill.bill_amount}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center items-end border-l border-slate-200/60 pl-6">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Remaining Balance</span>
            <p className={`text-2xl font-black mt-1 ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
              ₹{bill.balance_after}
            </p>
            {isNegative && (
              <span className="text-[9px] font-black uppercase text-red-500 tracking-tighter bg-red-50 border border-red-100 rounded px-1.5 py-0.5 mt-2">
                UNPAID DUES
              </span>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* DETAILED SECTION: DAILY MEAL LOG & BAZAR SHOPPING HISTORY */}
        {/* ======================================================== */}
        {type === 'detailed' && (
          <div className="mt-10 border-t-2 border-dashed border-slate-200 pt-8 print:mt-8 print:pt-6">
            
            {/* Daily Attendance Logs */}
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-2 text-slate-800">
                <Utensils className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Daily Meal Attendance Breakdown</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-slate-600 text-[10px]">
                {dailyMeals.map((dm) => (
                  <div key={dm.date} className="flex justify-between py-1.5 border-b border-slate-50">
                    <span className="font-bold text-slate-500">{new Date(dm.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' })}</span>
                    <div className="flex flex-col gap-1 items-end">
                      <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[8px] ${dm.lunch === 'eating' ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-400'}`}>
                        L: {dm.lunch} {dm.lunchGuests.length > 0 && `(+${dm.lunchGuests.length} Guests)`}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[8px] ${dm.dinner === 'eating' ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-400'}`}>
                        D: {dm.dinner} {dm.dinnerGuests.length > 0 && `(+${dm.dinnerGuests.length} Guests)`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bazar Shopping Expense Logs */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-800">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Mess Grocery Purchase Audit (Bazar Logs)</h3>
              </div>

              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="border-b border-slate-100 font-bold text-slate-400 uppercase">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Shopper</th>
                    <th className="pb-2">Items Purchased</th>
                    <th className="pb-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {bazarLogs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-50 text-slate-600">
                      <td className="py-2.5 font-bold text-slate-500">{new Date(log.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                      <td className="py-2.5 font-bold text-slate-700 truncate max-w-[80px]">{log.profiles?.full_name || 'Shopper'}</td>
                      <td className="py-2.5 text-slate-500 italic truncate max-w-[200px]" title={log.items}>{log.items}</td>
                      <td className="py-2.5 text-right font-black text-slate-900">₹{log.amount}</td>
                    </tr>
                  ))}
                  {bazarLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400 italic">No grocery logs found for this period.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Invoice Footer */}
        <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center text-slate-400 text-[9px] print:mt-10">
          <div>
            <p className="font-bold uppercase tracking-wider">Secure Audit Record</p>
            <p className="mt-0.5">Bill ID: {bill.id}</p>
          </div>
          <div className="text-right">
            <p className="font-bold uppercase">System Generated</p>
            <p className="mt-0.5">Mess Management Platform (MMS)</p>
          </div>
        </div>

      </div>
    </div>
  )
}
