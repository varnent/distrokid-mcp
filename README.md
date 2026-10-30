# DistroKid CSV MCP (unofficial) — v0.1.0

A **local, read-only** Model Context Protocol (MCP) server for summarizing **user-provided CSV exports** from DistroKid or other similarly structured royalty reports. This is **not affiliated with or endorsed by DistroKid**. It does **not** connect to DistroKid, use an API, log in, upload releases, or retrieve account data. No network listener is started; MCP runs over standard input/output.

## Requirements

- Node.js 20+ and npm
- An MCP client supporting local `stdio` servers
- CSV files you have permission to process

## Quick start

```bash
npm install
npm test
mkdir -p data
cp examples/sample-earnings.csv data/report.csv
DISTROKID_CSV_DIR="$(pwd)/data" npm start
```

The last command waits for an MCP client to communicate via stdio. It is not an interactive CLI. To configure a compatible local MCP client, use a configuration resembling:

```json
{
  "mcpServers": {
    "distrokid-csv": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/distrokid-mcp/src/server.js"],
      "env": { "DISTROKID_CSV_DIR": "/ABSOLUTE/PATH/TO/CSV-DIRECTORY" }
    }
  }
}
```

Exact client configuration and ChatGPT availability depend on your environment. **A local stdio MCP server is not automatically a publicly installable ChatGPT app.** Publishing a public ChatGPT app would require a separately designed HTTPS MCP service, user authentication/authorization, tenant isolation, privacy and data-retention policies, deployment, and app submission/review.

## Tools

- `list_reports`: lists regular `.csv` files directly inside the configured directory.
- `report_summary`: reads one CSV, optionally filters by exact artist name (case-insensitive), groups by artist/title/store/date, and returns earnings and quantity totals. Limits returned groups to 1–100.

Supported normalized headers (case-insensitive):

| Field | Recognized headers |
|---|---|
| Artist | `Artist`, `Artist Name` |
| Title | `Title`, `Track`, `Track Title`, `Song`, `Song Title` |
| Store | `Store`, `Service`, `Platform`, `Streaming Service` |
| Earnings (required) | `Earnings`, `Amount`, `Net Earnings`, `Royalty`, `Royalties`, `Total Earned` |
| Quantity | `Quantity`, `Streams`, `Plays`, `Units` |
| Date | `Date`, `Sale Date`, `Report Date`, `Month` |

Check the actual CSV headers and definitions before interpreting results. **Currency is unspecified**: never add different currencies together. Quantity can mean different units depending on export. Date grouping uses the original text as-is. Floating-point calculations are intended for exploratory reporting, not accounting-grade reconciliation.

## Security and privacy

- No credentials, OAuth, remote requests, write operations, or deployment.
- File names must be simple CSV basenames; path traversal and symlinks pointing outside the configured root are rejected.
- Files must be regular files no larger than 5 MiB; maximum 50,000 parsed rows; output is aggregate only, not raw row dumps.
- The MCP client receives filenames, column names, and aggregates, which may be commercially sensitive. Only use with trusted clients and authorized exports.
- **Do not put real earnings CSVs, secrets, or personal data into Git.** The `data/` directory and `.env` are ignored.
- No public HTTP exposure, multi-user isolation, authentication, audit logs, or financial-grade decimal arithmetic in v0.1.0.
- Before public hosting, implement per-user storage and authorization, encrypted data at rest, deletion controls, rate limits, logging with redaction, and a threat-model review.

## Development

```bash
npm install
npm run check
npm test
```

GitHub Actions runs the checks on pushes and pull requests. CI does not access real accounts or deploy anything.

## Roadmap

1. Detect and validate real export schemas (using redacted sample headers).
2. Add explicit currency validation, exact decimal arithmetic, and time-period normalization.
3. Build an HTTPS MCP gateway with OAuth and tenant isolation for public distribution.
4. Create app listing, privacy policy, consent UX, operational monitoring, and submission materials.
5. Consider direct integration **only** if DistroKid offers an authorized supported API or partnership.

## License

MIT. See `LICENSE`.
