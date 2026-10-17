-- Phase 8: personal contacts get a required @username in the namespace users
-- already use (one `handles` table holds both), and private nicknames.

-- ───────────── Shared username namespace ─────────────

CREATE TABLE "handles" (
    "handle_lower" VARCHAR(20) COLLATE "C" NOT NULL,
    "user_id" UUID,
    "contact_id" UUID,

    CONSTRAINT "handles_pkey" PRIMARY KEY ("handle_lower"),
    -- Each handle belongs to exactly one user or one contact.
    CONSTRAINT "handles_one_owner" CHECK (num_nonnulls("user_id", "contact_id") = 1)
);

CREATE UNIQUE INDEX "handles_user_id_key" ON "handles"("user_id");
CREATE UNIQUE INDEX "handles_contact_id_key" ON "handles"("contact_id");
ALTER TABLE "handles" ADD CONSTRAINT "handles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "handles" ADD CONSTRAINT "handles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "personal_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing user keeps their username.
INSERT INTO "handles" ("handle_lower", "user_id") SELECT "username_lower", "id" FROM "users";

-- Existing contacts get <letters and digits of the name, up to 12>_<6 hex>,
-- e.g. "Mom" -> "mom_3f9a1c". Collisions with a user are retried with more hex.
ALTER TABLE "personal_contacts" ADD COLUMN "username" VARCHAR(20), ADD COLUMN "username_lower" VARCHAR(20) COLLATE "C";

DO $$
DECLARE
  c record;
  base text;
  candidate text;
  n int;
BEGIN
  FOR c IN SELECT "id", "name" FROM "personal_contacts" ORDER BY "created_at" LOOP
    base := left(coalesce(nullif(regexp_replace(lower(c."name"), '[^a-z0-9]', '', 'g'), ''), 'contact'), 12);
    n := 6;
    LOOP
      candidate := left(base, 19 - n) || '_' || substr(md5(c."id"::text || n::text), 1, n);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "handles" WHERE "handle_lower" = candidate);
      n := n + 1;
    END LOOP;
    INSERT INTO "handles" ("handle_lower", "contact_id") VALUES (candidate, c."id");
    UPDATE "personal_contacts" SET "username" = candidate, "username_lower" = candidate WHERE "id" = c."id";
  END LOOP;
END $$;

ALTER TABLE "personal_contacts" ALTER COLUMN "username" SET NOT NULL, ALTER COLUMN "username_lower" SET NOT NULL;
-- COLLATE "C" (above) lets this index serve prefix search too.
CREATE UNIQUE INDEX "personal_contacts_username_lower_key" ON "personal_contacts"("username_lower");

-- ───────────── Private nicknames ─────────────

CREATE TABLE "contact_aliases" (
    "owner_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "alias" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_aliases_pkey" PRIMARY KEY ("owner_id","target_user_id")
);

CREATE INDEX "contact_aliases_target_user_id_idx" ON "contact_aliases"("target_user_id");
ALTER TABLE "contact_aliases" ADD CONSTRAINT "contact_aliases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_aliases" ADD CONSTRAINT "contact_aliases_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
