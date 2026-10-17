/**
 * Tests for BottomSheet: dialog semantics, Escape, and focus handling
 */

import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomSheet } from '../bottom-sheet';

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open sheet</button>
      <BottomSheet
        isOpen={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="All Players"
      >
        <button>First action</button>
        <button>Last action</button>
      </BottomSheet>
    </>
  );
}

describe('BottomSheet', () => {
  it('should render nothing when closed', () => {
    render(
      <BottomSheet isOpen={false} onClose={() => {}} title="Hidden">
        content
      </BottomSheet>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should expose a modal dialog named by its title', () => {
    render(
      <BottomSheet isOpen onClose={() => {}} title="All Players">
        content
      </BottomSheet>
    );

    const dialog = screen.getByRole('dialog', { name: 'All Players' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('should use the label prop when there is no visible title', () => {
    render(
      <BottomSheet isOpen onClose={() => {}} label="Install help">
        content
      </BottomSheet>
    );

    expect(screen.getByRole('dialog', { name: 'Install help' })).toBeInTheDocument();
  });

  it('should give the close button an accessible name', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(
      <BottomSheet isOpen onClose={onClose} title="All Players">
        content
      </BottomSheet>
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should close on Escape', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(
      <BottomSheet isOpen onClose={onClose} title="All Players">
        content
      </BottomSheet>
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should move focus into the sheet when it opens', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Open sheet' }));

    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('should keep Tab inside the sheet', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Open sheet' }));
    // dialog → Close → First action → Last action → wraps to Close
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
  });

  it('should return focus to the opener after closing', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);

    const opener = screen.getByRole('button', { name: 'Open sheet' });
    await user.click(opener);
    await act(async () => {
      await user.keyboard('{Escape}');
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
  });
});
