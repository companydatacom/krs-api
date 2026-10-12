/**
 * @companydata/krs-api
 *
 * A thin, typed convenience wrapper around the CompanyData API for the
 * Polish KRS register. It is not a separate API: it is the same
 * `@companydata/companydata-sdk` client with the country pinned to PL
 * and a register-specific helper on top, so you can write
 * `client.getByNip("7740001454")` instead of assembling query parameters.
 *
 * One schema, one key across every CompanyData register. Swap this package for
 * another register wrapper and the shape of what you get back does not change.
 *
 * Docs: https://companydata.com/api-docs/request-company/
 */

import {
  ApiClient,
  type ApiClientConfig,
  type CompanyExportParams,
  type CompanyRecord,
  type CompanySearchParams,
  type RequestOptions
} from "@companydata/companydata-sdk";

/** ISO country code this wrapper is pinned to. */
export const COUNTRY_CODE = "PL" as const;

/**
 * Filters accepted by this wrapper: the master SDK's filter set minus
 * `countryCode`, which is always "PL" here. Use the master SDK directly for
 * cross-border queries.
 *
 * City and province names are matched in UPPER CASE (`cityName: "WARSZAWA"`).
 */
export type KrsSearchParams = Omit<CompanySearchParams, "countryCode">;
export type KrsExportParams = Omit<CompanyExportParams, "countryCode" | "useScroll">;
export type KrsClientConfig = ApiClientConfig;

/** One page of results. Pagination fields are flattened from the API's `meta` block. */
export interface KrsPage {
  records: CompanyRecord[];
  totalCount: number;
  page: number;
  totalPages: number;
  pageSize: number;
}

/** One batch of a scroll export. Pass `scrollId` back in to fetch the next batch. */
export interface KrsScrollBatch {
  records: CompanyRecord[];
  scrollId: string | null;
  hasMoreRecords: boolean;
  pageSize: number;
}

/** Options for `iterate()`. The API returns at most 50 records per scroll batch. */
export interface KrsIterateOptions {
  /** Records per request. Capped server-side at 50. */
  pageSize?: number;
  /** Stop after this many records. Omit to pull the whole result set. */
  maxRecords?: number;
}

type RawMeta = {
  totalCount?: number;
  currentPage?: number;
  totalPages?: number;
  pageSize?: number;
  scrollId?: string;
  hasMoreRecords?: boolean;
  recordCount?: number;
};

type RawResponse = {
  meta?: RawMeta;
  data?: CompanyRecord[] | { records?: CompanyRecord[]; totalCount?: number };
  page?: number;
  pageSize?: number;
  totalPages?: number;
  totalCount?: number;
  scrollId?: string;
  hasMoreRecords?: boolean;
};

function recordsOf(res: RawResponse): CompanyRecord[] {
  if (Array.isArray(res.data)) return res.data;
  return res.data?.records ?? [];
}

function toPage(res: RawResponse): KrsPage {
  const records = recordsOf(res);
  const meta = res.meta ?? {};
  const dataTotal = !Array.isArray(res.data) ? res.data?.totalCount : undefined;
  return {
    records,
    totalCount: meta.totalCount ?? res.totalCount ?? dataTotal ?? records.length,
    page: meta.currentPage ?? res.page ?? 1,
    totalPages: meta.totalPages ?? res.totalPages ?? 1,
    pageSize: meta.pageSize ?? res.pageSize ?? records.length
  };
}

function toBatch(res: RawResponse): KrsScrollBatch {
  const records = recordsOf(res);
  const meta = res.meta ?? {};
  return {
    records,
    scrollId: meta.scrollId ?? res.scrollId ?? null,
    hasMoreRecords: meta.hasMoreRecords ?? res.hasMoreRecords ?? false,
    pageSize: meta.pageSize ?? res.pageSize ?? records.length
  };
}

/** Normalise a NIP to the form the API indexes. */
export function normalizeKrsId(id: string): string {
  return id.replace(/\D+/g, "");
}

/**
 * Client for Polish company data from the Polish KRS register.
 *
 * ```ts
 * const client = new KrsClient({ auth: { type: "apiKey", apiKey: process.env.COMPANYDATA_API_KEY! } });
 * const company = await client.getByNip("7740001454");
 * const page = await client.search({ cityName: "WARSZAWA", hasEmail: true });
 * ```
 */
export class KrsClient {
  private readonly api: ApiClient;

  constructor(config: KrsClientConfig) {
    this.api = new ApiClient(config);
  }

  /** Search Polish businesses. `countryCode` is fixed to "PL". */
  async search(params: KrsSearchParams = {}, options?: RequestOptions): Promise<KrsPage> {
    const res = await this.api.company.search({ ...params, countryCode: COUNTRY_CODE }, options);
    return toPage(res as RawResponse);
  }

  /**
   * Look up a single business by the 10-digit NIP (tax identification number), which is the registration number CompanyData stores for Polish businesses.
   * Returns the first matching record, or `null` if none is found.
   *
   * `scope` narrows the lookup with any other filter (for example
   * `{ regionName: "..." }` or `{ cityName: "..." }`) when a number is not
   * unique on its own.
   */
  async getByNip(
    id: string,
    scope: KrsSearchParams = {},
    options?: RequestOptions
  ): Promise<CompanyRecord | null> {
    const page = await this.search({ ...scope, nationalId: normalizeKrsId(id), pageSize: 1 }, options);
    return page.records[0] ?? null;
  }

  /** Export one page of Polish businesses (standard pagination). */
  async export(params: KrsExportParams = {}, options?: RequestOptions): Promise<KrsPage> {
    const res = await this.api.company.export({ ...params, countryCode: COUNTRY_CODE }, options);
    return toPage(res as RawResponse);
  }

  /**
   * Export in scroll mode. Call once with your filters, then keep calling with
   * the returned `scrollId` (and the same filters) until `hasMoreRecords` is
   * false. The API returns at most 50 records per batch. `iterate()` does this
   * loop for you.
   */
  async exportWithScroll(
    params: KrsExportParams & { scrollId?: string } = {},
    options?: RequestOptions
  ): Promise<KrsScrollBatch> {
    const res = await this.api.company.exportWithScroll({ ...params, countryCode: COUNTRY_CODE }, options);
    return toBatch(res as RawResponse);
  }

  /**
   * Stream every record that matches `params`, batch by batch, as an async
   * iterator. Set `maxRecords` to cap the pull.
   *
   * ```ts
   * for await (const company of client.iterate({ cityName: "WARSZAWA", hasEmail: true }, { maxRecords: 500 })) {
   *   console.log(company["Company Name"]);
   * }
   * ```
   */
  async *iterate(
    params: KrsSearchParams = {},
    opts: KrsIterateOptions = {},
    options?: RequestOptions
  ): AsyncGenerator<CompanyRecord, void, undefined> {
    const pageSize = opts.pageSize ?? 50;
    let scrollId: string | undefined;
    let yielded = 0;
    for (;;) {
      const batch = await this.exportWithScroll(
        scrollId ? { ...params, scrollId, pageSize } : { ...params, pageSize },
        options
      );
      for (const record of batch.records) {
        if (opts.maxRecords !== undefined && yielded >= opts.maxRecords) return;
        yielded += 1;
        yield record;
      }
      if (!batch.hasMoreRecords || batch.records.length === 0 || !batch.scrollId) return;
      scrollId = batch.scrollId;
    }
  }

  /** Escape hatch: the underlying master SDK client, for anything not wrapped here. */
  get raw(): ApiClient {
    return this.api;
  }
}

/** Convenience factory, if you prefer a function to `new`. */
export function createKrsClient(config: KrsClientConfig): KrsClient {
  return new KrsClient(config);
}

export { ApiError } from "@companydata/companydata-sdk";
export type {
  ApiClientConfig,
  CompanyExportParams,
  CompanyFilters,
  CompanyRecord,
  CompanySearchParams,
  RangeFilter,
  RequestOptions
} from "@companydata/companydata-sdk";
