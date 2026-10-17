/**
 * Tests for the Sentry gate in instrumentation-client.ts and instrumentation.ts
 *
 * The bug this guards: the gate used to be NODE_ENV alone, so a local
 * `next build && next start` with the DSN from .env.local reported into the
 * production project.
 */

jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  captureRouterTransitionStart: jest.fn(),
  captureRequestError: jest.fn(),
}))

import * as Sentry from '@sentry/nextjs'

const init = Sentry.init as jest.Mock
const env = process.env as Record<string, string | undefined>
const KEYS = [
  'NODE_ENV',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_VERCEL_ENV',
  'VERCEL_ENV',
  'NEXT_RUNTIME',
] as const
const saved = Object.fromEntries(KEYS.map(key => [key, env[key]]))

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    if (key === 'NODE_ENV') continue
    delete env[key]
  }
  Object.assign(env, values)
}

/** The client file runs Sentry.init at import time, so each case re-imports it */
async function loadClient() {
  await jest.isolateModulesAsync(async () => {
    await import('../instrumentation-client')
  })
  return init.mock.calls[0]?.[0]
}

async function runServerRegister() {
  let mod: typeof import('../instrumentation')
  await jest.isolateModulesAsync(async () => {
    mod = await import('../instrumentation')
  })
  await mod!.register()
}

const DSN = 'https://key@o0.ingest.sentry.io/0'

beforeEach(() => {
  init.mockClear()
})

afterAll(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete env[key]
    else env[key] = saved[key]
  }
})

describe('instrumentation-client', () => {
  it('stays off in a local production build, DSN or not', async () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_SENTRY_DSN: DSN })
    expect((await loadClient()).enabled).toBe(false)
  })

  it.each(['production', 'preview'])('reports from a Vercel %s deployment', async vercelEnv => {
    setEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SENTRY_DSN: DSN,
      NEXT_PUBLIC_VERCEL_ENV: vercelEnv,
    })
    const options = await loadClient()
    expect(options.enabled).toBe(true)
    expect(options.environment).toBe(vercelEnv)
  })

  it('stays off under `vercel dev`', async () => {
    setEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SENTRY_DSN: DSN,
      NEXT_PUBLIC_VERCEL_ENV: 'development',
    })
    expect((await loadClient()).enabled).toBe(false)
  })

  it('stays off in `next dev` even with Vercel variables pulled into .env.local', async () => {
    setEnv({
      NODE_ENV: 'development',
      NEXT_PUBLIC_SENTRY_DSN: DSN,
      NEXT_PUBLIC_VERCEL_ENV: 'preview',
    })
    expect((await loadClient()).enabled).toBe(false)
  })

  it('stays off on Vercel without a DSN', async () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_VERCEL_ENV: 'production' })
    expect((await loadClient()).enabled).toBe(false)
  })
})

describe('instrumentation register()', () => {
  it('does not start the SDK in a local production server', async () => {
    setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_SENTRY_DSN: DSN, NEXT_RUNTIME: 'nodejs' })
    await runServerRegister()
    expect(init).not.toHaveBeenCalled()
  })

  it.each(['production', 'preview'])('starts it on a Vercel %s deployment', async vercelEnv => {
    setEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SENTRY_DSN: DSN,
      NEXT_RUNTIME: 'nodejs',
      VERCEL_ENV: vercelEnv,
    })
    await runServerRegister()
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN, environment: vercelEnv }))
  })

  it('does not start it under `vercel dev`', async () => {
    setEnv({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SENTRY_DSN: DSN,
      NEXT_RUNTIME: 'nodejs',
      VERCEL_ENV: 'development',
    })
    await runServerRegister()
    expect(init).not.toHaveBeenCalled()
  })
})
