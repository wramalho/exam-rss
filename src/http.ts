const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/**
 * Fetches a URL as raw bytes with browser-like User-Agent and timeout.
 */
export async function fetchBuffer(url: string, timeoutMs = 20000): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: DEFAULT_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (HTTP ${response.status})`);
  }
  return response.arrayBuffer();
}

/**
 * Fetches a URL and decodes the body using the given encoding (defaults to utf-8).
 */
export async function fetchText(
  url: string,
  encoding = "utf-8",
  timeoutMs = 20000
): Promise<string> {
  const buffer = await fetchBuffer(url, timeoutMs);
  return new TextDecoder(encoding).decode(buffer);
}
