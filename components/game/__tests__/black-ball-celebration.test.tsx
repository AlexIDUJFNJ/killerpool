/**
 * Tests for BlackBallCelebration, including the reduced-motion variant
 */

import { render, screen, act } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import { BlackBallCelebration } from '../black-ball-celebration';

jest.mock('motion/react', () => ({
  ...jest.requireActual('motion/react'),
  useReducedMotion: jest.fn(() => false),
}));

const mockUseReducedMotion = useReducedMotion as jest.MockedFunction<typeof useReducedMotion>;

describe('BlackBallCelebration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render nothing when hidden', () => {
    const { container } = render(<BlackBallCelebration show={false} onComplete={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should scatter every phrase with the flash by default', () => {
    render(<BlackBallCelebration show onComplete={() => {}} />);

    expect(screen.getAllByText('CHYORNY!')).toHaveLength(3);
    expect(screen.getByText('¡OLÉ!')).toBeInTheDocument();
    expect(document.querySelector('.bg-black')).toBeInTheDocument();
  });

  it('should show a single calm caption when the user prefers reduced motion', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<BlackBallCelebration show onComplete={() => {}} />);

    expect(screen.getAllByText('CHYORNY!')).toHaveLength(1);
    expect(screen.getByText('+1 LIFE')).toBeInTheDocument();
    expect(screen.queryByText('¡OLÉ!')).not.toBeInTheDocument();
    // No full-screen flash and no particles
    expect(document.querySelector('.bg-black')).not.toBeInTheDocument();
    expect(document.querySelector('.rounded-full')).not.toBeInTheDocument();
  });

  it.each([false, true])('should finish after two seconds (reduced motion: %s)', (reduced) => {
    mockUseReducedMotion.mockReturnValue(reduced);
    const onComplete = jest.fn();
    render(<BlackBallCelebration show onComplete={onComplete} />);

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should count down only for the overlay on screen', () => {
    // A black potted while the last overlay fades out: the fading one must not
    // end the new one early
    const onComplete = jest.fn();
    const { rerender } = render(<BlackBallCelebration show onComplete={onComplete} />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    rerender(<BlackBallCelebration show={false} onComplete={onComplete} />);
    rerender(<BlackBallCelebration show onComplete={onComplete} />);
    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should show the overlay with the render that turns it on', () => {
    const { rerender } = render(<BlackBallCelebration show={false} onComplete={() => {}} />);

    rerender(<BlackBallCelebration show onComplete={() => {}} />);

    expect(screen.getAllByText('CHYORNY!')).toHaveLength(3);
  });

  it('should play a single overlay again on the next black', async () => {
    jest.useRealTimers();
    const { rerender } = render(<BlackBallCelebration show onComplete={() => {}} />);
    rerender(<BlackBallCelebration show={false} onComplete={() => {}} />);
    // Let the exit animation finish
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));

    rerender(<BlackBallCelebration show onComplete={() => {}} />);

    expect(screen.getAllByText('CHYORNY!')).toHaveLength(3);
  });

  it('should stay hidden from assistive technology', () => {
    render(<BlackBallCelebration show onComplete={() => {}} />);

    expect(screen.getAllByText('CHYORNY!')[0].closest('[aria-hidden]')).toBeInTheDocument();
  });
});
