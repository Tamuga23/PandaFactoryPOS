# Security Specification

## Data Invariants
1. A **Product** can only be created, read, updated, or deleted by its `ownerId`.
2. A **Sale** can only be recorded or read by its `ownerId`.
3. Sales are immutable after creation (no updates or deletes allowed).
4. Arrays like `items` in a Sale must be strictly bounded (max 100 elements).

## The "Dirty Dozen" Payloads
1. **Identity Spoofing Load**: Creating a Product where `ownerId` differs from `request.auth.uid`.
2. **Orphaned Write**: Creating a Sale without linking it to the current user's `ownerId`.
3. **Shadow Field Injection**: Sending an unknown `isAdmin: true` field during Product creation.
4. **Denial of Wallet (String Size)**: Injecting a 2MB string into `name` or `sku`.
5. **Denial of Wallet (Array Size)**: Sending 1000 items in a single Sale array.
6. **Value Poisoning**: Sending `price` as a string `"100"` instead of a number.
7. **Temporal Fraud**: Sending a `createdAt` timestamp that does not match `request.time`.
8. **State Tampering**: Attempting to `update` a Sale (which should be immutable).
9. **Update Gap**: Updating a Product with extraneous fields not allowed by `affectedKeys().hasOnly()`.
10. **ID Poisoning**: Passing a special character string like `../../../invalid` as `{productId}`.
11. **Type Mismatch**: Passing an array to a string context for `customerName`.
12. **Unauthenticated Access**: Reading or writing without being signed in.

## Test Runner
Verified by `firestore.rules.test.ts`.
