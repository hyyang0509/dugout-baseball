# DUGOUT repository instructions

This GitHub repository is the canonical source for future development. Read README.md and docs/HANDOFF.md before changes. Communicate with the owner in Traditional Chinese.

- The published app is a dependency-free static app in dist/. Do not rewrite its framework unless requested.
- GitHub Actions runs npm test before publishing dist/ to Pages. Do not publish the repository root or add Sites project identity files.
- Preserve existing saves. Hydrate playerPool with seasonData before migrating or validating a franchise. Never silently discard a failed load.
- Keep initial baseData separate from evolved season data so restarting returns to the original roster.
- Keep game randomness seeded, trades and financial updates validated, and every lineup legally covering all nine positions.
- Run npm test for engine changes; use browser QA for meaningful UI changes when browser tools are available. Do not claim tests passed without running them.
- Player saves, credentials, browser state and .env files must never be committed.
- Only MLB is implemented. NPB, KBO, CPBL and interleague play remain planned. PRD.md includes unimplemented requirements; docs/HANDOFF.md describes actual behavior.
- Fictional crime stories must never name real players. Clearly label simulated news, generated prospects, estimated ratings and game-only salaries.
- Moving code or publishing a new URL does not migrate localStorage saves or provide cloud synchronization. Preserve the old site until a separately validated save migration exists.
