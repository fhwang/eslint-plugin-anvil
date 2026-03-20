# eslint-plugin-anvil

## Worktree preference
Use `.worktrees/` (project-local, hidden) for git worktrees.

## Commands
- Build: `pnpm run build`
- Test: `pnpm test`
- Lint: `pnpm run lint` (builds first, then lints with self-referential plugin + strict rules)
- Type check: `pnpm run typecheck`
- Check types: `pnpm run check-types` (runs forbid-junk-object-types)

## Notes
- Lint requires build first because the ESLint config imports the built plugin for self-linting.
- The `lint` script handles this automatically via `pnpm run build && eslint .`.
