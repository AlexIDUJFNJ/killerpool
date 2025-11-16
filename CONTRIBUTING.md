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

- Node.js 20.x or higher
- npm or yarn
- Git
- A Supabase account (for database features)

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

- `main` - Production-ready code
- `develop` - Development branch (if applicable)
- `feature/your-feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/description` - Documentation updates

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

- React components: `PascalCase.tsx` (e.g., `PlayerCard.tsx`)
- Utilities/helpers: `kebab-case.ts` (e.g., `game-logic.ts`)
- Pages: Next.js conventions (`page.tsx`, `layout.tsx`, etc.)

### Code Formatting

We use ESLint for linting. Run the linter before committing:

```bash
npm run lint
```

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

Currently, we don't have automated tests. Contributions to add testing infrastructure are welcome!

**Potential testing tools:**
- Vitest for unit tests
- Playwright or Cypress for E2E tests
- React Testing Library for component tests

## Project Structure

```
killerpool/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   ├── error.tsx           # Error boundary
│   ├── loading.tsx         # Loading state
│   ├── not-found.tsx       # 404 page
│   ├── auth/               # Authentication pages
│   ├── game/               # Game pages
│   ├── history/            # Game history
│   └── profile/            # User profile
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   └── game/               # Game-specific components
├── lib/                    # Utilities and helpers
│   ├── supabase/           # Supabase clients
│   ├── types/              # TypeScript types
│   ├── game-logic.ts       # Game logic
│   └── storage.ts          # Storage helpers
├── contexts/               # React contexts
├── supabase/               # Supabase configuration
│   └── migrations/         # SQL migrations
├── public/                 # Static files
└── docs/                   # Documentation
```

## Areas for Contribution

We welcome contributions in these areas:

### High Priority
- [ ] PWA offline functionality improvements
- [ ] Game history export (CSV, PDF)
- [ ] Realtime multiplayer features
- [ ] Statistics and analytics
- [ ] Accessibility improvements

### Nice to Have
- [ ] Unit and integration tests
- [ ] Light mode theme
- [ ] Additional social auth providers (Apple, GitHub)
- [ ] Achievements and badges
- [ ] Custom game rules/rulesets
- [ ] Internationalization (i18n)

## Questions?

If you have questions or need help:

1. Check existing [Issues](https://github.com/yourusername/killerpool/issues)
2. Read the documentation in `/docs` and `/supabase/README.md`
3. Open a new issue with the `question` label

## License

By contributing to Killerpool, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Killerpool! 🎱
