# CLAUDE.md

SWARM is a browser dot-swarm RTS: TypeScript, Vite, WebGL2, with a deterministic sim and lockstep multiplayer. The [README](README.md) is the manual, so read the section you need there instead of guessing:
- **Development:** setup, commands, dev URL flags (`?debug`, `?net=local`, `?lag=`, …)
- **Tools:** headless probes, with the shared `TERRAIN`/`CAVES`/`BOT`/… env options
- **How it plays:** game rules
- **Architecture:** module map

## Commands
- `npm run check`: typecheck, then all tests. CI runs this, and it must pass before a change counts as done.
- `npx vitest run tests/<file>.test.ts`: run one suite while iterating.
- `npx vite-node scripts/<probe>.ts …`: headless bot matches for balance questions. Each script's header comment lists its arguments.
- The dev server is the `swarm-dev` entry in `.claude/launch.json`, at port 5173.

## The sim is deterministic: never break that
`src/sim/` must give bit-identical results for the same seed and command log, on V8 and on JavaScriptCore. Lockstep multiplayer, replays and desync detection all depend on it.
- No DOM, `Math.random`, `Date.now`/`performance.now`, or other wall-clock or environment reads in `src/sim/`. Use `src/sim/rng.ts`, and use `src/sim/mathx.ts` for trig.
- Players and bots change the world only through `Command`s (`src/sim/commands.ts`). Bots issue the same commands humans do.
- `fx` events are render output and are never hashed. Don't add sim state that only the client sees.
- Iteration order must be deterministic. Ties in sorts and searches need an explicit tiebreak, such as the index.
- CI diffs `scripts/hashtrace.ts` output between Node and Bun. If you touch math in the sim, run it locally the way `.github/workflows/ci.yml` does.
- Any wire format change bumps `PROTOCOL_VERSION` in `src/net/protocol.ts`.

### Sim changes in a PR
- If a change alters outcomes (bot behaviour, hashes, balance), the PR must say so and say what it affects: old replays stop reproducing, and peers on another build are refused.
- When practical, keep sim changes and presentation-only changes (render, HUD, CSS, audio) in separate commits.
- **Ask before changing balance numbers** in `src/sim/constants.ts` or bot/personality knobs. Propose the change along with probe numbers, then wait for an OK.

## Campaign and tutorial
- Tutorial missions are in `src/game/tutorial.ts`. `tests/tutorial.test.ts` plays every mission headlessly, and it must keep passing. A changed or new mission needs its scripted playthrough updated or added there.
- The procedural campaign is in `src/campaign/`. Its design doc is `docs/campaign.md`: read it before changing campaign structure, and update it when the design changes.
- Campaign balance has its own tools: `run-probe`, `reward-probe` and the surrogate (README > Tools > Campaign balance). If you change battle code, re-run `scripts/balance/validate.ts`.
- Saved progress lives in localStorage (`src/campaign/store.ts`, and the tutorial's `loadProgress`). Changes must still load saves from older builds.

## TURN worker (`workers/turn/`)
- It's a separate Cloudflare Worker with its own `package.json`. Deploy steps are in README > Multiplayer > The relay.
- **Never deploy it**, never run `wrangler` commands that change anything (`deploy`, `secret put`, …), and never touch secrets. You can edit its code, but ask before you do, and the user deploys it.
- Secrets never go in the repo. That includes `wrangler.toml` and `.env.local`.

## Long runs
- Run anything likely to take more than about 2 minutes in the background: the full suite on a slow machine, probes, balance sweeps. Keep working while it runs, and report the results when it finishes.
- Probe results are cached in `.balance-cache/`. Use `NOCACHE=1` only when you need fresh runs.

## Definition of done
1. `npm run check` passes.
2. Each behaviour change or bug fix comes with a headless test that covers it (see `tests/helpers.ts` and `tests/rig.ts` for builders).
3. Visible changes get checked in the dev server, at desktop width and at phone width (`body.mobile` layout), with a screenshot. `?debug` exposes `window.swarm`.
4. Sim or bot tuning changes include before/after numbers from the relevant probe in the PR.

If you skipped a step or couldn't do it, say so in the PR's Testing section.

## Code
- Strict TypeScript. Follow the style of the surrounding code: dense, typed arrays in the sim, small exported functions.
- Comments explain *why* and cite the issue they came from, e.g. `// The opening (#235): …`.
- Don't keep growing the giant files (`main.ts`, `gameView.ts`, `mapgen.ts`, `campaign.ts`, `match.ts`, `lobby.ts`). Put new features in a new module and wire them in.
- **Ask before adding any npm dependency.** The game makes no network requests and must stay workable offline.
- The UI has two modes, desktop and `body.mobile` (touch layout and touch wording). New UI must work in both.

## Git and GitHub
- One branch per issue: `feat/`, `fix/`, `chore/` or `docs/`, then `<issue>-<slug>`, e.g. `fix/250-dom-leader`. Branch from `main`.
- Commit locally whenever it makes sense. **Ask before pushing or opening a PR.**
- Commit and PR titles: `Area: what changed (#issue)`, e.g. `Domination: near-win banner and a readable key strip (#254)`. Commit bodies are short bullets.
- Changes after review go in new commits titled `Area: review fixes (#n)`. Never rewrite pushed history. PRs land as merge commits.
- PR body, following recent PRs:
  - `Fixes #n.`
  - `## The bug` (for fixes) or a short why
  - `## Changes` as bullets
  - `## Testing`: what ran, test counts, browser checks, anything not verified
  - `Follow-ups:` for related issues
- Fix only what's in scope. Problems you find along the way go under Follow-ups or into a new issue.

## Docs
- A PR that adds a URL flag, script, env option or player-facing mechanic also updates the matching README section.
- Write plainly: short sentences, no filler or marketing words. This applies to code comments, commits, PRs and the README.
