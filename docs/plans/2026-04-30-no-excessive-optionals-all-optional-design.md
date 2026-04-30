# `no-excessive-optionals`: catch all-optional types

## Background

The current rule fires when **both** conditions hold:

- `optional > maxOptional` (default `3` — strict `>`, so 4+ optionals)
- `optional / total > maxOptionalRatio` (default `0.5`)

This misses a structurally-meaningful case: small types where **every**
member is optional or nullable. Example:

```ts
interface CcdSnapshotMeta {
  source_document_key: string | null;
  source_document_date: string | null;
  note?: string;
}
```

Optional/nullable count is `3/3` (100%), but `3 > 3` is false, so the
existing rule does not fire. Yet such a type has no required spine —
any consumer must handle the all-absent case, which is rarely the
intent.

## Goal

Flag types where 100% of members are optional or nullable, with a size
floor that excludes the trivial single-property case (where the rule's
"discriminated union" advice does not apply).

## Design

### Detection

A second trigger path is added to `makeReporter`. Order matters: when
both conditions hold, the all-optional message is more pointed
("no required spine") and is preferred.

```ts
if (total >= allOptionalMinSize && optional === total) {
  report 'allOptional'
} else if (
  optional > maxOptional
  && total > 0
  && optional / total > maxOptionalRatio
) {
  report 'excessiveOptionals'
}
```

`ignorePatterns` continues to short-circuit before either check, so
`*Config`, `*Options`, `*Props`, `*Params` types pass through both
paths.

### New option

```ts
allOptionalMinSize?: number; // default 2
```

The floor is `2`, not `1`: a single-property optional type
(`{ note?: string }`) has a legitimate semantic distinction from
`note: string | undefined` (the property may be absent vs. present
with an undefined value). The rule's advice — "consider a
discriminated union" — has nothing to discriminate against in a
size-1 type, so flagging it would emit advice that does not apply.

To opt out entirely, set the option to a very large number. A
separate boolean disable toggle is YAGNI.

### New messageId

`allOptional`, with text:

> `{{kind}} '{{name}}' has {{optionalCount}}/{{totalCount}} optional
> or nullable members (100%). Every member is optional, leaving no
> required structure. Consider modeling required state explicitly or
> using a discriminated union.`

The existing `excessiveOptionals` messageId and text are unchanged.

### Behavior matrix (with defaults)

| total | optional | fires |
|-------|----------|-------|
| 1     | 1        | — (below floor) |
| 2     | 2        | `allOptional` |
| 2     | 1        | — |
| 3     | 3        | `allOptional` (the motivating case) |
| 3     | 2        | — |
| 4     | 4        | `allOptional` (preferred over count framing) |
| 5     | 4        | `excessiveOptionals` (80%, not 100%) |
| 5     | 3        | — |
| 6     | 5        | `excessiveOptionals` |

## Implementation notes

- Add `DEFAULT_ALL_OPTIONAL_MIN_SIZE = 2` alongside existing constants.
- Extend `Options`, `ResolvedOptions`, `resolveOptions`, schema, and
  `defaultOptions` to include `allOptionalMinSize`.
- Add `'allOptional'` to the `MessageIds` union and the `messages`
  block in `meta`.
- The reporting helper grows a small branch; the visitor structure
  is unchanged.

## Tests

In `tests/no-excessive-optionals.test.ts`:

**Valid (should not trigger):**

- Size-1, fully optional: `interface X { note?: string }`.
- Size-2, partially optional: `interface X { a: string; b?: string }`.
- Size-3, all optional, name matches `*Options`: exempted by
  `ignorePatterns`.
- Size-2, all optional, with `allOptionalMinSize: 3` override: opted
  out.

**Invalid (should trigger `allOptional`):**

- Size-2, all `?`.
- Size-2, all nullable unions.
- The `CcdSnapshotMeta` shape verbatim (mix of `| null` and `?`).
- Size-3, all `?` — the path the existing rule misses.
- Size-4, all optional — confirms `allOptional` is preferred over
  `excessiveOptionals` when both match.

**Invalid (should trigger `excessiveOptionals`):**

- Size-5, 4 optional (80%) — not 100%, falls into the existing path.

Tests assert on `messageId` rather than full text so wording can be
tweaked later without test churn.

## Out of scope

- Tunable ratio for the new check. "All optional" is treated as a
  discrete signal, not a tunable threshold; users who want a softer
  ratio already have `maxOptionalRatio`.
- Auto-fix. The right transformation is domain-specific (split into a
  discriminated union, lift to required, etc.) and not mechanical.
