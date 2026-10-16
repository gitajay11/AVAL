import { json, parseJson, route } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { createChatUpload } from "@/lib/media/uploads";
import { rateLimit } from "@/lib/security/rate-limit";
import { UploadRequestSchema } from "@/lib/validation/chat";

/** Reserve a chat media upload and get a presigned storage PUT (image, video, voice note or file). */
export const POST = route(async (req) => {
  const { user } = await requireSession();
  await rateLimit("mediaUpload", user.id);
  const input = await parseJson(req, UploadRequestSchema);
  return json(await createChatUpload(user, input), { status: 201 });
});
