/**
 * Tests for InviteModal: sharing failure message, retry, and form labelling
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteModal } from '../invite-modal';
import { useGame } from '@/contexts/game-context';

jest.mock('@/contexts/game-context', () => ({ useGame: jest.fn() }));

jest.mock('@/lib/invite', () => ({
  generateInviteLink: (id: string) => `https://killerpool.test/game/${id}`,
  generateInviteQRCode: jest.fn().mockResolvedValue('data:image/png;base64,AAAA'),
  downloadQRCode: jest.fn(),
  shareInviteLink: jest.fn(),
  copyInviteLink: jest.fn().mockResolvedValue(true),
}));

const mockUseGame = useGame as jest.MockedFunction<typeof useGame>;

function mockGame({ enableSharing = jest.fn(), isSharingEnabled = false, isSpectatorMode = false } = {}) {
  mockUseGame.mockReturnValue({
    enableSharing,
    isSharingEnabled,
    isSpectatorMode,
  } as unknown as ReturnType<typeof useGame>);
  return enableSharing;
}

function renderModal() {
  return render(<InviteModal gameId="g1" open onOpenChange={() => {}} />);
}

describe('InviteModal', () => {
  it('should explain a sharing failure in plain words', async () => {
    mockGame({ enableSharing: jest.fn().mockResolvedValue(false) });
    renderModal();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/live sharing couldn.t be turned on/i);
    expect(alert).not.toHaveTextContent(/migration|console/i);
  });

  it('should try again on request', async () => {
    const enableSharing = mockGame({
      enableSharing: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    });
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(enableSharing).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('should not ask a spectator to enable sharing', () => {
    const enableSharing = mockGame({ isSpectatorMode: true });
    renderModal();

    expect(enableSharing).not.toHaveBeenCalled();
    expect(screen.getByText(/let others watch the game live/i)).toBeInTheDocument();
  });

  it('should label the invite link field and the copy button', async () => {
    mockGame({ isSharingEnabled: true });
    renderModal();

    expect(screen.getByLabelText('Invite Link')).toHaveValue('https://killerpool.test/game/g1');
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeInTheDocument();
  });
});
