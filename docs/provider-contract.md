# PublicWWW REST contract

First-party documents verified October 8, 2026. These are documentation-backed request/response assumptions, not a paid-provider operational acceptance receipt.

| Concern | Current documented contract | Workbench behavior |
| --- | --- | --- |
| [Authentication](https://publicwww.com/docs/api/authentication/) | Bearer header; paid plan for search; account endpoint does not spend search quota | Environment key only; fixed live origin; no query-string key |
| [Requests](https://publicwww.com/docs/api/requests/) | GET `/v1/search` with query, one-based page, per_page; both size and page × size limited by `max_per_page` | Encoded query, bounded JSON pages, no snippets, account preflight; explicit cumulative cap |
| [Account and limits](https://publicwww.com/docs/api/limits/) | `/v1/account` reports `max_per_page` and separately `disclosed_positions`; ten calls/minute shared with MCP; daily quota resets UTC midnight | Distinct fields stored; 6.1-second process-local spacing; provider Retry-After remains authoritative; quota stops for later resume |
| [Formats](https://publicwww.com/docs/api/formats/) | JSON metadata, results array, truncation body/header | Validate counts/types/page/query; body or X-Truncated marks partial; continue full disclosed pages within bounds |
| [Errors](https://publicwww.com/docs/api/errors/) | Stable error codes; retry rate limits and widening-delay 5xx; auth/input errors do not benefit from blind retry | Auth/input stop; quota stop; two bounded retries for network/5xx/rate; page_too_deep makes only that query partial |

`total` is whole-index match count; `total_pages` is ceil(total/per_page), not guaranteed disclosed depth. A full page with `truncated=true` does not imply all disclosed pages were collected. The workbench retains the partial marker while continuing allowed full pages. A short truncated page, page/depth budget or last page terminates that query with partial coverage.

The request documentation uses `max_per_page` as both page-size and cumulative row bound, while the limits page also names `disclosed_positions` as an entitlement. The workbench follows both literally: the size/product cap and the separate disclosed-position guard, retaining observed account fields in summaries. Their exact interaction on real paid accounts remains a live verification gate. No inference from a field's name replaces the explicit current documentation. Provider `page_too_deep` and truncation remain independent partial signals.

Tests include max_per_page6/disclosed_positions6 with size2 and six results across three pages, max_per_page2 allowing one page before partial-depth, full truncated multipage responses, X-Truncated disagreement and independent queries after page_too_deep.

Defaults: page size2; five pages/query; hundred total attempts; hundred queries; timeout10s; body cap2MiB; retry waits capped at30s. Inputs at most1MiB each and1000 rows each. Operator limits have explicit hard caps. Paging counts and budgets never promise unknown provider result depth.

The local spacing cannot coordinate other processes or API/MCP clients on the same account. Live quota sharing, current API availability, actual query syntax effectiveness, rank/index freshness and third-party proxy behavior are unverified. The official provider already has `/mcp`; this project adds local batch state and provenance instead of another MCP wrapper.
