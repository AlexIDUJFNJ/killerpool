'use client'

import * as React from 'react'
import { motion, AnimatePresence, PanInfo } from 'motion/react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { Button } from './button'

export interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  /** Accessible name for a sheet without a visible title */
  label?: string
  className?: string
}

const DRAG_THRESHOLD = 100

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A modal sheet that slides up from the bottom.
 *
 * It behaves as a dialog for assistive technology and the keyboard: focus
 * moves into the sheet when it opens, Tab cycles inside it, Escape closes
 * it, and focus returns to whatever opened it.
 */
export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  label,
  className,
}: BottomSheetProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  // Callers pass an inline arrow, so read the latest one through a ref rather
  // than re-running the open/close effect on every render
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    if (!isOpen) return

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // The opener can disappear while the sheet is open (it is often part of
      // a screen that re-renders), so only hand focus back if it is still there
      if (opener?.isConnected) opener.focus()
    }
  }, [isOpen])

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Close if dragged down enough
    if (info.offset.y > DRAG_THRESHOLD || info.velocity.y > 500) {
      onClose()
    }
    setIsDragging(false)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 bg-background/80 backdrop-blur-xs z-40"
          />

          {/* Bottom Sheet */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : label}
            tabIndex={-1}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            className={cn(
              'fixed bottom-0 left-0 right-0 z-50 outline-hidden',
              'bg-background border-t border-border',
              'rounded-t-3xl shadow-2xl',
              'max-h-[85vh] overflow-hidden',
              className
            )}
          >
            {/* Drag Handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              aria-hidden="true"
            >
              <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-6 py-3 border-b border-border">
                <h2 id={titleId} className="text-lg font-bold">
                  {title}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Content */}
            <div
              className={cn(
                'overflow-y-auto',
                title ? 'max-h-[calc(85vh-6rem)]' : 'max-h-[calc(85vh-3rem)]'
              )}
              style={{
                pointerEvents: isDragging ? 'none' : 'auto',
              }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
