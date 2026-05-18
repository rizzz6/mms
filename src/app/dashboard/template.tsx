'use client'

import { motion } from 'framer-motion'

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ 
        type: 'spring' as const,
        stiffness: 260,
        damping: 25,
        mass: 0.8
      }}
      className="w-full"
    >
      {children}
    </motion.div>
  )
}
