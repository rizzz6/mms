'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Bell, BellOff, Droplets, ShoppingBag, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveSubscription, updateNotificationPrefs, sendNotificationToUser } from '@/app/actions/push'
import { createClient } from '@/utils/supabase/client'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function PushNotificationToggle() {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [prefs, setPrefs] = useState({
    water: true,
    bazaar: true
  })
  const [fetchingPrefs, setFetchingPrefs] = useState(true)
  const [sendingTest, setSendingTest] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      // 1. Check browser subscription
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        setIsSubscribed(!!subscription)
      }

      // 2. Fetch prefs from Supabase
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('notification_prefs')
          .eq('id', user.id)
          .single()
        
        if (data?.notification_prefs) {
          setPrefs(data.notification_prefs as any)
        }
      }
      setFetchingPrefs(false)
    }
    init()
  }, [supabase])

  const handleSubscribe = async () => {
    setIsLoading(true)
    console.log('--- MMS Push Subscription Start ---')
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.error('Push API not supported in this browser.')
        throw new Error('Push notifications are not supported by this browser.')
      }

      console.log('Checking serviceWorker.ready...')
      const registration = await navigator.serviceWorker.ready
      console.log('ServiceWorker is ready:', registration)

      console.log('Requesting notification permission...')
      const permission = await window.Notification.requestPermission()
      console.log('Notification permission status:', permission)
      if (permission !== 'granted') {
        throw new Error('Permission not granted for Notification')
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      console.log('Loaded VAPID public key:', vapidPublicKey)
      if (!vapidPublicKey) {
        throw new Error('VAPID public key is missing from environment variables')
      }

      console.log('Converting VAPID key to Uint8Array...')
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey)
      console.log('Converted key length:', convertedKey.length, 'values:', Array.from(convertedKey).slice(0, 5))

      console.log('Attempting pushManager.subscribe...')
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      })
      console.log('Successfully subscribed in browser! Subscription object:', subscription)

      console.log('Saving subscription to database via server action...')
      const result = await saveSubscription(JSON.parse(JSON.stringify(subscription)))
      console.log('Database save result:', result)
      
      if (result.success) {
        setIsSubscribed(true)
        toast.success('Push notifications enabled!')
      } else {
        throw new Error(result.error)
      }

    } catch (err: any) {
      console.error('--- MMS Push Subscription Error ---', err)
      toast.error(err.message || 'Failed to enable notifications')
    } finally {
      console.log('--- MMS Push Subscription End ---')
      setIsLoading(false)
    }
  }

  const handleUnsubscribe = async () => {
    setIsLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
      }
      setIsSubscribed(false)
      toast.success('Push notifications disabled')
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to disable notifications')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendTestNotification = async () => {
    setSendingTest(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const res = await sendNotificationToUser(user.id, 'water', {
        title: 'MMS Notification Test 🔔',
        body: 'Awesome! Real-time push notifications are fully working and verified!',
        url: '/dashboard'
      })

      if (res.success) {
        toast.success('Test notification triggered successfully!')
      } else {
        throw new Error(res.error || 'Failed to send test push')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to send test push')
    } finally {
      setSendingTest(false)
    }
  }

  const togglePref = async (key: keyof typeof prefs) => {
    const newPrefs = { ...prefs, [key]: !prefs[key] }
    setPrefs(newPrefs)
    try {
      await updateNotificationPrefs(newPrefs)
      toast.success('Preferences updated')
    } catch {
      toast.error('Failed to update preferences')
      setPrefs(prefs) // Revert
    }
  }

  if (fetchingPrefs) {
    return <div className="animate-pulse h-20 bg-slate-100 rounded-xl" />
  }

  return (
    <div className="space-y-6">
      {/* Master Toggle */}
      <div className="flex flex-col gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-bold flex items-center gap-2">
              {isSubscribed ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-slate-400" />}
              Push Notifications
            </Label>
            <p className="text-[10px] text-slate-500 font-medium italic">
              {isSubscribed ? 'Browser is registered to receive alerts.' : 'Register this device to receive any alerts.'}
            </p>
          </div>
          <Button 
            variant={isSubscribed ? "outline" : "default"} 
            onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
            disabled={isLoading}
            size="sm"
            className="rounded-full h-8 px-4 text-[10px] font-black uppercase"
          >
            {isSubscribed ? 'Unregister' : 'Register Device'}
          </Button>
        </div>

        {isSubscribed && (
          <div className="pt-3 border-t border-slate-200 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendTestNotification}
              disabled={sendingTest}
              className="w-full rounded-xl h-9 text-[10px] font-black uppercase tracking-wider gap-1.5 border-dashed border-primary/20 hover:border-primary/30 text-primary hover:bg-primary/5"
            >
              {sendingTest ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Send Test Notification
            </Button>
          </div>
        )}
      </div>

      {/* Granular Toggles - Only show if subscribed */}
      <div className={`space-y-3 transition-all ${!isSubscribed ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Notify me about:</p>
        
        <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Droplets className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-700">Water Duty</p>
              <p className="text-[9px] text-slate-400 font-medium">When you are assigned for water.</p>
            </div>
          </div>
          <Switch 
            checked={prefs.water} 
            onCheckedChange={() => togglePref('water')} 
            disabled={!isSubscribed}
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-700">Bazaar Duty</p>
              <p className="text-[9px] text-slate-400 font-medium">When you are assigned for bazaar.</p>
            </div>
          </div>
          <Switch 
            checked={prefs.bazaar} 
            onCheckedChange={() => togglePref('bazaar')} 
            disabled={!isSubscribed}
          />
        </div>
      </div>
    </div>
  )
}
