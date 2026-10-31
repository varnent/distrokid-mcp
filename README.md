# DistroKid CSV MCP (unofficial) — v0.2.0 candidate

A **read-only, local stdio MCP server** for authorized royalty CSV exports. Not affiliated with DistroKid; does not log in, access accounts, contact a remote API, or deploy a service.

## Quick start

Requires Node.js 20+.

```sh
npm ci --ignore-scripts
npm run check
npm test
mkdir -p data
cp examples/sample-earnings.csv data/report.csv
DISTROKID_CSV_DIR="$(pwd)/data" npm start
```

Connect using an MCP client that supports local stdio servers. The server exposes `list_reports` and `report_summary`.

## v0.2 changes

- Earnings and quantities use integer-backed decimal calculations, with up to 12 fractional places and 24 total digits per input. **Output totals are decimal strings** to avoid precision loss in JSON. This is an intentional change from v0.1 numeric output.
- Currency is **required** for nonempty reports. Provide a `Currency`, `Currency Code`, or `Payment Currency` CSV column, or pass the optional `currency` parameter to `report_summary`. Mixed currencies and conflicting codes are rejected. Codes must be three letters; the implementation does not verify an authoritative ISO 4217 list or perform exchange conversion.
- Detects supported header aliases and rejects duplicate or ambiguous columns. Schema detection currently recognizes a **generic royalty CSV**; it does not claim to identify specific DistroKid export versions.
- Retains basename-only paths, symlink escape protection, 5 MiB file limit, 50,000 row limit, and no raw row responses.
- CI checks Node 20 and 22, JavaScript syntax, tests, and high-severity dependency advisories. Dependency installation uses the committed `package-lock.json` with `npm ci --ignore-scripts` for reproducibility.

## CSV headers

Artist: `Artist`, `Artist Name`. Title: `Title`, `Track`, `Track Title`, `Song`, `Song Title`. Store: `Store`, `Service`, `Platform`, `Streaming Service`. Earnings (required): `Earnings`, `Amount`, `Net Earnings`, `Royalty`, `Royalties`, `Total Earned`. Quantity: `Quantity`, `Streams`, `Plays`, `Units`. Date: `Date`, `Sale Date`, `Report Date`, `Month`. Currency: `Currency`, `Currency Code`, `Payment Currency`.

No normalization of dates or unit types is attempted. Earnings must be nonblank decimal values. An optional leading sign, then an optional dollar sign, and correctly grouped thousands separators are supported (for example, `-$1,234.50`). Internal whitespace, misplaced symbols, and malformed grouping are rejected. Blank optional quantities are treated as zero; explicit currency remains mandatory because a dollar sign alone is ambiguous. Review the source export's units and accounting definitions.

## DistroKid Bank CSV compatibility (v0.3 development)

A documented DistroKid Bank profile is detected only when the headers contain
`Earnings (USD)`, `Sale Month`, `Store`, `Artist`, `Title`, and `Quantity`.
For this profile, the currency is USD as specified by the earnings header; an
explicit conflicting currency argument is rejected. Generic CSV exports still
require a currency column or explicit currency argument.

The profile recognizes current `Reporting Date` / `Source Type` and historical
`Reporting Month` / `Song/Album` columns, and preserves ISRC, UPC,
Country of Sale, Team Percentage, Date Inserted, Songwriter Royalties Withheld (USD),
and Recoup (USD), plus raw reporting dates where present. Adjustment fields are
retained as strings rather than recomputed into earnings. If an optional
currency column is present, it must agree with the USD-labeled earnings header.
`date` remains the raw sale-month string for legacy summaries; canonical
`saleDate` and `reportPeriod` remain null until the date-aware PR validates
date semantics. Team percentages are retained as source metadata and are **not**
automatically applied to earnings. No split, withholding, or recoupment
calculation is implied.

Only UTF-8 comma-separated `.csv` files are supported. Historical tab-delimited
TSV and Latin-1 encoded downloads are **not** supported in this change.
No actual private DistroKid export was accessed: fixtures are synthetic and
based on publicly documented header names. Validate against a redacted export
before relying on this for accounting.

References:
- https://perpendis.com/royalty/distrokid-statement-to-excel
- https://osc.garden/blog/data-analysis-music-streaming/
- https://song-royalty-calculator.com/blog/distrokid-csv-breakdown

## Security and limitations

No credentials, OAuth, network listener, hosted MCP endpoint, deployment, or access to real artist data. Do not commit sensitive CSV files. The `data/` directory and `.env` are gitignored. Only process exports you are authorized to use. Files are loaded in memory after size checks; avoid sharing the data directory with untrusted local processes. Not yet financial-grade reconciliation, multi-user hosting, or an installable ChatGPT app.

## Roadmap

- Validate against redacted real export headers, add fixtures for versioned schemas.
- Add precise date filtering, currency code allowlist, and financial reconciliation tests.
- Pin GitHub Actions to reviewed commit SHAs.
- Design a separate HTTPS MCP service with user authorization and tenant isolation, **without deploying it**.

MIT licensed. See LICENSE.
