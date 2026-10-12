# Polish KRS register API by CompanyData

[![npm](https://img.shields.io/npm/v/@companydata/krs-api.svg)](https://www.npmjs.com/package/@companydata/krs-api)

A small, typed TypeScript wrapper for looking up **Polish company data from the KRS (Krajowy Rejestr Sądowy) and CEIDG**: company names, full street addresses, phone, email, website, size and revenue, through one REST call.

This package is a thin convenience layer over the master [`@companydata/companydata-sdk`](https://github.com/companydatacom/companydata-sdk). It is the same API and the same key, with the country pinned to Poland and a register-specific helper on top, so you can write `client.getByNip("7740001454")` instead of assembling query parameters by hand.

> One schema, one key. Every CompanyData register wrapper returns records in the same shape, so moving from KRS to another country's register is a one-line change.

## At a glance

| | |
| --- | --- |
| Country | 🇵🇱 Poland (`countryCode: "PL"`) |
| Register | Polish KRS register |
| Businesses in CompanyData | 6.31M |
| With phone number | 886K |
| With email address | 1.31M |
| Lookup key | NIP (10 digits) |
| Verified example | Orlen S.A., `7740001454` |
| Live demo and comparison | [companydata.com/krs-api](https://companydata.com/krs-api/) |
| Official register | [ekrs.ms.gov.pl](https://ekrs.ms.gov.pl) |

Counts are from the live API on 2026-10-12 and grow over time.

## What is the KRS?

The **KRS** (Krajowy Rejestr Sądowy) is the Polish National Court Register of companies, foundations and associations, run by the Ministry of Justice, while sole traders are registered in CEIDG. The official KRS API returns a full extract (odpis) for one KRS number.

What the official registers do **not** give you: lookups are by number only, there is no search by city, industry or size, and the extracts carry no phone number, no email address and no website.

**CompanyData adds the missing fields.** 6.31M Polish businesses with full addresses, phone, email, website, directors and firmographics, filterable and exportable in bulk through one live REST API. Comparison and a live lookup: [companydata.com/krs-api](https://companydata.com/krs-api/).

## Installation

```bash
npm install @companydata/krs-api
```

Get an API key at [app.companydata.com/signup-api](https://app.companydata.com/signup-api). Your first calls are free.

## Quickstart

```ts
import { KrsClient } from "@companydata/krs-api";

const client = new KrsClient({
  auth: { type: "apiKey", apiKey: process.env.COMPANYDATA_API_KEY! }
});

// Look up one business by its NIP.
const company = await client.getByNip("7740001454"); // Orlen S.A.

// Search with filters (country is always PL here).
const page = await client.search({
  cityName: "WARSZAWA",
  hasEmail: true,
  hasWebsite: true,
  page: 1,
  pageSize: 25
});
console.log(page.totalCount, page.records[0]?.["Company Name"]);
```

> **City and province names are UPPER CASE.** Filter on `cityName: "WARSZAWA"`, not `"Warszawa"` (which returns 0). The same goes for `provinceName: "WOJEWÓDZTWO MAZOWIECKIE"`. List exact names per country with `GET /api/cities`. Full field and filter reference: [companydata.com/api-docs/request-company](https://companydata.com/api-docs/request-company/).

Run the full example against the live API with your key:

```bash
git clone https://github.com/companydatacom/krs-api && cd krs-api && npm install
COMPANYDATA_API_KEY=... npm run test:live
```

## What a record looks like

Every record is a flat object with human-readable keys. This is Orlen S.A. as returned by `getByNip`:

```json
{
  "Company Name": "Orlen S A",
  "Trade Name": null,
  "Company Registration Number": "7740001454",
  "Address 1": "Ul. Chemików 7",
  "Postal Code": "09411",
  "City": "Płock",
  "State/Province": "Województwo Mazowieckie",
  "Country": "Poland",
  "Phone Number": "+4*****00",
  "Email": "*****@*****",
  "Website": "orlen.*****",
  "Founding Year": 2001,
  "Employees Total": 12782,
  "Yearly Revenue in U.S. Dollars": 47794557843,
  "Business Category Code 1 - Description": "Petroleum Refining",
  "Business Legal Type - Description": "Corporation"
}
```

**Search is a preview, export is the full record.** `search` (and the lookup helper, which uses it) returns about 20 fields with phone, email and website masked as `*****`, and does not spend credits. `export`, `exportWithScroll` and `iterate` return the full record (about 35 fields, unmasked contact details, SIC and national industry codes, legal status, group structure) and spend one credit per company you have not exported before. Which fields are on a record depends on your key's configuration. See the [field reference](https://companydata.com/api-docs/request-company/) and [plans and credits](https://companydata.com/api-docs/authentication/).

## Methods

| Method | Returns | Does |
| --- | --- | --- |
| `client.search(params)` | `KrsPage` | Search Polish businesses with filters. |
| `client.getByNip(id, scope?)` | `CompanyRecord \| null` | Fetch one business by NIP. `scope` adds extra filters when a number is not unique. |
| `client.export(params)` | `KrsPage` | Export one page of results (standard pagination). |
| `client.exportWithScroll(params)` | `KrsScrollBatch` | One scroll batch (max 50 records). Pass `scrollId` back in for the next. |
| `client.iterate(params, { maxRecords })` | `AsyncGenerator<CompanyRecord>` | Streams every matching record across scroll batches. |
| `client.raw` | `ApiClient` | The underlying master SDK client, for anything not wrapped here. |
| `normalizeKrsId(id)` | `string` | The NIP normalisation the lookup helper applies. |

```ts
interface KrsPage {
  records: CompanyRecord[];   // flat objects, keys like "Company Name", "City", "Email"
  totalCount: number;         // matches across all pages
  page: number;
  totalPages: number;
  pageSize: number;
}

interface KrsScrollBatch {
  records: CompanyRecord[];
  scrollId: string | null;    // pass back in to get the next batch
  hasMoreRecords: boolean;
  pageSize: number;
}
```

`params` is the master SDK's filter set with `countryCode` removed, because it is always `"PL"` here. For cross-border queries, use the master SDK directly.

### Lookup by NIP

`getByNip` takes the 10-digit NIP (tax identification number), which is the registration number CompanyData stores for Polish businesses. Dashes and spaces are stripped, so `"774-00-01-454"` and `"7740001454"` match the same company. KRS numbers are not accepted, see Known limitations.

## Recipes

**Find a company by name, pinned to a city**

```ts
const { records, totalCount } = await client.search({
  search: "Orlen",
  cityName: "WARSZAWA",
  pageSize: 5
});
```

**Build a segment: companies in a province with 50 or more employees**

```ts
const page = await client.search({
  provinceName: "WOJEWÓDZTWO MAZOWIECKIE",
  employeesTotal: { min: 50 },
  hasPhone: true,
  pageSize: 100
});
```

**Stream a whole segment with scroll export**

```ts
for await (const company of client.iterate(
  { cityName: "WARSZAWA", hasEmail: true },
  { maxRecords: 5000 }
)) {
  console.log(company["Company Name"], company["Email"]);
}
```

**Drive the scroll loop yourself**

```ts
let batch = await client.exportWithScroll({ cityName: "WARSZAWA", hasEmail: true, pageSize: 50 });
while (batch.records.length > 0) {
  process(batch.records);
  if (!batch.hasMoreRecords || !batch.scrollId) break;
  batch = await client.exportWithScroll({ cityName: "WARSZAWA", hasEmail: true, scrollId: batch.scrollId, pageSize: 50 });
}
```

**Anything else: drop to the master client**

```ts
const res = await client.raw.company.search({ countryCode: "DE", cityName: "BERLIN", pageSize: 10 });
```

### Common filters

| Filter | Example | Notes |
| --- | --- | --- |
| `search` | `"Orlen"` | Free text over company and trade names. |
| `nationalId` | `"7740001454"` | Registration number. The lookup helper sets this for you. |
| `cityName` | `"WARSZAWA"` | UPPER CASE. |
| `provinceName` | `"WOJEWÓDZTWO MAZOWIECKIE"` | Admin-2 name, UPPER CASE (the record's `State/Province`). |
| `postalCode` | `"09411"` | Exact match. |
| `hasEmail`, `hasPhone`, `hasWebsite` | `true` | Contact availability. |
| `employeesTotal`, `annualSales`, `foundingYears` | `{ min: 50, max: 500 }` | Range filters. |
| `sic4Digits` | `"7372"` | 4-digit SIC industry code. |

Full list: [companydata.com/api-docs/request-company](https://companydata.com/api-docs/request-company/).

## Known limitations

- The registration number in CompanyData is the NIP, not the KRS number. `getByNip("0000028860")` (a KRS number) returns `null`. Use `search` with the company name if you only have a KRS number.

## Four ways to integrate

Pick whichever fits how you build. All four hit the same data behind the same key.

1. **This register SDK** (`@companydata/krs-api`): Polish lookups with a KRS-specific helper. You are here.
2. **Master SDK** ([`@companydata/companydata-sdk`](https://github.com/companydatacom/companydata-sdk)): all 200+ countries in one typed client, keyed by `countryCode`.
3. **MCP server**: connect an AI agent (Claude, Cursor and others) to `https://companydata.com/mcp/` with your key in the `x-api-key` header. See [companydata-mcp-server](https://github.com/companydatacom/companydata-mcp-server).
4. **Raw REST**: call `GET https://app.companydata.com/api/company/search?countryCode=PL&cityName=WARSZAWA` with an `x-api-key` header. Contract: [companydata.com/openapi.json](https://companydata.com/openapi.json).

```bash
curl -H "x-api-key: $COMPANYDATA_API_KEY" \
  "https://app.companydata.com/api/company/search?countryCode=PL&nationalId=7740001454&pageSize=1"
```

## Error handling

Failed requests throw `ApiError` with the HTTP status. The client retries transient failures (429 and 5xx) with backoff before giving up.

```ts
import { ApiError } from "@companydata/krs-api";

try {
  await client.search({ cityName: "WARSZAWA" });
} catch (err) {
  if (err instanceof ApiError) {
    // 401: bad or missing key, 429: rate limited,
    // "Export credit limit exceeded" (code credits_limit_exceeded): export credits used up
    console.error(err.status, err.message);
  }
}
```

A scroll batch that is larger than your remaining credits is rejected as a whole, so keep `pageSize` small when a key is close to its limit.

## All register wrappers

Same pattern, one per official register. Every wrapper returns the same record shape.

| Country | Register | Package | Lookup helper |
| --- | --- | --- | --- |
| 🇳🇱 Netherlands | KVK | [`@companydata/kvk-api`](https://github.com/companydatacom/kvk-api) | `getByKvkNumber` |
| 🇩🇪 Germany | Handelsregister | [`@companydata/handelsregister-api`](https://github.com/companydatacom/handelsregister-api) | `getByRegistrationNumber` |
| 🇬🇧 United Kingdom | Companies House | [`@companydata/companies-house-api`](https://github.com/companydatacom/companies-house-api) | `getByCompanyNumber` |
| 🇫🇷 France | Sirene | [`@companydata/sirene-api`](https://github.com/companydatacom/sirene-api) | `getBySiret` |
| 🇧🇪 Belgium | KBO/BCE | [`@companydata/kbo-api`](https://github.com/companydatacom/kbo-api) | `getByEnterpriseNumber` |
| 🇵🇱 Poland | KRS | [`@companydata/krs-api`](https://github.com/companydatacom/krs-api) | `getByNip` |
| 🇸🇪 Sweden | Bolagsverket | [`@companydata/bolagsverket-api`](https://github.com/companydatacom/bolagsverket-api) | `getByOrgNumber` |
| 🇨🇭 Switzerland | Zefix | [`@companydata/zefix-api`](https://github.com/companydatacom/zefix-api) | `getByUid` |
| 🇨🇿 Czech Republic | ARES | [`@companydata/ares-api`](https://github.com/companydatacom/ares-api) | `getByIco` |
| 🇩🇰 Denmark | CVR | [`@companydata/cvr-api`](https://github.com/companydatacom/cvr-api) | `getByCvr` |
| 🇧🇷 Brazil | CNPJ | [`@companydata/cnpj-api`](https://github.com/companydatacom/cnpj-api) | `getByCnpj` |
| 🇦🇺 Australia | ABR | [`@companydata/abn-lookup-api`](https://github.com/companydatacom/abn-lookup-api) | `getByAbn` |
| 🇺🇸 United States | SEC EDGAR | [`@companydata/sec-edgar-api`](https://github.com/companydatacom/sec-edgar-api) | `getByRegistrationNumber` |

Plus the master SDK for every other country: [`@companydata/companydata-sdk`](https://github.com/companydatacom/companydata-sdk).

## License

MIT. Built and maintained by [CompanyData.com](https://companydata.com).
