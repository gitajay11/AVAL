-- AlterEnum
ALTER TYPE "AttachmentKind" ADD VALUE 'LINK_PREVIEW';

-- DropIndex
DROP INDEX "attachments_object_key_key";

-- CreateIndex
CREATE INDEX "attachments_object_key_idx" ON "attachments"("object_key");
