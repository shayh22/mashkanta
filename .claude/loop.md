# Autonomous continuation prompt

קרא את `PROGRESS.md` ואת `ROADMAP.md`, אתר את היכולת הבאה שטרם הושלמה או הזדקקה לשיפור, פתח ענף ייעודי, פתח ובדוק מקצה לקצה, מזג ל-`main` לאחר מעבר כל הבדיקות, ועדכן את `PROGRESS.md`.

Operational notes for the agent running this loop:

- Integration branch: in the cloud sessions this repository is driven from, pushes are only allowed to
  the session's designated branch (currently `ccr-1d01b418-me6yck`). Feature branches
  (`feat/<slug>`) are created locally, merged with `--no-ff` into the integration branch, and the
  integration branch is pushed. `main` is updated by merging that branch through a pull request.
- Gate before every merge, run from `frontend/`: `npm test`, `npm run typecheck`, `npm run lint`,
  `npm run build`. All four must pass with zero errors.
- Append a dated entry to `PROGRESS.md` with the test counts and what changed.
- When ROADMAP.md is fully done, spend the round on test coverage, performance or a11y, and record it.
