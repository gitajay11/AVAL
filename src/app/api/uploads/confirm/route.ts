import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { confirmChatUpload } from "@/lib/media/uploads";
import { ConfirmUploadSchema } from "@/lib/validation/chat";

/** Verify a finished chat upload (size + file signature) so it can be sent. */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  const { uploadId } = await parseJson(req, ConfirmUploadSchema);
  return json(await confirmChatUpload(user.id, uploadId));
});
