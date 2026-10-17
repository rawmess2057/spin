# Spin — a provably fair Solana chips casino

Players buy chips (💎, 1 💎 = 0.0001 SOL) into an on-chain vault and play
against a house treasury. Every bet is settled by a two-step commit-reveal:
the player places the bet with a client seed, the house's crank reveals the
next link of a pre-committed hash chain, and the program derives the result
from both. The browser replays every settlement with the same evaluator and
refuses to show a payout that doesn't match the chain.

| Game | Id | Route | Math |
| --- | --- | --- | --- |
| Plinko | 7 | `/plinko` | 8–16 rows, Low/Med/High curves, 97% RTP |
| Gem Rush (Megaways) | 8 | `/megaways` | 6 reels × 2–7 rows, cascades, free spins, 10,000× cap, ~96% RTP |
| Spin Wheel | 9 | `/wheel` | 24 segments, three risk tables, 97% RTP |
| Dragon's Vault (Hold & Spin) | 10 | `/hold-spin` | 5×3, 20 lines, coin respins, 1,000× GRAND, ~96% RTP |

Without a wallet every game runs in demo mode on practice chips.

## Layout

```
programs/spin/            Anchor program (commit-reveal bets, vaults, game registry)
  src/games/              evaluate / validate_target / max_multiplier_bp per game
  tests/                  litesvm integration tests + TS-parity fixtures
frontend/                 Next.js 16 + @solana/kit v7 app
  app/lib/solana/games/   TypeScript evaluators (the specification; mirrored in Rust)
  app/lib/hooks/          use-vault-spin (on-chain), use-demo-spin (practice)
  scripts/                make-fixtures, megaways/holdspin sims and selftests
scripts/                  house tooling: init-house, settle/ (chain + crank)
```

## Run it locally (devnet)

```bash
# 1. Program
anchor build
cargo test -p spin                         # unit + litesvm + parity
cd frontend && npm run codegen && cd ..    # regenerate the kit client from target/idl/spin.json
solana program deploy --program-id target/deploy/spin-keypair.json target/deploy/spin.so

# 2. House bootstrap (authority = your solana CLI keypair)
cd scripts && npm install
cp .env.example .env && set -a && . ./.env && set +a
TREASURY_SOL=10 npm run init-house         # treasury, ledger, game limits 7–10
npm run generate-chain                     # settle/data/chain.json (keep it secret)
npm run init-chain                         # publishes the genesis commitment
npm run settle                             # the crank; GET http://127.0.0.1:8788/health
npm run smoke                              # (another shell) deposit + bet + wait for settlement + verify

# 3. Frontend
cd ../frontend && npm install
cp .env.example .env.local
npm run dev                                # http://localhost:3000
```

Connect a wallet on devnet, press the 💎 pill to buy chips (one approval
funds the session key, deposits and arms it), then play. The "Provably
fair" button on each game shows the commitment, client seed, reveal and a
one-click in-browser recompute.

## Developing

- `npm run ci` in `frontend/` = build + lint + format check.
- `npx tsx scripts/make-fixtures.ts` (frontend) refreshes
  `programs/spin/tests/fixtures/*.txt`; `cargo test -p spin --test parity`
  checks the Rust evaluators against them.
- `npm run sim:megaways -- --spins 1000000`, `npx tsx scripts/holdspin-sim.ts`
  tune RTP; `npx tsx ../scripts/plinko-calibrate.ts` prints the Plinko tables.
- When a chain nears exhaustion the crank warns; run `npm run rotate-chain`
  in `scripts/` once no bets are open, then restart the crank.

## Safety model (short)

- A bet's maximum payout is reserved against the free bankroll
  (treasury − rent − player credits − reservations, ÷ 4) before it is
  accepted; the house can never owe more than it holds.
- Bets settle strictly in order. If the house stalls, anyone can cancel
  the head bet after 150 slots; the stake is refunded and `chain.stalls`
  counts it publicly.
- Session keys hold a net-loss allowance (stakes consume it, wins and
  refunds restore it), expire after ~a day, and can never withdraw.
