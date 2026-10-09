# Security and privacy boundary

This single-user local sample is not a hosted multi-tenant or production security certification. Use trusted input files and an operator-controlled writable folder. Run state, queries, URLs and exports may be commercially sensitive and are stored locally without encryption. Keep real data out of commits and shared packages. The fixtures contain synthetic reserved `.test` hosts.

The live key is read only from the process environment and sent only to the fixed PublicWWW HTTPS origin. No secret is stored in SQLite or export artifacts. Authorization is never sent in fixture or numeric-loopback HTTP mode. Redirects are refused. Known key reflection anywhere in parsed live JSON is rejected before row ingestion. Provider message/body text and raw exception stacks are never printed. This does not guarantee that arbitrary upstream URLs or client-supplied queries contain no other sensitive data; inspect real input/export before sharing.

Responses have bounded size/time, pagination consistency and field validation. Provider domain/URL pairs must agree and cannot contain URL credentials. Result pages are ingested atomically. Domain records are plain data, not commands. The program never visits returned sites. Exported spreadsheet cells with formula-like prefixes receive an apostrophe; exact stored values remain available in SQLite. Spreadsheet behavior outside the tested CSV transformation is unverified.

Run locks block concurrent batch owners and refuse recovery while the recorded PID exists. They protect against ordinary cooperating processes, not a malicious filesystem actor, symlink race, network share locking or reused PIDs. SQLite synchronous FULL and transactions are used, but tests prove process-exit recovery only; power loss, disk full/corruption and hardware durability are outside acceptance.

The Node runtime is trusted and must be maintained by the operator. Zero package dependencies means no npm package install or lifecycle script is needed; it does not prove the source or runtime has no vulnerabilities. CI actions are pinned to verified upstream commit hashes and receive read-only repository permission. No secrets or live-provider job is configured in CI.

Generated outputs, SQLite files, logs and `.env` are ignored by Git. Do not commit real records or environment files. No telemetry, analytics, model call, global configuration or background server is installed.
