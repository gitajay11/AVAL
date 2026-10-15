"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { PeoplePicker, type PickedPerson } from "./people-picker";

/** Pick people, name the group, create it and open it. */
export function NewGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<PickedPerson[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { chatId } = await api<{ chatId: string }>("/api/groups", { body: { title: title.trim(), memberIds: picked.map((p) => p.id) } });
      onClose();
      setPicked([]);
      setTitle("");
      router.push(`/chats/${chatId}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't create the group.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New group" description="Add people who accept messages from you.">
      <form onSubmit={create} className="flex flex-col gap-4 pt-1">
        <Input label="Group name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={64} required autoFocus />
        <PeoplePicker picked={picked} onChange={setPicked} />
        <Button type="submit" loading={busy} disabled={!title.trim() || picked.length === 0}>
          Create group{picked.length ? ` with ${picked.length + 1}` : ""}
        </Button>
      </form>
    </Sheet>
  );
}
