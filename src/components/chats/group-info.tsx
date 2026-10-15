"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellOff, Crown, LogOut, Shield, UserMinus, UserPlus } from "lucide-react";
import { useUser } from "@/components/app/user-context";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import type { ChatListItemDTO, MemberDTO } from "@/lib/chats/types";
import { useChats } from "./chat-store";
import { PeoplePicker, type PickedPerson } from "./people-picker";

type Role = "OWNER" | "ADMIN" | "MEMBER";

/** Group info: photo, name, description, members and roles, add/remove, leave. */
export function GroupInfoSheet({
  open,
  onClose,
  chat,
  description,
  members,
  myRole,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  chat: ChatListItemDTO;
  description: string | null;
  members: MemberDTO[];
  myRole: Role | null;
  onChanged: () => void;
}) {
  const me = useUser();
  const router = useRouter();
  const toast = useToast();
  const { updateSettings } = useChats();
  const isAdmin = myRole === "OWNER" || myRole === "ADMIN";
  const [form, setForm] = useState({ title: chat.title, description: description ?? "" });
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<PickedPerson[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const fail = (err: unknown, fallback: string) => toast(err instanceof ClientApiError ? err.message : fallback, "error");

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      if (done) toast(done);
      onChanged();
      router.refresh();
    } catch (err) {
      fail(err, "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", () => api(`/api/chats/${chat.id}/group`, { method: "PATCH", body: { title: form.title, description: form.description || null } }), "Group updated");

  const add = () =>
    run(
      "add",
      async () => {
        await api(`/api/chats/${chat.id}/members`, { body: { userIds: picked.map((p) => p.id) } });
        setPicked([]);
        setAdding(false);
      },
      "Added to the group",
    );

  async function leave() {
    if (!confirm(myRole === "OWNER" ? "Leave the group? Ownership passes to an admin (or the longest-standing member)." : "Leave this group?")) return;
    setBusy("leave");
    try {
      await api(`/api/chats/${chat.id}/members/${me.id}`, { method: "DELETE" });
      onClose();
      router.replace("/chats");
      router.refresh();
    } catch (err) {
      fail(err, "Couldn't leave.");
      setBusy(null);
    }
  }

  const dirty = form.title !== chat.title || form.description !== (description ?? "");

  return (
    <Sheet open={open} onClose={onClose} title="Group info">
      <div className="flex flex-col gap-5 pt-1">
        {isAdmin ? (
          <AvatarPicker name={chat.title} avatarUrl={chat.avatarUrl} chatId={chat.id} size={88} onChange={() => router.refresh()} />
        ) : (
          <div className="flex justify-center">
            <Avatar name={chat.title} src={chat.avatarUrl} size={88} />
          </div>
        )}

        {isAdmin ? (
          <div className="flex flex-col gap-3">
            <Input label="Group name" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={64} />
            <Textarea label="Description" optional value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={255} rows={2} />
            {dirty && (
              <Button loading={busy === "save"} onClick={save}>
                Save
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-xl font-bold">{chat.title}</p>
            {description && <p className="mt-1 text-[15px] whitespace-pre-wrap text-muted">{description}</p>}
          </div>
        )}

        <Button variant="secondary" onClick={() => updateSettings(chat.id, { mute: chat.muted ? "off" : "forever" })}>
          {chat.muted ? <Bell className="size-[18px]" /> : <BellOff className="size-[18px]" />}
          {chat.muted ? "Unmute" : "Mute notifications"}
        </Button>

        <section aria-labelledby="members-h">
          <div className="flex items-center justify-between">
            <h3 id="members-h" className="text-[13px] font-bold tracking-wide text-muted uppercase">
              {members.length} members
            </h3>
            {isAdmin && !adding && (
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                <UserPlus className="size-4" aria-hidden="true" /> Add
              </Button>
            )}
          </div>
          {adding && (
            <div className="glass-1 mt-2 flex flex-col gap-2 rounded-2xl p-3">
              <PeoplePicker picked={picked} onChange={setPicked} exclude={members.map((m) => m.id)} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!picked.length} loading={busy === "add"} onClick={add}>
                  Add {picked.length || ""}
                </Button>
              </div>
            </div>
          )}
          <ul className="mt-1 divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={m.displayName} src={m.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                    {m.id === me.id ? "You" : m.displayName}
                    {m.role === "OWNER" && <Crown className="size-3.5 text-accent" aria-label="Owner" />}
                    {m.role === "ADMIN" && <Shield className="size-3.5 text-accent" aria-label="Admin" />}
                  </p>
                  <p className="truncate text-[13px] text-muted">
                    @{m.username}
                    {m.role !== "MEMBER" && ` · ${m.role === "OWNER" ? "owner" : "admin"}`}
                  </p>
                </div>
                {m.id !== me.id && (
                  <div className="flex shrink-0 gap-1">
                    {myRole === "OWNER" && m.role !== "OWNER" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `role-${m.id}`}
                        onClick={() =>
                          run(`role-${m.id}`, () =>
                            api(`/api/chats/${chat.id}/members/${m.id}`, { method: "PATCH", body: { role: m.role === "ADMIN" ? "MEMBER" : "ADMIN" } }),
                          )
                        }
                      >
                        {m.role === "ADMIN" ? "Remove admin" : "Make admin"}
                      </Button>
                    )}
                    {isAdmin && m.role !== "OWNER" && (m.role !== "ADMIN" || myRole === "OWNER") && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${m.displayName}`}
                        loading={busy === `rm-${m.id}`}
                        onClick={() =>
                          confirm(`Remove ${m.displayName} from the group?`) &&
                          run(`rm-${m.id}`, () => api(`/api/chats/${chat.id}/members/${m.id}`, { method: "DELETE" }), `${m.displayName} removed`)
                        }
                      >
                        <UserMinus className="size-[18px] text-danger" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <Button variant="danger" loading={busy === "leave"} onClick={leave}>
          <LogOut className="size-[18px]" aria-hidden="true" /> Leave group
        </Button>
      </div>
    </Sheet>
  );
}
