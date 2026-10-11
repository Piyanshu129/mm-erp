-- Deleted users who created records are kept (hidden, unable to log in) so
-- those records still show who made them.
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);
