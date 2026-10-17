/**
 * Tests for InviteModal: sharing failure message, retry, and form labelling
 */

import { act, render, screen, waitFor } from '@testing-library/react';
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

  it('should not ask a spectator to enable sharing', async () => {
    const enableSharing = mockGame({ isSpectatorMode: true });
    renderModal();
    await act(async () => {});

    expect(enableSharing).not.toHaveBeenCalled();
    expect(screen.getByText(/let others watch the game live/i)).toBeInTheDocument();
  });

  it('should label the invite link field and the copy button', async () => {
    mockGame({ isSharingEnabled: true });
    renderModal();
    await act(async () => {});

    expect(screen.getByLabelText('Invite Link')).toHaveValue('https://killerpool.test/game/g1');
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeInTheDocument();
  });

  // Whoever inserts a guest game first sets its host-secret hash (00016), so
  // the id must not leave the device before the host's own first write lands
  it('should hold the link and QR code back until the host game is uploaded', async () => {
    mockGame({ enableSharing: jest.fn(() => new Promise<boolean>(() => {})) });
    renderModal();

    expect(screen.getByText(/enabling live sharing/i)).toBeInTheDocument();
    // Let the QR code promise resolve: it must still not be shown
    await act(async () => {});
    expect(screen.queryByLabelText('Invite Link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /share link/i })).not.toBeInTheDocument();
    expect(screen.queryByAltText('Game Invite QR Code')).not.toBeInTheDocument();
  });

  it('should keep the link hidden when the upload fails', async () => {
    mockGame({ enableSharing: jest.fn().mockResolvedValue(false) });
    renderModal();

    await screen.findByRole('alert');
    expect(screen.queryByLabelText('Invite Link')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Game Invite QR Code')).not.toBeInTheDocument();
  });

  it('should report a failed QR download inline instead of with a browser alert', async () => {
    const invite = jest.requireMock('@/lib/invite');
    invite.downloadQRCode.mockRejectedValueOnce(new Error('blocked'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockGame({ isSharingEnabled: true });
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByRole('button', { name: /download qr code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t be saved/i);
    expect(alertSpy).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
