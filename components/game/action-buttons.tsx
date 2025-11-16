'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { X, Circle, Target } from 'lucide-react'

export type GameAction = 'miss' | 'pot' | 'pot_black'

export interface ActionButtonsProps {
  onAction: (action: GameAction) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

export function ActionButtons({
  onAction,
  disabled = false,
  className,
  compact = false,
}: ActionButtonsProps) {
  const [lastAction, setLastAction] = React.useState<GameAction | null>(null)

  const handleAction = (action: GameAction) => {
    setLastAction(action)
    onAction(action)
    setTimeout(() => setLastAction(null), 300)
  }

  const buttons = [
    {
      action: 'miss' as GameAction,
      label: 'MISS',
      description: '-1 Life',
      icon: X,
      variant: 'destructive' as const,
      className: 'bg-red-600 hover:bg-red-700',
    },
    {
      action: 'pot' as GameAction,
      label: 'POT',
      description: 'No change',
      icon: Circle,
      variant: 'secondary' as const,
      className: 'bg-slate-600 hover:bg-slate-700',
    },
    {
      action: 'pot_black' as GameAction,
      label: 'POT BLACK',
      description: '+1 Life',
      icon: Target,
      variant: 'default' as const,
      className: 'bg-emerald-600 hover:bg-emerald-700',
    },
  ]

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-3', className)}>
      {buttons.map(({ action, label, description, icon: Icon, variant, className: btnClass }) => (
        <motion.div
          key={action}
          whileTap={{ scale: disabled ? 1 : 0.95 }}
          animate={{
            scale: lastAction === action ? [1, 1.05, 1] : 1,
          }}
          transition={{ duration: 0.3 }}
        >
          <Button
            size={compact ? 'lg' : 'xl'}
            variant={variant}
            onClick={() => handleAction(action)}
            disabled={disabled}
            className={cn(
              'w-full flex-col gap-1.5 text-white shadow-lg',
              compact ? 'h-16' : 'h-24',
              btnClass
            )}
          >
            <Icon className={compact ? 'h-5 w-5' : 'h-8 w-8'} />
            <div className="flex flex-col items-center gap-0.5">
              <span className={compact ? 'text-base font-bold' : 'text-xl font-bold'}>{label}</span>
              <span className="text-xs opacity-80">{description}</span>
            </div>
          </Button>
        </motion.div>
      ))}
    </div>
  )
}
