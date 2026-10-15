-- CreateIndex
CREATE INDEX "messages_chat_id_sender_id_idx" ON "messages"("chat_id", "sender_id");
