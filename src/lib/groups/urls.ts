/** Group photo URL: an authorized redirect for members only. */
export function groupAvatarUrl(chatId: string, avatarKey: string | null): string | null {
  if (!avatarKey) return null;
  const version = avatarKey.slice(avatarKey.lastIndexOf("/") + 1, avatarKey.lastIndexOf("."));
  return `/api/media/group-avatar/${chatId}?v=${version}`;
}
