# API-to-CSV Workbench

Turn editable locations and search footprints into a bounded, resumable batch and two inspectable CSVs: one row per normalized host, plus every distinct query match that explains how it was found.

AI-assisted personal work sample. Synthetic examples and local HTTP acceptance tests run without customer data, a paid API or a model. The PublicWWW REST adapter follows current first-party documentation; paid-account behavior and real buyer inputs remain unverified. This is a CLI with Windows launchers, not a GUI or a completed client contract.

## Try it

Requires Node **24.15.0 or a later Node 24 release**. There are zero third-party runtime or development packages and no install step. In PowerShell, from this folder:

```powershell
.\api-csv.cmd doctor --json
.\api-csv.cmd plan --locations fixtures/locations.csv --footprints fixtures/footprints.csv --json
.\api-csv.cmd demo --out outputs/my-first-demo --json
```

Double-click `Run-Demo.cmd` for a synthetic demonstration that pauses to show the result. Its outputs stay under this folder. Node must already be installed and available on PATH. You can call `C:\path\to\api-csv.cmd` from another directory; fixture discovery in `demo` uses the package location. On Linux/macOS use `node /path/to/src/cli.mjs` with the same arguments. No global install, shell profile or PATH edit is performed.

Expected demo: four expanded queries, eight successful page attempts, three distinct hosts and twelve match rows. Full `www` hosts and subdomains remain separate. The hosts are reserved `.test` examples, not real leads.

## Run your next offline batch

```powershell
.\api-csv.cmd run --locations fixtures/locations.csv --footprints fixtures/footprints.csv --db work/first.sqlite --json
.\api-csv.cmd status --db work/first.sqlite --json
.\api-csv.cmd export --db work/first.sqlite --out outputs/first-export --json
```

Inputs are UTF-8 CSV, optionally with BOM. Headers must exactly match the bundled files. IDs are unique ASCII names. A template must include `{location}`. The operator supplies complete, already-proven query syntax, including quotes where wanted; the tool does not guess a location search strategy. Locations cannot contain quotes, backslashes or line breaks. Preview the exact expansions with `plan` before any live execution.

Each run pins the parsed inputs, provider and limits by SHA-256. `resume` requires the same fingerprint. `--max-pages` bounds each query, `--max-queries` bounds expansion and `--max-requests` bounds **all attempts**, including account preflight, retries and resumed attempts. The plan's worst-case search page count excludes retry and account overhead. Leave overhead in the request budget. No automatic infinite quota wait or request-budget extension occurs.

## What comes out

| File | Meaning |
| --- | --- |
| `domains.csv` | One row per normalized full host and distinct match count |
| `matches.csv` | Domain, source URL, rank/ranked, location ID/name, footprint ID, query ID and exact query |
| `run-summary.json` | Complete/partial/failed state, attempts, per-query outcome and reason, account limit metadata |
| `manifest.json` | SHA-256 and byte size of the preceding three files |

Host normalization handles lowercase, IDNA and trailing dots. It deliberately retains `www` and subdomains. Distinct provenance is `(domain, query_id, URL)`, not one flattened row per domain. Repeated identical matches retain the first committed rank observation. CSV is UTF-8 with BOM, CRLF and spreadsheet-formula neutralization. Database values remain exact; dangerous text is prefixed with an apostrophe in exported cells.

Export reads rows and summary in one SQLite snapshot, then writes a new sibling temporary directory and renames it to a new final directory. Existing export directories are refused. A crash before rename leaves an explicitly temporary directory; after rename the complete set is visible. This is tested for process exits, not power failure or filesystem corruption.

## Completeness and resume

Exit 0 means successful complete execution, or a successful read/plan command. Run/export exit 2 means partial coverage; exit 1 means failure. A syntactically valid export of a running/pending run is also partial. Always inspect the summary. `complete` means the bounded query set exhausted provider-disclosed pages within the current documented limits, not full-index coverage, valid contacts or sales outcomes.

Quota/rate/network interruptions preserve committed rows and can resume while the original attempt budget remains. Hard `REQUEST_BUDGET`, page cap and provider depth/truncation limits cannot be extended under the same fingerprint. Choose a new run with reviewed inputs/limits if necessary; it may repeat paid searches and must be planned explicitly. Changed-key authentication recovery can retry under the same non-secret fingerprint.

```powershell
.\api-csv.cmd resume --locations fixtures/locations.csv --footprints fixtures/footprints.csv --db work/first.sqlite --json
```

After an actual process crash, verify it stopped, then add `--recover-lock`. Recovery checks the recorded PID and refuses an active owner. It does not delete the database or partial exports. A reused PID or an invalid lock may require operator inspection.

## Live provider boundary

Live origin is fixed to `https://api.publicwww.com`. Set `PUBLICWWW_API_KEY` in the operator's process environment using their own approved secret-management method; there is no key flag, key file or credential acquisition feature. Never put a key in CSVs or a query. `doctor` only reports presence and does not validate a key or contact the provider.

Use the same `plan`, `run` and `resume` commands with `--provider publicwww`. No live search was run during this project. Before a client handover, verify their paid plan, approved sample queries, query volume, paging behavior and desired output using their own access. See [provider contract](docs/provider-contract.md) and [operator walkthrough](docs/operator-walkthrough.md).

`local-http` accepts only numeric loopback HTTP origins and sends no Authorization header, even if a real key exists in the environment. It exists for acceptance fixtures. Live redirects are refused. No crawler, snippets, enrichment, hosted service, official-provider MCP replacement, outreach or paid API purchase is included.

## JSON and verification

Every result uses `{ "ok": true, "result": ... }`. Validation errors use `{ "ok": false, "error": { "code", "message", "details" } }` and exit 1. `--json` emits one compact object to stdout. Provider error messages, bodies, request URLs and exception stacks are not printed. A run-level provider failure yields a successful state-read envelope whose `state` is `failed` or `partial`, with nonzero process status. Use the state and exit code together. `--help` is plain text.

```powershell
npm run check
npm test
npm run demo
```

[Verification](docs/verification.md), [security limits](SECURITY.md), [provenance](PROVENANCE.md), [agent quickstart](docs/AGENT-QUICKSTART.md). The workflow runs the same source checks on Windows and Ubuntu. CI provenance must be matched to its exact commit before using it as evidence.

## License

Original code and documentation are offered under the MIT license. PublicWWW is a third-party service; its account and service terms remain separate. The sample ships no provider payloads, client records or service entitlement.
