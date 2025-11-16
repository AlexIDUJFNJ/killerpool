/**
 * Haptic Feedback Utility
 * Provides vibration feedback for mobile devices
 */

type HapticIntensity = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'

/**
 * Trigger haptic feedback on supported devices
 */
export function triggerHaptic(intensity: HapticIntensity = 'medium'): void {
  // Check if the Vibration API is supported
  if (!('vibrate' in navigator)) {
    return
  }

  // Define vibration patterns for different intensities
  const patterns: Record<HapticIntensity, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: 50,
    success: [10, 50, 10],
    warning: [20, 100, 20],
    error: [50, 100, 50, 100, 50],
  }

  const pattern = patterns[intensity]

  try {
    navigator.vibrate(pattern)
  } catch (error) {
    // Silently fail if vibration is not supported or blocked
    console.debug('Haptic feedback not available:', error)
  }
}

/**
 * Haptic feedback for game actions
 */
export const haptics = {
  // Swipe interactions
  swipeStart: () => triggerHaptic('light'),
  swipeMove: () => triggerHaptic('light'),

  // Game actions
  miss: () => triggerHaptic('error'),
  pot: () => triggerHaptic('medium'),
  potBlack: () => triggerHaptic('success'),

  // UI interactions
  tap: () => triggerHaptic('light'),
  success: () => triggerHaptic('success'),
  warning: () => triggerHaptic('warning'),
  error: () => triggerHaptic('error'),

  // Player eliminated
  eliminated: () => triggerHaptic('heavy'),

  // Winner
  victory: () => {
    // Special victory pattern
    navigator.vibrate?.([50, 100, 50, 100, 100])
  },
}
