import { db, SUBMISSIONS_BUCKET } from "./client";
import type { StrippableMime } from "@/lib/image/strip";

/** Masked copies live under this prefix in the submissions bucket. */
export const MASKED_PREFIX = "masked";

/** Stores the masked copy of a submission's screenshot and returns its path. */
export async function uploadMaskedImage(
  boardId: string,
  submissionId: string,
  bytes: Uint8Array,
  mime: StrippableMime,
): Promise<string> {
  const ext = mime === "image/png" ? "png" : "jpg";
  const path = `${MASKED_PREFIX}/${boardId}/${submissionId}.${ext}`;
  const { error } = await db()
    .storage.from(SUBMISSIONS_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
  return path;
}

/** Records the masked copy on the cards this submission wrote, where they have none yet. */
export async function attachMaskedImage(cardIds: string[], path: string): Promise<void> {
  if (cardIds.length === 0) return;
  const { error } = await db()
    .from("cards")
    .update({ masked_image_path: path })
    .in("id", cardIds)
    .is("masked_image_path", null);
  if (error) throw error;
}

/**
 * The masked copy for a public card, or null when the card is not public
 * or has none. Held and hidden cards never serve an image.
 */
export async function getPublicMaskedImage(cardId: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const client = db();
  const { data, error } = await client
    .from("cards")
    .select("masked_image_path")
    .eq("id", cardId)
    .eq("visibility", "public")
    .not("masked_image_path", "is", null)
    .maybeSingle();
  if (error) throw error;
  const path = (data as { masked_image_path: string } | null)?.masked_image_path;
  if (!path) return null;
  const { data: blob, error: dlErr } = await client.storage.from(SUBMISSIONS_BUCKET).download(path);
  if (dlErr) {
    console.error(`masked image ${path} missing from storage:`, dlErr.message);
    return null;
  }
  return { bytes: await blob.arrayBuffer(), mime: path.endsWith(".png") ? "image/png" : "image/jpeg" };
}
