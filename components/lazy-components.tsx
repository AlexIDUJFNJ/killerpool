/**
 * Lazy-loaded components for better performance
 *
 * These components are loaded dynamically to reduce initial bundle size
 */

import dynamic from 'next/dynamic'
import { ComponentType } from 'react'

// Loading component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
)

// Lazy load InviteModal (includes QR code generation)
export const InviteModal = dynamic(
  () => import('./game/invite-modal').then((mod) => ({ default: mod.InviteModal })),
  {
    loading: () => <LoadingSpinner />,
    ssr: false, // QR code generation only works on client
  }
)

// Lazy load BottomSheet
export const BottomSheet = dynamic(
  () => import('./ui/bottom-sheet').then((mod) => ({ default: mod.BottomSheet })),
  {
    loading: () => null,
    ssr: true,
  }
)
