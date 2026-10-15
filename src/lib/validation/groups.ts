import { z } from "zod";
import { multiLine, singleLine } from "./common";

export const MAX_GROUP_MEMBERS = 200;
export const MAX_ADD_AT_ONCE = 50;

const title = singleLine(64).pipe(z.string().min(1, "Give the group a name"));

export const CreateGroupSchema = z.object({
  title,
  description: multiLine(255).optional(),
  memberIds: z.array(z.uuid()).min(1, "Add at least one person").max(MAX_ADD_AT_ONCE),
});

export const UpdateGroupSchema = z
  .object({ title, description: multiLine(255).nullable(), removeAvatar: z.literal(true) })
  .partial();

export const AddMembersSchema = z.object({ userIds: z.array(z.uuid()).min(1).max(MAX_ADD_AT_ONCE) });

export const SetRoleSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });
