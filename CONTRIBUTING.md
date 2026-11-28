# Contributing

This project follows a unified development workflow shared across the
maintainer's repositories (adopted from aegis-app/aegis-bot).

## Development workflow

1. **Open an issue first.** Every change starts with an issue (use the
   issue templates). Describe the purpose, the planned work, and the
   definition of done.
2. **Create a branch from `main`** named `<type>/<issue-number>-<slug>`,
   e.g. `feat/12-new-sound`, `fix/9-timer-display`, `docs/3-readme`.
3. **Implement and test.** Run the checks locally before opening a PR:
   - `npm test` (unit tests for the pure logic in `js/mixer-core.js`)
   - `node --check` on the JavaScript files
4. **Open a pull request.** Fill in the PR template and link the issue
   with `Closes #<number>`.
5. **Merge with "Rebase and merge"** to keep the history of `main`
   linear, then delete the branch.

## Commit messages

Commit messages use **Conventional Commits with English subjects**:

```
feat: add a new ambient sound
fix: stop the sleep timer display from drifting
docs: update documentation for v1.0.0
```

Types in use: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`.

## Releases

Releases are cut from `main`: bump the version, tag `vX.Y.Z`, and publish
a GitHub Release with notes only (no binaries are attached).

## Project notes

- There is no build step and there are no runtime dependencies; the site
  is plain HTML/CSS/JavaScript. Keep it that way unless an issue decides
  otherwise.
- Do not change the localStorage keys (`otoya-settings-v1`,
  `otoya-theme`) or the saved JSON shape: existing users' settings must
  keep loading.
- Never commit secrets. Local Vercel state (`.vercel/`, `.env.local`) is
  git-ignored.
