'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'motion/react'

const PHRASES = [
  'CHYORNY!',
  '¡BONUS!',
  '¡URA!',
  'CHYORNY SHAR!',
  '¡OLÉ!',
  '¡VAMOS!',
]

interface Particle {
  id: number
  x: number
  y: number
  color: string
  size: number
  angle: number
  speed: number
  delay: number
}

const COLORS = [
  '#f43f5e', // rose
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ec4899', // pink
  '#ef4444', // red
  '#eab308', // yellow
]

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 20,
    y: 50 + (Math.random() - 0.5) * 10,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 4 + Math.random() * 8,
    angle: Math.random() * 360,
    speed: 150 + Math.random() * 250,
    delay: Math.random() * 0.3,
  }))
}

export function BlackBallCelebration({ show, onComplete }: { show: boolean; onComplete: () => void }) {
  const [particles] = React.useState(() => createParticles(40))
  const phrase = React.useMemo(
    () => PHRASES[Math.floor(Math.random() * PHRASES.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show]
  )

  React.useEffect(() => {
    if (show) {
      const timer = setTimeout(onComplete, 2500)
      return () => clearTimeout(timer)
    }
  }, [show, onComplete])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 pointer-events-none overflow-hidden"
        >
          {/* Dark flash overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration: 0.6, times: [0, 0.15, 1] }}
            className="absolute inset-0 bg-black"
          />

          {/* Firework particles */}
          {particles.map((p) => {
            const rad = (p.angle * Math.PI) / 180
            const dx = Math.cos(rad) * p.speed
            const dy = Math.sin(rad) * p.speed
            return (
              <motion.div
                key={p.id}
                initial={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  scale: 0,
                  opacity: 1,
                }}
                animate={{
                  left: `calc(${p.x}% + ${dx}px)`,
                  top: `calc(${p.y}% + ${dy}px)`,
                  scale: [0, 1.5, 0],
                  opacity: [1, 1, 0],
                }}
                transition={{
                  duration: 1.2 + Math.random() * 0.6,
                  delay: p.delay,
                  ease: 'easeOut',
                }}
                className="absolute rounded-full"
                style={{
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                }}
              />
            )
          })}

          {/* Main text */}
          <motion.div
            initial={{ scale: 0, rotate: -20, opacity: 0 }}
            animate={{
              scale: [0, 1.3, 1],
              rotate: [-20, 5, 0],
              opacity: [0, 1, 1],
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="text-center">
              <motion.p
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 0.8, repeat: 2, repeatType: 'reverse' }}
                className="text-5xl sm:text-7xl font-black tracking-tight"
                style={{
                  textShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 80px rgba(239,68,68,0.5)',
                  color: '#fbbf24',
                  WebkitTextStroke: '2px #b45309',
                }}
              >
                {phrase}
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-2xl sm:text-3xl font-bold text-white mt-2"
                style={{ textShadow: '0 0 20px rgba(0,0,0,0.9)' }}
              >
                🎱 +1 Life 🎱
              </motion.p>
            </div>
          </motion.div>

          {/* Side sparkle bursts */}
          {[
            { x: '15%', y: '30%', delay: 0.2 },
            { x: '85%', y: '25%', delay: 0.4 },
            { x: '20%', y: '70%', delay: 0.6 },
            { x: '80%', y: '65%', delay: 0.3 },
          ].map((spark, i) => (
            <motion.div
              key={`spark-${i}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1.5, 0],
                opacity: [0, 1, 0],
              }}
              transition={{ duration: 0.8, delay: spark.delay }}
              className="absolute text-3xl sm:text-4xl"
              style={{ left: spark.x, top: spark.y }}
            >
              ✨
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
