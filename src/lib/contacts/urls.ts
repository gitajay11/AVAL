/** Contact photo URL: an authorized redirect (owner, viewers, or anyone while public). */
export function contactAvatarUrl(contactId: string, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  const version = avatarKey.slice(avatarKey.lastIndexOf("/") + 1, avatarKey.lastIndexOf("."));
  return `/api/media/contact-avatar/${contactId}?v=${version}`;
}
