'use client'

import { Button } from '@/components/ui/button'
import { LogOut, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export function LogoutButton() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleLogout = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
      window.location.href = '/login'
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={handleLogout} 
      disabled={loading}
      className="relative"
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      ) : (
        <LogOut className="w-5 h-5 text-slate-500" />
      )}
    </Button>
  )
}
