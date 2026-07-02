'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { toDisplayPoints } from '@/lib/points-config'

interface PointsContextValue {
  pointsBalance: number
  refreshPoints: () => Promise<void>
}

const PointsContext = createContext<PointsContextValue | null>(null)

export function usePoints(): PointsContextValue {
  const ctx = useContext(PointsContext)
  if (!ctx) {
    throw new Error('usePoints must be used within a PointsProvider')
  }
  return ctx
}

export function PointsProvider({
  children,
  initialBalance,
}: {
  children: ReactNode
  initialBalance: number // raw DB internal points (Int)
}) {
  const [pointsBalance, setPointsBalance] = useState(toDisplayPoints(initialBalance))

  const refreshPoints = useCallback(async () => {
    try {
      const response = await fetch('/api/points')
      if (response.ok) {
        const data = await response.json()
        setPointsBalance(data.user.pointsBalance)
      }
    } catch {
      // Silently ignore — local deduction still works, navbar keeps stale value
    }
  }, [])

  return (
    <PointsContext.Provider value={{ pointsBalance, refreshPoints }}>
      {children}
    </PointsContext.Provider>
  )
}
