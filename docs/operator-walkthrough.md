# Operator walkthrough

1. Run `api-csv.cmd doctor --json`. Explain why offline execution does not require a key and why `liveAuthAvailable` proves presence only.
2. Open the two fixture CSVs. Predict the four query combinations. Run `plan` and compare the exact strings. Explain the page budget versus the total attempt budget, including retry/account overhead.
3. Run `demo --out outputs/operator-review --json` with a fresh output folder. Inspect three domain rows and twelve match rows. Find a host discovered by both locations and both footprints. Explain why `www.example.test` is not merged with `example.test`.
4. Inspect the nullable rank and `ranked=false`. Check the summary's four complete query outcomes and its coverage qualification. Use the generated manifest to check file hashes before sharing a derivative.
5. Demonstrate the automated interruption proof with `npm test`: actual child processes exit before and after page commit, reopen the database and yield identical CSV data. Separate tests cover export rename and a real concurrent SQLite writer. Explain why a retry may repeat a request but cannot duplicate the committed `(domain,query,URL)` match.
6. Explain a quota interruption: committed rows survive, the query remains pending and a later `resume` continues its next uncommitted page. An actual process crash additionally needs `--recover-lock` after the PID ended. Completed runs return without repeating requests.
7. Explain terminal limits: `REQUEST_BUDGET` is exhausted across the full run history; its immutable fingerprint prevents silently raising that budget. Page/depth/truncation limits also cannot be promoted to complete by resume. A new planned run is a separate operation and can repeat provider costs.
8. Explain what is still needed for real use: client-owned paid access, proven input/query samples, approved volume, account entitlement and live result verification. The sample contains no GUI, client outcomes, site crawler or lead-quality proof. Public publication is separate from private technical acceptance.

Operator learning is a human gate. Passing automated tests does not prove the owner has personally completed this exercise.
