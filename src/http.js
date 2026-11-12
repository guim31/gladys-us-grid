// -----------------------------------------------------------------------------
// The one HTTP helper: a timeout on every request, an honest User-Agent, and
// errors that carry the HTTP status. The NYISO files are public CSV, the EIA
// API is JSON with a free key in the query string: no cookie, nothing that
// imitates a browser, and the key never appears in an error message.
// (From guim31/gladys-rte, reading text instead of JSON.)
// -----------------------------------------------------------------------------

export const REQUEST_TIMEOUT_MS = 20_000;
export const USER_AGENT = 'gladys-us-grid (+https://github.com/guim31/gladys-us-grid)';

/** A non-2xx answer, or an unreachable server. */
export class HttpError extends Error {
  /**
   * @param {string} message
   * @param {object} [details]
   * @param {number} [details.status] HTTP status
   */
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Run one GET request and return its body as text.
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {string} [what] the source named in the error messages
 */
export async function requestText(fetchImpl, url, what = 'NYISO', accept = 'text/csv') {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, accept },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // A DNS failure, a refused connection, the timeout: the cause names it.
    const cause = err?.cause?.code ?? err?.cause?.message ?? err?.name ?? 'network error';
    throw new HttpError(`${what} unreachable (${hideKey(String(cause))})`);
  }
  if (!response.ok) {
    throw new HttpError(`${what} answered HTTP ${response.status}`, { status: response.status });
  }
  return response.text();
}

/** An `api_key=…` hidden, should a message ever quote a URL. */
export const hideKey = (text) => text.replace(/api_key=[^&\s]*/gi, 'api_key=***');
