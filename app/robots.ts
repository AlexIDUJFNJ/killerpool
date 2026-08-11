import { MetadataRoute } from 'next'
import { getBaseUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/auth/callback', '/profile'],
    },
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  }
}
