"use client";

import { createContext, useContext } from "react";

export type ClientUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
};

const UserContext = createContext<ClientUser | null>(null);

export function UserProvider({ user, children }: { user: ClientUser; children: React.ReactNode }) {
  return <UserContext value={user}>{children}</UserContext>;
}

export function useUser(): ClientUser {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used inside the app shell");
  return user;
}
