/**
 * Tests for the error boundary page
 */

import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorPage from '../error';

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

describe('ErrorPage', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should offer a way home that is one link, not a button inside a link', () => {
    const { container } = render(<ErrorPage error={new Error('boom')} reset={() => {}} />);

    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
    expect(container.querySelector('a button, button a')).toBeNull();
  });

  it('should retry through reset', () => {
    const reset = jest.fn();
    render(<ErrorPage error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
