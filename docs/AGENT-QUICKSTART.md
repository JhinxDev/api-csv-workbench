# Agent quickstart

Use this project only when editable batch searches, resumable page state and provenance CSVs solve the requested outcome. Do not substitute it for a service's official MCP connector or build another provider wrapper by default.

Start with the package-local Windows launcher or `node /absolute/path/src/cli.mjs`. Run `doctor --json`, then `plan` with exact input paths and reviewed bounds. Preview the expanded queries before running a paid-provider batch. Use `fixture` for demonstrations and tests. Existing provider access must be client-owned; no credential acquisition or spend is granted by this guide.

```powershell
C:\path\api-csv.cmd doctor --json
C:\path\api-csv.cmd plan --locations C:\inputs\locations.csv --footprints C:\inputs\footprints.csv --max-pages 5 --max-requests 100 --json
C:\path\api-csv.cmd export --db C:\runs\batch.sqlite --out C:\exports\new-batch --json
```

Read the summary and nonzero exit status together. Keep partial/failed coverage explicit. Resume only identical inputs/provider/limits and remaining budget. Recover a lock only after verifying the process ended. Do not delete or overwrite evidence to manufacture clean state. No global installation, shared source edits, public publishing, lead outreach or paid request is authorized by this document.
