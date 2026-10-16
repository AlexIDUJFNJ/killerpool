/**
 * Tests for /auth/callback: where a failed sign-in is sent
 */

import { GET } from '../callback/route';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }));

// jsdom (which jest.setup.ts needs) has no Fetch API Response for NextResponse
// to extend; the route only ever redirects, so a stand-in for that is enough
jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL | string) => ({
      status: 307,
      headers: new Map([['location', String(url)]]),
    }),
  },
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const exchangeCodeForSession = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockCreateClient.mockResolvedValue({
    auth: { exchangeCodeForSession },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function callback(query: string) {
  const response = await GET({ url: `https://killerpool.test/auth/callback${query}` } as Request);
  return { status: response.status, location: response.headers.get('location') };
}

describe('GET /auth/callback', () => {
  it('should go home after a successful exchange', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const { status, location } = await callback('?code=abc');

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(status).toBe(307);
    expect(location).toBe('https://killerpool.test/');
  });

  it('should send a failed exchange back to /auth with a reason', async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { code: 'flow_state_not_found', message: 'invalid flow state, no valid flow state found' },
    });

    const { location } = await callback('?code=abc');

    expect(location).toBe('https://killerpool.test/auth?error=other_browser');
  });

  it('should treat an unknown exchange error as a generic failure', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { code: 'unexpected_failure', message: 'boom' } });

    expect((await callback('?code=abc')).location).toBe('https://killerpool.test/auth?error=callback_failed');
  });

  it('should survive the exchange throwing', async () => {
    exchangeCodeForSession.mockRejectedValue(new Error('network down'));

    expect((await callback('?code=abc')).location).toBe('https://killerpool.test/auth?error=callback_failed');
  });

  it('should report an expired email link without trying an exchange', async () => {
    const { location } = await callback(
      '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location).toBe('https://killerpool.test/auth?error=link_expired');
  });

  it('should report a cancelled Google sign-in', async () => {
    expect((await callback('?error=access_denied')).location).toBe('https://killerpool.test/auth?error=cancelled');
  });

  it('should not pass the provider description through to the page', async () => {
    const { location } = await callback('?error=server_error&error_description=Call+this+number');

    expect(location).toBe('https://killerpool.test/auth?error=callback_failed');
  });

  it('should not treat a visit without a code as signed in', async () => {
    expect((await callback('')).location).toBe('https://killerpool.test/auth?error=callback_failed');
  });
});
