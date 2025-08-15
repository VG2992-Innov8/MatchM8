# Contributing to MatchM8

Thanks for helping improve MatchM8! This doc explains how to run the project locally, propose changes, and keep things tidy.

---

## Quick Start (Local Dev)

1. Clone the repo (or pull latest via GitHub Desktop).
2. Create `.env` from `.env.example` and set values (do **not** commit `.env`).
3. Install deps:
   ```bash
   npm install
Run:

npm run dev
# open http://localhost:3000


Node 20+ is recommended. The repo commits package-lock.json so installs are reproducible.

Branches & Commits

If you’re solo, committing to main is fine. Otherwise:

Create feature branches like feat/prediction-lock, fix/pin-verify.

Keep PRs small and focused.

Commit message style (use any that’s clear; Conventional is preferred):

feat: add weekly email reminders
fix: handle empty player list
chore: bump deps
docs: update README

Pull Requests

Ensure npm ci (or npm install) succeeds locally.

Run the app once to sanity-check.

Open a PR:

Describe what changed and why.

Link related issues (e.g., “Closes #12”).

Wait for CI (GitHub Actions) to pass.

Code Style & Files

Keep secrets out of git (.env is ignored). If a secret leaks, rotate it.

Normalize line endings via .gitattributes (already in repo if added).

Prefer small, testable functions; keep routes/controllers lean.

Testing (lightweight for now)

If you add tests, use whatever you prefer (Jest, Vitest). Wire npm test so CI can run it. It’s fine to start with a minimal smoke test.

Issues & Roadmap

Use the Issues tab to propose features or report bugs.

Tag enhancements as enhancement, bugs as bug, and questions as question.

See the roadmap issue for priorities.

Security

Never commit API keys or tokens.

Use environment variables from .env.

If you discover a security issue, open an issue with Security label (or contact the maintainer privately).

License

By contributing, you agree your contributions are licensed under the repository’s MIT License.


If you want, I can also add a tiny **PR template** and **Issue templates** so new tasks auto-populate with c
