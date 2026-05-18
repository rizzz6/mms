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
  ChevronRight, Plus, Trash2, Loader2, Sparkles,
  CheckCircle, ShieldAlert, ArrowDownToLine, Flame
} from 'lucide-react'
import { 
  getInventoryItemsWithPredictions, addCustomInventoryItem, 
  restockInventoryItem, markInventoryItemEmpty 
} from '@/app/actions/inventory'

export default function PantryInventoryPage() {
  const [role, setRole] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Custom item form
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategory, setNewItemCategory] = useState('Staple')
  const [newItemUnit, setNewItemUnit] = useState('kg')
  const [newItemThreshold, setNewItemThreshold] = useState('2')
  const [isSubmittingItem, setIsSubmittingItem] = useState(false)

  // Restock form state
  const [restockItemId, setRestockItemId] = useState<string | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [isSubmittingRestock, setIsSubmittingRestock] = useState(false)

  const supabase = createClient()

  const loadInventory = useCallback(async () => {
    setIsLoading(true)
    
    // Get user details
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      setRole(profile?.role || 'member')
    }

    const res = await getInventoryItemsWithPredictions()
    if (res.success) {
      setItems(res.items || [])
    } else {
      toast.error(res.error || 'Failed to load pantry inventory')
    }
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemName) return toast.error('Pantry item name is required')

    setIsSubmittingItem(true)
    const thresholdNum = parseFloat(newItemThreshold) || 2
    const res = await addCustomInventoryItem(newItemName, newItemCategory, newItemUnit, thresholdNum)
    
    if (res.success) {
      toast.success(`${newItemName} registered successfully!`)
      setNewItemName('')
      setNewItemThreshold('2')
      loadInventory()
    } else {
      toast.error(res.error || 'Failed to create item')
    }
    setIsSubmittingItem(false)
  }

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restockItemId || !restockQty) return

    setIsSubmittingRestock(true)
    const qty = parseFloat(restockQty)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid positive quantity')
      setIsSubmittingRestock(false)
      return
    }

    const res = await restockInventoryItem(restockItemId, qty)
    if (res.success) {
      toast.success('Pantry stock restocked!')
      setRestockItemId(null)
      setRestockQty('')
      loadInventory()
    } else {
      toast.error(res.error || 'Failed to restock item')
    }
    setIsSubmittingRestock(false)
  }

  const handleMarkEmpty = async (itemId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to mark ${name} empty? This resets stock to 0 and calibrates predictive metrics.`)) {
      return
    }

    const res = await markInventoryItemEmpty(itemId)
    if (res.success) {
      toast.success(`Marked ${name} empty. Usage calibration updated!`)
      loadInventory()
    } else {
      toast.error(res.error || 'Failed to adjust stock')
    }
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
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Pantry Analytics</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Stock & Inventory</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Analyzing Pantry Stock...</p>
          </div>
        ) : (
          <>
            {/* 1. Register Custom Pantry Item Form */}
            <Card className="border-0 shadow-sm bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden">
              <CardHeader className="p-6 pb-3">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-500" />
                  Add New Pantry Item
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Add a custom staple item to the tracking board.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <form onSubmit={handleCreateItem} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="item-name" className="text-[10px] font-bold uppercase text-slate-400">Item Name</Label>
                      <Input 
                        id="item-name"
                        placeholder="Rice, Oil, Potatoes..."
                        className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-semibold text-slate-700 focus-visible:ring-emerald-500/10 focus-visible:border-emerald-500"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="item-category" className="text-[10px] font-bold uppercase text-slate-400">Category</Label>
                      <select
                        id="item-category"
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all"
                        value={newItemCategory}
                        onChange={(e) => setNewItemCategory(e.target.value)}
                      >
                        <option value="Staple">Staple</option>
                        <option value="Spice">Spice</option>
                        <option value="Vegetable">Vegetable</option>
                        <option value="Meat">Meat</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="item-unit" className="text-[10px] font-bold uppercase text-slate-400">Unit</Label>
                      <select
                        id="item-unit"
                        className="w-full h-11 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all"
                        value={newItemUnit}
                        onChange={(e) => setNewItemUnit(e.target.value)}
                      >
                        <option value="kg">kg</option>
                        <option value="liters">liters</option>
                        <option value="grams">grams</option>
                        <option value="packets">packets</option>
                        <option value="pieces">pieces</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 col-span-2">
                      <Label htmlFor="item-threshold" className="text-[10px] font-bold uppercase text-slate-400">Low Stock Threshold Alert</Label>
                      <Input 
                        id="item-threshold"
                        type="number"
                        placeholder="Alert if stock drops below this value"
                        className="h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs font-semibold text-slate-700 focus-visible:ring-emerald-500/10 focus-visible:border-emerald-500"
                        value={newItemThreshold}
                        onChange={(e) => setNewItemThreshold(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmittingItem}
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-emerald-600/15"
                  >
                    {isSubmittingItem ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Register Pantry Item
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* 2. Restock Modal Form Triggered Inline */}
            {restockItemId && (
              <Card className="border-0 shadow-md bg-indigo-50/40 rounded-[2.5rem] border border-indigo-100 overflow-hidden animate-in fade-in zoom-in duration-200">
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                      <ArrowDownToLine className="w-4 h-4" />
                      Restock Pantry Item
                    </h3>
                    <Button 
                      variant="ghost" 
                      onClick={() => setRestockItemId(null)}
                      className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-600"
                    >
                      Cancel
                    </Button>
                  </div>

                  <form onSubmit={handleRestockSubmit} className="flex gap-2">
                    <div className="flex-1">
                      <Input 
                        type="number"
                        step="any"
                        placeholder="Quantity added..."
                        autoFocus
                        className="h-11 rounded-2xl bg-white border-indigo-200 text-xs font-semibold text-slate-700 focus-visible:ring-indigo-500/10 focus-visible:border-indigo-500"
                        value={restockQty}
                        onChange={(e) => setRestockQty(e.target.value)}
                      />
                    </div>
                    <Button 
                      type="submit"
                      disabled={isSubmittingRestock}
                      className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-lg shadow-indigo-600/15"
                    >
                      {isSubmittingRestock ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Log'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* 3. Pantry Items Grid */}
            <div className="space-y-4">
              <h2 className="text-xs font-black uppercase tracking-[0.15em] text-slate-400 px-1">
                Pantry Staples & Stock Levels
              </h2>

              {items.map((item) => {
                const current = Number(item.current_stock)
                const isLow = current <= Number(item.low_stock_threshold)
                const pred = item.prediction

                return (
                  <Card key={item.id} className={`border-0 shadow-sm rounded-3xl overflow-hidden border ${isLow ? 'bg-red-50/30 border-red-100/50' : 'bg-white border-slate-100'}`}>
                    <CardContent className="p-5 space-y-4">
                      {/* Item Header Info */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">{item.category}</span>
                            {isLow && (
                              <Badge className="bg-red-100 hover:bg-red-100 text-red-700 border-0 text-[8px] h-4 font-black">
                                <ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> LOW STOCK
                              </Badge>
                            )}
                          </div>
                          <h3 className="text-sm font-black text-slate-800 leading-none">{item.item_name}</h3>
                        </div>

                        <div className="text-right">
                          <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest leading-none">Current Stock</p>
                          <h4 className="text-lg font-black text-slate-800 leading-none mt-1.5">
                            {current} <span className="text-xs font-bold text-slate-500">{item.unit}</span>
                          </h4>
                        </div>
                      </div>

                      {/* Predictive Forecast Section */}
                      {pred && (
                        <div className="p-3.5 rounded-2xl bg-indigo-50/20 border border-indigo-100/30 flex items-start gap-3">
                          <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600 shrink-0 mt-0.5">
                            <Sparkles className="w-3.5 h-3.5 fill-indigo-400 text-indigo-400 animate-pulse" />
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[8px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-1">
                              <Flame className="w-2.5 h-2.5 text-indigo-500 fill-indigo-500" />
                              Predictive Runout Engine
                            </p>
                            <p className="text-[10px] font-semibold text-slate-600 leading-normal">
                              {pred.message}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Item Quick Actions */}
                      <div className="pt-3.5 border-t border-slate-50/60 flex items-center justify-between">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setRestockItemId(item.id)
                            setRestockQty('')
                          }}
                          className="h-8 rounded-xl font-black text-[9px] uppercase tracking-wider gap-1 border-slate-200 text-slate-600 active:scale-95 bg-slate-50 hover:bg-slate-100"
                        >
                          <Plus className="w-3 h-3 text-slate-500" /> Restock Stock
                        </Button>

                        {role === 'manager' && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleMarkEmpty(item.id, item.item_name)}
                            className="h-8 rounded-xl font-black text-[9px] uppercase tracking-wider gap-1 text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" /> Mark Empty
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}

              {items.length === 0 && (
                <div className="text-center py-12 bg-white border border-slate-100 shadow-sm rounded-3xl text-slate-400 text-xs italic">
                  Pantry inventory board is empty. Register items to get started!
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
