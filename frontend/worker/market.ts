import { boiSources, marketFromBoi, type BoiFiles, type LiveMarket } from '../src/engine/boiMarket';

/**
 * Reads the three Bank of Israel files and parses them. A file that fails to arrive is treated as
 * empty, which leaves its figures out of the result (listed in `missing`) rather than failing the
 * whole read.
 *
 * The statistics service refuses cross-origin browser requests, which is why this runs on the
 * server: in the Cloudflare Worker in production and in a Vite middleware during development.
 */
export async function readMarket(fetcher: typeof fetch, now = new Date()): Promise<LiveMarket> {
  const sources = boiSources(now);
  const keys = Object.keys(sources) as (keyof BoiFiles)[];
  const texts = await Promise.allSettled(
    keys.map(async (key) => {
      const response = await fetcher(sources[key], {
        headers: { accept: 'text/csv' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`${key}: HTTP ${response.status}`);
      }
      return response.text();
    }),
  );
  const files: Partial<Record<keyof BoiFiles, string>> = {};
  keys.forEach((key, index) => {
    const result = texts[index]!;
    if (result.status === 'fulfilled') {
      files[key] = result.value;
    }
  });
  return marketFromBoi(files, now);
}
