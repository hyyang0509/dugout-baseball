# DUGOUT repository instructions

This GitHub repository is the canonical source for future development. Read README.md and docs/HANDOFF.md before changes. Communicate with the owner in Traditional Chinese.

- The published app is a dependency-free static app in dist/. Do not rewrite its framework unless requested.
- GitHub Actions runs npm test before publishing dist/ to Pages. Do not publish the repository root or add Sites project identity files.
- A merge is not a release: after a PR merges, check that the "Test and deploy DUGOUT" run on main succeeded (including the deploy job) before saying the site is updated. To publish again, start a new run (workflow_dispatch on main); do not "re-run failed jobs" on a Pages run, which leaves two github-pages artifacts and fails again.
- Preserve existing saves. Hydrate playerPool with seasonData before migrating or validating a franchise. Never silently discard a failed load.
- Keep initial baseData separate from evolved season data so restarting returns to the original roster.
- Keep game randomness seeded, trades and financial updates validated, and every lineup legally covering all nine positions.
- Run npm test for engine changes; use browser QA for meaningful UI changes when browser tools are available. Do not claim tests passed without running them.
- Player saves, credentials, browser state and .env files must never be committed.
- MLB, NPB, KBO and CPBL run together in one world save (separate league seasons). Interleague play remains planned. PRD.md includes unimplemented requirements; docs/HANDOFF.md describes actual behavior.
- Fictional crime stories must never name real players. Clearly label simulated news, generated prospects, estimated ratings and game-only salaries.
- Moving code or publishing a new URL does not migrate localStorage saves or provide cloud synchronization. Preserve the old site until a separately validated save migration exists.
