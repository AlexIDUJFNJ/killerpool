'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'motion/react'

const PHRASES = [
  'CHYORNY!',
  'CHYORNY!',
  'CHYORNY!',
  '¡BONUS!',
  '¡OLÉ!',
  '¡VAMOS!',
  '+1 LIFE',
  '🎱',
  '🔥',
]

const COLORS = [
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#ef4444',
  '#eab308',
]

interface FlyingText {
  id: number
  text: string
  x: number
  y: number
  rotation: number
  scale: number
  color: string
  delay: number
  dx: number
  dy: number
}

function generateTexts(): FlyingText[] {
  const shuffled = [...PHRASES].sort(() => Math.random() - 0.5)
  return shuffled.map((text, i) => ({
    id: i,
    text,
    x: 10 + Math.random() * 80,
    y: 15 + Math.random() * 70,
    rotation: -30 + Math.random() * 60,
    scale: 0.7 + Math.random() * 0.8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: i * 0.08,
    dx: (Math.random() - 0.5) * 60,
    dy: (Math.random() - 0.5) * 40,
  }))
}

interface Spark {
  id: number
  x: number
  y: number
  size: number
  color: string
  angle: number
  speed: number
  delay: number
}

function generateSparks(count: number): Spark[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 30 + Math.random() * 40,
    y: 30 + Math.random() * 40,
    size: 3 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    angle: Math.random() * 360,
    speed: 80 + Math.random() * 200,
    delay: Math.random() * 0.2,
  }))
}

const DURATION = 2000

export function BlackBallCelebration({
  show,
  onComplete,
}: {
  show: boolean
  onComplete: () => void
}) {
  const [key, setKey] = React.useState(0)
  const [texts, setTexts] = React.useState<FlyingText[]>([])
  const [sparks, setSparks] = React.useState<Spark[]>([])

  React.useEffect(() => {
    if (show) {
      setKey((k) => k + 1)
      setTexts(generateTexts())
      setSparks(generateSparks(25))
      const timer = setTimeout(onComplete, DURATION)
      return () => clearTimeout(timer)
    }
  }, [show, onComplete])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={key}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 pointer-events-none select-none overflow-hidden"
          aria-hidden
        >
          {/* Quick dark flash */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: 0.4, times: [0, 0.15, 1] }}
            className="absolute inset-0 bg-black pointer-events-none"
          />

          {/* Spark particles */}
          {sparks.map((s) => {
            const rad = (s.angle * Math.PI) / 180
            return (
              <motion.div
                key={`s-${s.id}`}
                initial={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  scale: 0,
                  opacity: 1,
                }}
                animate={{
                  left: `calc(${s.x}% + ${Math.cos(rad) * s.speed}px)`,
                  top: `calc(${s.y}% + ${Math.sin(rad) * s.speed}px)`,
                  scale: [0, 1.5, 0],
                  opacity: [1, 1, 0],
                }}
                transition={{
                  duration: 0.8 + Math.random() * 0.4,
                  delay: s.delay,
                  ease: 'easeOut',
                }}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: s.size,
                  height: s.size,
                  backgroundColor: s.color,
                  boxShadow: `0 0 ${s.size * 2}px ${s.color}`,
                }}
              />
            )
          })}

          {/* Flying text phrases — all at once, scattered across screen */}
          {texts.map((t) => (
            <motion.div
              key={`t-${t.id}`}
              initial={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                scale: 0,
                rotate: t.rotation - 20,
                opacity: 0,
              }}
              animate={{
                left: `calc(${t.x}% + ${t.dx}px)`,
                top: `calc(${t.y}% + ${t.dy}px)`,
                scale: [0, t.scale * 1.3, t.scale, 0],
                rotate: [t.rotation - 20, t.rotation + 5, t.rotation],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 1.6,
                delay: t.delay,
                ease: 'easeOut',
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none"
            >
              <span
                className="text-3xl sm:text-5xl font-black"
                style={{
                  color: t.color,
                  textShadow: `0 0 20px ${t.color}, 0 2px 8px rgba(0,0,0,0.8)`,
                  WebkitTextStroke: '1px rgba(0,0,0,0.3)',
                }}
              >
                {t.text}
              </span>
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
