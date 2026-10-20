import { PrismaClient } from "@prisma/client";

// Interactive transactions ($transaction(async tx => ...)) default to a 5s
// limit. A multi-item purchase does several queries per item inside one
// transaction, and on a slow PC (slow disk, antivirus scanning database
// writes) a 3+ item purchase went past 5s and failed with a bare "Internal
// server error". The limits below leave plenty of room; a transaction that
// still exceeds them is reported clearly by errorHandler.ts.
export const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 15_000, // waiting for a connection
    timeout: 60_000, // running the transaction
  },
});
