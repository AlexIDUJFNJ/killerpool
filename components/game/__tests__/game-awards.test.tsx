/**
 * Tests for GameAwards: the awards and match stats of a finished game
 */

import { render, screen, within } from '@testing-library/react';
import { GameAwards } from '../game-awards';
import { createGame, applyAction, abandonGame } from '@/lib/game-logic';
import { Game, GameAction } from '@/lib/types';

const ACTIONS: Record<string, GameAction> = { p: 'pot', x: 'miss', b: 'pot_black' };

/** Shots as "<player><shot>", p pot, x miss, b black (see lib/__tests__/game-insights.test.ts) */
function play(game: Game, shots: string): Game {
  return shots.split(' ').reduce((g, shot) => {
    const index = g.players.findIndex((p) => p.name === shot[0]);
    return applyAction({ ...g, currentPlayerIndex: index }, ACTIONS[shot[1]]);
  }, game);
}

function newGame(...names: string[]): Game {
  return createGame(names.map((name) => ({ name, avatar: '🎱' })));
}

/** A pots six (four in a row) and wins, B pots two blacks, C goes out first */
const showcase = () =>
  play(newGame('A', 'B', 'C'), 'Ap Bb Cx Ap Bb Cx Ap Bx Cx Ap Bx Ax Bx Ap Bx Ap Bx');

function awardCards() {
  const list = within(screen.getByRole('region', { name: 'Awards' })).getByRole('list');
  return within(list).getAllByRole('listitem');
}

function statRows() {
  const table = within(screen.getByRole('region', { name: 'Match stats' })).getByRole('table');
  // The first row is the header
  return within(table).getAllByRole('row').slice(1);
}

describe('GameAwards', () => {
  it('should show each award with its winner and what earned it', () => {
    render(<GameAwards game={showcase()} />);

    const cards = awardCards();
    expect(cards.map((card) => card.textContent)).toEqual([
      '🏅MVP🎱A6 balls potted',
      '🔥Hot Streak🎱Astreak of 4',
      '🎱Black Ball Master🎱B2 blacks',
      '🎯Sniper🎱A86% · 6 of 7',
      '🚪First Out🎱Cout after 3 turns',
    ]);
  });

  it('should let the first award take a whole row when the count is odd', () => {
    render(<GameAwards game={showcase()} />);

    const [first, second] = awardCards();
    expect(first).toHaveClass('col-span-2');
    expect(second).not.toHaveClass('col-span-2');
  });

  it('should list the players in finishing order with their places and numbers', () => {
    render(<GameAwards game={showcase()} />);

    const rows = statRows();
    const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent);

    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('AWinner · 7 turns');
    expect(cells(rows[0])).toEqual(['6', '1', '0', '4']);
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('B2nd · 7 turns');
    expect(cells(rows[1])).toEqual(['2', '5', '2', '2']);
    expect(within(rows[2]).getByRole('rowheader')).toHaveTextContent('C3rd · 3 turns');
    expect(cells(rows[2])).toEqual(['0', '3', '0', '0']);
  });

  it('should name the columns, the streak one in full for screen readers', () => {
    render(<GameAwards game={showcase()} />);

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Player', 'Potted', 'Missed', 'Blacks', 'Best Streak']);
  });

  it('should say so when a finished game earned no awards', () => {
    render(<GameAwards game={play(newGame('A', 'B'), 'Ap Bx Ap Bx Ax Bx')} />);

    expect(screen.getByText(/no awards this game/i)).toBeInTheDocument();
    expect(statRows()).toHaveLength(2);
  });

  it('should give an abandoned game its stats but no awards', () => {
    const game = abandonGame(play(newGame('A', 'B', 'C'), 'Ap Ap Ap Bx Bx Bx'));
    render(<GameAwards game={game} />);

    expect(screen.queryByRole('region', { name: 'Awards' })).not.toBeInTheDocument();
    const rows = statRows();
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('A3 lives left · 3 turns');
    expect(within(rows[2]).getByRole('rowheader')).toHaveTextContent('BOut 1st · 3 turns');
  });

  it('should show nothing for a game nobody has played yet', () => {
    const { container } = render(<GameAwards game={newGame('A', 'B')} />);

    expect(container).toBeEmptyDOMElement();
  });
});
