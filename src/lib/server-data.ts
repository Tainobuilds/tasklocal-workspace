import fs from 'fs/promises';
import path from 'path';

import { sanitizeListings } from './sanitize';
import type { ListingsResult } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Reads and parses one JSON file from `data/`.
 * A missing, empty, or malformed file resolves to `null` instead of throwing,
 * so one broken file cannot take down a page that reads several.
 */
export async function readJsonFile(filename: string): Promise<unknown | null> {
  try {
    const contents = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
    if (contents.trim().length === 0) return null;
    return JSON.parse(contents);
  } catch (error) {
    console.error(`[tasklocal] Could not read data/${filename}:`, error);
    return null;
  }
}

export async function writeJsonFile(filename: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(DATA_DIR, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * Loads the customer-facing listing catalogue: active listings only, validated,
 * de-duplicated, and joined to their providers.
 *
 * Rejected records are logged server-side so they can be reviewed, and also
 * returned as `issues` for display in the data-quality panel.
 */
export async function getCatalogue(): Promise<ListingsResult> {
  try {
    const [rawListings, rawProviders] = await Promise.all([
      readJsonFile('listings.json'),
      readJsonFile('providers.json'),
    ]);

    const result = sanitizeListings(rawListings, rawProviders);

    for (const issue of result.issues) {
      const log = issue.severity === 'dropped' ? console.warn : console.info;
      log(`[tasklocal:data] ${issue.severity} ${issue.scope} ${issue.id} — ${issue.reason}`);
    }

    return result;
  } catch (error) {
    console.error('[tasklocal] Failed to build the listing catalogue:', error);
    return {
      listings: [],
      issues: [
        {
          scope: 'listing',
          id: '—',
          severity: 'dropped',
          reason: `Catalogue could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
