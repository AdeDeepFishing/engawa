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

/** Which of these cards still have no masked copy. A merge into an already masked card needs no new object. */
export async function cardsWithoutMaskedImage(cardIds: string[]): Promise<string[]> {
  if (cardIds.length === 0) return [];
  const { data, error } = await db()
    .from("cards")
    .select("id")
    .in("id", cardIds)
    .is("masked_image_path", null);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((c) => c.id);
}

/**
 * Records the masked copy on these cards, where they have none yet, and
 * returns how many rows it changed. Zero means the object belongs to no
 * card and must be removed by the caller, or it would sit in Storage with
 * nothing to purge it.
 */
export async function attachMaskedImage(cardIds: string[], path: string): Promise<number> {
  if (cardIds.length === 0) return 0;
  const { data, error } = await db()
    .from("cards")
    .update({ masked_image_path: path })
    .in("id", cardIds)
    .is("masked_image_path", null)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** Removes a masked object. Never throws: the caller is already on an error path. */
export async function removeMaskedImage(path: string): Promise<void> {
  const { error } = await db().storage.from(SUBMISSIONS_BUCKET).remove([path]);
  if (error) console.error(`masked image ${path} could not be removed:`, error.message);
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
