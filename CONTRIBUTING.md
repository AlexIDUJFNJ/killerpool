# Contributing to Killerpool

Thank you for your interest in contributing to Killerpool! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Questions?](#questions)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for everyone. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 22.x (see `engines` in package.json)
- npm (the lockfile is `package-lock.json`; `.npmrc` sets `legacy-peer-deps`, see the comment there before changing it)
- Git
- A Supabase account (for database features)
- The [Supabase CLI](https://supabase.com/docs/guides/cli), only if you change the database

### Setup

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/killerpool.git
cd killerpool
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` with your Supabase credentials. See [supabase/README.md](./supabase/README.md) for setup instructions.

4. **Run the development server**

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the app.

## Development Workflow

### Branching Strategy

- `main` — production; this is what Vercel deploys
- `dev` — integration branch; work lands here before it reaches `main`
- `feature/…`, `fix/…`, `docs/…` — one branch per task

Changes reach `main` **through a pull request only**. `origin` points at the
Entire mirror, which rejects a direct push to `main` regardless of what branch
protection GitHub itself has. Merge with `gh pr merge --merge`, not `--rebase`:
a rebase rewrites the commit hashes that Entire checkpoints refer to.

### Creating a Branch

```bash
git checkout -b feature/your-feature-name
```

### Making Changes

1. Make your changes in your feature branch
2. Test your changes locally
3. Commit your changes (see [Commit Guidelines](#commit-guidelines))
4. Push to your fork
5. Open a Pull Request

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode in `tsconfig.json`
- Add proper type annotations
- Avoid `any` types when possible

### React/Next.js

- Use functional components with hooks
- Follow the [Next.js App Router](https://nextjs.org/docs/app) conventions
- Use Server Components by default, Client Components (`'use client'`) only when needed
- Place components in appropriate directories:
  - `app/` - Next.js pages and layouts
  - `components/ui/` - Reusable UI components (shadcn/ui)
  - `components/game/` - Game-specific components
  - `lib/` - Utility functions and helpers

### Styling

- Use Tailwind CSS for styling
- Follow the existing color scheme (emerald/green theme)
- Use shadcn/ui components when available
- Ensure responsive design (mobile-first)
- Test on multiple screen sizes

### File Naming

- Every file is `kebab-case`: components too (`player-card.tsx`, `swipeable-player-card.tsx`), utilities (`game-logic.ts`), hooks (`use-realtime-game.ts`)
- The component a file exports is `PascalCase` (`export function PlayerCard`)
- Pages and route files follow Next.js conventions (`page.tsx`, `layout.tsx`, `route.ts`, `opengraph-image.tsx`)
- Tests sit in a `__tests__/` directory next to the code, as `<file>.test.ts(x)`

### Code Formatting

ESLint 9 (flat config, `eslint.config.mjs`) checks the code. Run it before committing:

```bash
npm run lint
```

Prettier is configured too (`.prettierrc`: no semicolons, single quotes, width
100; `eslint-config-prettier` turns off the ESLint rules that would fight it;
Markdown is excluded in `.prettierignore`). Most of the codebase predates it,
so `npm run format:check` currently reports a large share of files. Format the
files you change (`npx prettier --write <files>`) and leave unrelated files
alone: a repository-wide `npm run format` belongs in a commit of its own, not
mixed into a fix.

## Agent session capture (Entire)

The repository is set up for [Entire](https://docs.entire.io), which records the
context behind AI-assisted changes — prompts, tool calls and diffs — as
checkpoints tied to commits. That is why `.entire/settings.json` and the Claude Code hooks
in `.claude/settings.json` are committed. Cloning installs nothing: git hooks
are local, and `entire enable` is what writes them into `.git/hooks`.

Transcripts do **not** go into this repository. `checkpoint_remote` points at a
separate private repo, because this one is public and Entire states that its
secret redaction is best-effort rather than a guarantee. The `git-refs` backend
stores one ref per checkpoint, so the working history stays clean.

To take part, install the CLI and enable it in your clone:

```bash
curl -fsSL https://entire.io/install.sh | bash
entire login
entire enable --agent claude-code
```

Two things to know, both learned the hard way:

- Run `entire enable` **inside the repository**. In a directory that is not a
  git repo it offers to create one, which is how a stray repository ends up in
  a home directory.
- Enabling it part-way through an agent session captures nothing for that
  session: checkpoints attach to a session that is registered when the session
  starts. Commits made before that point have no checkpoint.
  `entire import claude-code` backfills past transcripts, but as read-only
  history — not linked to commits and without generated summaries.

Contributing without Entire is fine. Without `entire enable` there are no git
hooks, and the Claude Code hooks in `.claude/settings.json` exit quietly when
the CLI is not installed.

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(game): add life tracking animation
fix(auth): resolve Google OAuth redirect issue
docs(readme): update installation instructions
style(ui): improve button hover states
refactor(storage): optimize localStorage usage
```

## Pull Request Process

1. **Update documentation** - Update README.md or other docs if needed
2. **Test your changes** - Ensure everything works locally
3. **Describe your changes** - Provide a clear description in the PR
4. **Link issues** - Reference any related issues (e.g., "Fixes #123")
5. **Wait for review** - A maintainer will review your PR
6. **Address feedback** - Make requested changes if needed
7. **Merge** - Once approved, your PR will be merged

### PR Template

```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] Tested locally
- [ ] Tested on mobile devices
- [ ] Works offline (if PWA-related)

## Screenshots (if applicable)
Add screenshots for UI changes

## Related Issues
Closes #(issue number)
```

## Testing

### Manual Testing

1. Test on different browsers:
   - Chrome/Edge
   - Safari (especially on iOS)
   - Firefox

2. Test on different devices:
   - Desktop
   - Tablet
   - Mobile (iOS and Android)

3. Test PWA features:
   - Install to home screen
   - Offline functionality
   - Push notifications (when implemented)

### Automated Testing

The project uses Jest 30 with jsdom and Testing Library, wired through `next/jest`:

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

Tests live next to the code they cover, in `__tests__/` directories, named
`*.test.ts` / `*.test.tsx`. Setup lives in `jest.config.ts` and `jest.setup.ts`.
Coverage is collected from `app/`, `lib/`, `components/`, `hooks/` and
`contexts/` (`collectCoverageFrom` in `jest.config.ts`). `contexts/` was added
deliberately: the state machine that lives there is where the real bugs were,
and for a long time it was not even measured. Pages under `app/` have tests of
their own now (auth, new game, game screen, history, stats).

New code under `lib/` is expected to come with tests. Pure logic is the priority
— the game rules in `lib/__tests__/game-logic.test.ts` are, in practice, the
specification of how Killer Pool behaves here. The write path (`lib/sync.ts`,
`contexts/game-context.tsx`) is the second priority: most of the bugs fixed so
far lived there, and for a long time a fully green suite noticed none of them.

`jest.setup.ts` deliberately does **not** stub `localStorage` / `sessionStorage`.
jsdom provides both, separately; the old stub handed out one shared object for
the two, so the `sessionStorage` tests were quietly asserting against
`localStorage`. Both stores are cleared in a global `beforeEach` instead.

Database changes have their own harness, outside Jest: `./supabase/test/setup-local.sh`
brings up a throwaway Postgres and applies every migration from scratch, and
`supabase/test/rls-policies.sql` exercises the policies under the real roles.
Run both before sending a migration to production.

### Database changes

- A change to the schema is a new numbered file in `supabase/migrations/`.
  Never edit a migration that has already been applied.
- It reaches production through `supabase db push`, not the SQL Editor:
  anything applied by hand is missing from the migration history, and the next
  push tries to apply it again. See [DEPLOYMENT.md](./DEPLOYMENT.md#supabase-cli)
  for the one-time history repair and the CLI setup.
- After the migration is applied, regenerate the types and commit them with
  the change: `npx supabase gen types typescript --linked --schema public > lib/types/database.types.ts`.
  The file is generated; do not edit it by hand.

End-to-end tests are not set up. See the Planned section of ARCHITECTURE.md.

## Project Structure

```
killerpool/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   ├── error.tsx           # Error boundary
│   ├── loading.tsx         # Loading state
│   ├── not-found.tsx       # 404 page
│   ├── auth/               # Sign-in page, error codes, OAuth callback
│   ├── game/               # New game, game screen (host and spectator)
│   ├── history/            # Game history and game details
│   ├── leaderboard/        # Leaderboard
│   ├── stats/              # Personal stats
│   ├── profile/            # User profile
│   ├── help/               # Rules and gestures
│   └── offline/            # Service-worker offline fallback
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   ├── game/               # Game-specific components, shot styles
│   ├── achievements/       # Achievement cards and toasts
│   ├── leaderboard/        # Leaderboard list and cards
│   └── theme.ts, theme-toggle.tsx  # Light / Dark / System theme
├── lib/                    # Utilities and helpers
│   ├── supabase/           # Supabase clients
│   ├── types/              # Generated database types
│   ├── game-logic.ts       # Game logic
│   ├── storage.ts          # localStorage helpers
│   └── sync.ts             # Writes to Supabase, retry queue
├── contexts/               # React context (game state)
├── hooks/                  # Shared hooks
├── supabase/
│   ├── migrations/         # SQL migrations
│   ├── debug/              # SQL Editor queries for debugging
│   └── test/               # Local Postgres harness + RLS checks
├── public/                 # Static files
├── scripts/                # Icon generation, bundle size report
├── docs/archive/           # Historical material, not current
├── instrumentation.ts      # Sentry (server + edge)
├── instrumentation-client.ts # Sentry (browser)
└── proxy.ts                # Next.js middleware (auth session refresh)
```

## Areas for Contribution

The open items live in one place, the "Planned / Not implemented" section of
[ARCHITECTURE.md](./ARCHITECTURE.md) — keeping a second list here is how the
previous one ended up advertising features that had already shipped.

## Questions?

If you have questions or need help:

1. Check existing [Issues](https://github.com/AlexIDUJFNJ/killerpool/issues)
2. Read the documentation index in [README.md](./README.md)
3. Open a new issue with the `question` label

## License

By contributing to Killerpool, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Killerpool! 🎱
