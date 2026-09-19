import { referenceImageFileError } from "./referenceImageUpload";

export function selectReferenceBatch<
  T extends { name: string; type: string; size: number },
>(files: T[], slots: number) {
  const accepted: T[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const error = referenceImageFileError(file);
    if (error) errors.push(`${file.name}: ${error}`);
    else if (accepted.length >= Math.max(0, slots))
      errors.push(`${file.name}: No space left in this batch.`);
    else accepted.push(file);
  }
  return { accepted, errors };
}

// One request at a time keeps image payloads bounded. Successful files are
// never retried when another member of the batch fails.
export async function uploadReferenceBatch<T>(
  items: T[],
  upload: (item: T) => Promise<unknown>,
  settled: (item: T, error?: unknown) => void
) {
  for (const item of items) {
    try {
      await upload(item);
      settled(item);
    } catch (error) {
      settled(item, error ?? new Error("Upload failed"));
    }
  }
}
