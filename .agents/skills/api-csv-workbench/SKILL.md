---
name: api-csv-workbench
description: Run this repository's bounded location-footprint API search batches, resume committed pages and export deduplicated hosts with match provenance. Use only for this local CSV workflow, not generic scraping or provider MCP integration.
---

# API-to-CSV workbench operation

The command is package-local. Use the absolute `api-csv.cmd` on Windows or `node /absolute/package/src/cli.mjs`. No global installation is required or authorized by this guide.

1. Run `doctor --json`. Offline mode needs no auth. Live auth availability is environment presence only, not a validated paid account.
2. Run `plan` with exact input paths and bounded query/page/attempt limits. Inspect expanded syntax and leave request budget for account checks and retries.
3. Run the fixture batch into a new `--db`, read `status`, and `export` to a new directory. Inspect `run-summary.json` and manifest hashes alongside the CSVs.
4. Use `resume` only with the same parsed inputs/provider/limits and remaining attempts. After a real crash, verify the recorded PID ended before `--recover-lock`. Never remove an active lock or reset a database for cleanliness.
5. For acceptance, run `npm run check`, `npm test`, `npm run demo`. Tests include actual HTTP sockets and process exits; they do not validate a paid provider or buyer data.

```powershell
C:\package\api-csv.cmd doctor --json
C:\package\api-csv.cmd plan --locations C:\inputs\locations.csv --footprints C:\inputs\footprints.csv --max-pages 5 --max-requests 100 --json
C:\package\api-csv.cmd run --locations C:\inputs\locations.csv --footprints C:\inputs\footprints.csv --db C:\runs\new.sqlite --json
C:\package\api-csv.cmd resume --locations C:\inputs\locations.csv --footprints C:\inputs\footprints.csv --db C:\runs\new.sqlite --json
C:\package\api-csv.cmd status --db C:\runs\new.sqlite --json
C:\package\api-csv.cmd export --db C:\runs\new.sqlite --out C:\exports\new --json
```

JSON envelopes: success `{ok:true,result:...}`, validation failure `{ok:false,error:{code,message,details}}`. Run-level upstream errors preserve committed rows and return state `partial` or `failed` with nonzero exit. Run/export exit2 is partial, exit1 failed. Read the state, exit code and per-query outcomes together.

Live mode uses `--provider publicwww`, the fixed HTTPS provider origin and the `PUBLICWWW_API_KEY` environment variable. Never provide keys in flags, input CSV, exported files or source. Fixture/loopback mode sends no real authorization. Do not obtain credentials, buy a plan or run paid searches without explicit task authority and client-owned access. Request budget, page cap and provider depth limits cannot be silently expanded under the existing fingerprint. No public sharing, crawler, enrichment, outreach, global skill/PATH or MCP configuration change follows from this local guide.
