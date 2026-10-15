"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { uploadAvatar } from "@/lib/client/upload-avatar";
import type { Me } from "@/lib/users";

type Props = {
  name: string;
  avatarUrl: string | null;
  onChange: (me: Me) => void;
  size?: number;
};

/** Tap the photo to choose a new one; a preview shows immediately while it uploads. */
export function AvatarPicker({ name, avatarUrl, onChange, size = 112 }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const local = URL.createObjectURL(file);
    setPreview(local);
    setBusy(true);
    try {
      onChange(await uploadAvatar(file));
      toast("Profile photo updated");
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Upload failed.", "error");
    } finally {
      setBusy(false);
      setPreview(null);
      URL.revokeObjectURL(local);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      const { user } = await api<{ user: Me }>("/api/me/avatar", { method: "DELETE" });
      onChange(user);
      toast("Profile photo removed");
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Couldn't remove photo.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="group relative rounded-full"
        aria-label="Change profile photo"
      >
        <Avatar name={name} src={preview ?? avatarUrl} size={size} className="ring-4 ring-surface shadow-soft" />
        {busy ? (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/35 text-white">
            <Spinner className="size-6" />
          </span>
        ) : (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="size-6" aria-hidden="true" />
          </span>
        )}
        <span className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full bg-brand text-white ring-4 ring-surface">
          <Camera className="size-4" aria-hidden="true" />
        </span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={onFile} />
      {avatarUrl && !busy && (
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden="true" /> Remove photo
        </Button>
      )}
    </div>
  );
}
