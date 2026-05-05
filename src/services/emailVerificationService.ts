const APIFY_ENDPOINT =
  'https://api.apify.com/v2/acts/michael.g~email-verifier-validator/run-sync-get-dataset-items';

interface ApifyResultItem {
  email: string;
  status: 'good' | 'bad' | 'risky' | string;
  technical_status: 'valid' | 'invalid' | 'catch_all' | 'unknown' | string;
  reason: string;
  free?: boolean;
  role?: boolean;
  disposable?: boolean;
  error?: string;
}

export interface VerificationResult {
  /** Normalised codes: ok=valid, ko=invalid/unknown, mb=catch-all */
  code: 'ok' | 'ko' | 'mb';
  message: string;
  mx: string;
  isValid: boolean;
}

function mapItem(item: ApifyResultItem): VerificationResult {
  if (item.technical_status === 'catch_all') {
    return { code: 'mb', message: item.technical_status, mx: '', isValid: false };
  }
  if (item.technical_status === 'valid') {
    return { code: 'ok', message: item.reason, mx: '', isValid: true };
  }
  return { code: 'ko', message: item.technical_status ?? item.reason, mx: '', isValid: false };
}

async function verifyBatch(
  emails: string[],
  apiToken: string,
): Promise<Map<string, VerificationResult>> {
  const url = `${APIFY_ENDPOINT}?token=${encodeURIComponent(apiToken)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails }),
  });

  if (!response.ok) throw new Error(`Apify HTTP ${response.status}`);

  const raw = await response.json();
  const items: ApifyResultItem[] = Array.isArray(raw) ? raw : (raw.items ?? []);

  const map = new Map<string, VerificationResult>();
  for (const item of items) {
    if (item.email) map.set(item.email.toLowerCase(), mapItem(item));
  }
  return map;
}

export async function verifyEmail(email: string, apiToken: string): Promise<VerificationResult> {
  const map = await verifyBatch([email], apiToken);
  return map.get(email.toLowerCase()) ?? { code: 'ko', message: 'no result', mx: '', isValid: false };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Sends emails in chunks of 25 per Apify call (actor handles bulk natively).
// Small delay between chunks to avoid hammering the run endpoint.
export async function verifyEmailsInBatches(
  emails: string[],
  apiToken: string,
  onResult: (email: string, result: VerificationResult | null, error?: string) => void,
): Promise<void> {
  const CHUNK_SIZE = 25;
  const CHUNK_DELAY_MS = 1000;

  for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
    const chunk = emails.slice(i, i + CHUNK_SIZE);

    try {
      const map = await verifyBatch(chunk, apiToken);
      for (const email of chunk) {
        const result = map.get(email.toLowerCase()) ?? null;
        onResult(email, result, result ? undefined : 'No result returned');
      }
    } catch (err) {
      for (const email of chunk) {
        onResult(email, null, err instanceof Error ? err.message : 'Batch error');
      }
    }

    if (i + CHUNK_SIZE < emails.length) {
      await delay(CHUNK_DELAY_MS);
    }
  }
}
