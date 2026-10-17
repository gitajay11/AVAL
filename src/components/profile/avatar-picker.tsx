"use client";

import dynamic from "next/dynamic";
import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";
import { cropToCanvas, type CropArea } from "@/lib/client/crop";
import { uploadAvatar } from "@/lib/client/upload-avatar";
import type { MyContactDTO } from "@/lib/contacts/types";
import type { Me } from "@/lib/users";

// Only loaded once a photo is picked.
const ImageCropper = dynamic(() => import("@/components/ui/image-cropper").then((m) => m.ImageCropper), { ssr: false });

type Props = {
  name: string;
  avatarUrl: string | null;
  size?: number;
} & (
  | { contactId?: undefined; chatId?: undefined; onChange: (me: Me) => void }
  | { contactId: string; chatId?: undefined; onChange: (contact: MyContactDTO) => void }
  | { chatId: string; contactId?: undefined; onChange: () => void }
);

/**
 * Tap the photo to choose a new one, crop it (1:1, squircle mask, zoom, rotate),
 * and the cropped picture shows immediately while it uploads. Sets my own photo, a personal contact's (`contactId`) or a group's (`chatId`).
 */
export function AvatarPicker({ name, avatarUrl, size = 112, ...target }: Props) {
  const apply = (r: { user?: Me; contact?: MyContactDTO }) => {
    if (target.chatId !== undefined) target.onChange();
    else if (target.contactId !== undefined) {
      if (r.contact) target.onChange(r.contact);
    } else if (r.user) target.onChange(r.user);
  };
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const toast = useToast();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Choose an image file.", "error");
    setPicked({ file, url: URL.createObjectURL(file) });
  }

  function closeCropper() {
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(null);
  }

  async function onCropped(area: CropArea, rotation: number) {
    if (!picked) return;
    const { file } = picked;
    closeCropper();
    setBusy(true);
    let local: string | null = null;
    try {
      const square = await cropToCanvas(file, area, rotation, 1080);
      local = square.toDataURL("image/jpeg", 0.8);
      setPreview(local);
      apply(await uploadAvatar(square, { contactId: target.contactId, chatId: target.chatId }));
      toast("Photo updated");
    } catch (err) {
      toast(err instanceof ClientApiError ? err.message : "Upload failed.", "error");
    } finally {
      setBusy(false);
      setPreview(null);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      if (target.chatId !== undefined) {
        await api(`/api/chats/${target.chatId}/group`, { method: "PATCH", body: { removeAvatar: true } });
        apply({});
      } else if (target.contactId !== undefined) {
        const r = await api<{ contact: MyContactDTO }>(`/api/contacts/${target.contactId}`, { method: "PATCH", body: { removeAvatar: true } });
        apply(r);
      } else {
        apply(await api<{ user: Me }>("/api/me/avatar", { method: "DELETE" }));
      }
      toast("Photo removed");
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
      {picked && (
        <ImageCropper src={picked.url} title="Crop photo" shape="squircle" saveLabel="Set photo" onCancel={closeCropper} onSave={onCropped} />
      )}
      {avatarUrl && !busy && (
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden="true" /> Remove photo
        </Button>
      )}
    </div>
  );
}
