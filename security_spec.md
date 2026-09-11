# Security Specification

> **Corrected 2026-09-10.** The previous version of this file declared three
> invariants that the rules **never enforced** — per-`ownerId` isolation on
> Products and Sales, and Sale immutability. Stating a guarantee that does not
> exist is worse than stating none, so they are documented below as *not
> enforced* rather than silently dropped. The access model was also rewritten:
> as of commit `e029765` the gate is the custom claim `admin`, not merely being
> signed in.

## Access model

Single-tenant. There is one business and one set of staff accounts; there is no
per-user data isolation and none is intended.

- **`isStaff()`** — `request.auth != null && request.auth.token.admin == true`.
  The claim is granted by hand with `scripts/set_admin_claim.mjs`. An anonymous
  session can never carry it, and neither can an account that self-registers
  with the public API key. This is the only boundary between staff and public.
- Gated behind `isStaff()`: `products`, `sales`, `purchases`, `customers`,
  `suppliers`, `movimientos`, `counters`, and `company` (list + write).
- Publicly readable by design, no session required: `catalogo_publico`,
  `objeciones_universales`, `objeciones_categoria`, `config`, and the single
  document `company/shared_store`. None of them carries `cost`, sales data, or
  customer PII.
- The Anonymous auth provider stays **enabled** — PandaLink and PandaWEB rely on
  it — and is harmless because it grants no claim.

## Invariants the rules DO enforce

1. Only a session with the `admin` claim reads or writes the sensitive
   collections listed above.
2. Writes are validated by field whitelist: `keys().hasOnly([...])` plus a type
   and bound check per field. Adding a field requires touching the type, the Zod
   schema (`src/lib/validations.ts`) and the rule together.
3. Arrays are bounded — `items` in a Sale is capped at 100 elements.
4. Document ids are constrained to `^[a-zA-Z0-9_\-]+$`, max 128 chars.
5. `movimientos` is a genuinely immutable ledger: `create` only, `update` and
   `delete` are `false` for everyone, staff included.
6. `catalogo_publico` takes **no** client writes at all. It is written only by
   the Admin SDK (`scripts/backfill_catalogo_publico.mjs`), which bypasses rules.
7. A Product `update` cannot change `createdAt` or `ownerId`, and is restricted
   by `affectedKeys().hasOnly([...])`.
8. A Sale carrying a `financiamiento` map must have `paymentMethod ==
   'FINANCIAMIENTO'`, and the plan's fields are range-checked.

## Invariants the rules DO **NOT** enforce (known gaps)

1. **`ownerId` is not an ownership boundary.** It is only type-checked
   (`data.ownerId is string`); it is never compared to `request.auth.uid`, and
   no read rule mentions it. Any staff session can write a document claiming any
   `ownerId`. In practice the app hardcodes `'shared_store'`.
2. **Sales are not immutable.** Staff can `update` and `delete` them. Worse, the
   Sale `update` rule re-validates the whole document but has no
   `affectedKeys()` restriction, so the total of an already-issued invoice can
   be rewritten. (Products *do* have that restriction; Sales do not.)
3. **No rate limiting or write-volume cap** beyond per-document validation.
4. The top-level `match /{document=**} { allow read, write: if false }` protects
   only collections with no rule of their own. Firestore evaluates rules as a
   union: that `false` never overrides an `allow` below it.

## The "Dirty Dozen" payloads

Rejected today: shadow-field injection (3), oversized strings (4), oversized
arrays (5), value poisoning (6), update gap on Products (9), id poisoning (10),
type mismatch (11), unauthenticated access (12) — and, since `e029765`,
*authenticated-but-not-staff* access, which is the case that actually mattered.

Not rejected, by the gaps above: identity spoofing via `ownerId` (1), orphaned
write (2), temporal fraud on `createdAt` (7), and state tampering on a Sale (8).

## Test runner

`firestore.rules.test.ts`, run with `npm run test:rules` (Firestore emulator,
needs JDK 21+). 26 cases covering the public surface, the staff surface, and the
anonymous-session exclusions. Against the pre-`e029765` rules, 14 of them fail —
one per hole that was closed.

The gaps listed above are deliberately **not** covered by passing tests, because
they are not currently enforced. Add the test at the same time as the rule.
