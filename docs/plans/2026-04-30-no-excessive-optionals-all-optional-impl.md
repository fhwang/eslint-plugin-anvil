# `no-excessive-optionals` All-Optional Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a second trigger to the `no-excessive-optionals` rule that fires when 100% of a type's members are optional or nullable, with a configurable size floor (default 2) so trivial 1-property types stay un-flagged.

**Architecture:** Extend the existing reporter in `src/rules/no-excessive-optionals.ts` with one additional branch. When both the new "all optional" condition and the existing "excessive" condition match, the new one wins (it's a sharper diagnosis). A new `allOptional` messageId is added. A new option `allOptionalMinSize` (default `2`) controls the floor.

**Tech Stack:** TypeScript, `@typescript-eslint/utils`, jest + `@typescript-eslint/rule-tester`, pnpm. ESLint plugin self-lints via `pnpm run lint` (which builds first).

**Design reference:** `docs/plans/2026-04-30-no-excessive-optionals-all-optional-design.md`

**Working directory:** `.worktrees/all-optional-check` (worktree on branch `feat/all-optional-check`).

---

## Pre-flight checklist

Before starting, confirm baseline is clean:

```bash
cd .worktrees/all-optional-check
pnpm test
```

Expected: 21 tests pass.

---

## Task 1: Add `allOptional` messageId + minimal detection (no option yet)

**Files:**
- Modify: `tests/no-excessive-optionals.test.ts`
- Modify: `src/rules/no-excessive-optionals.ts`

The first cycle hardcodes the floor at 2. The configurable option comes in Task 2.

### Step 1: Write the first failing test

Add a new entry to the `invalid` array in `tests/no-excessive-optionals.test.ts` (anywhere inside the array — append for now):

```ts
// Size-2, all `?`: 2/2 = 100% → allOptional
{
  code: `
    interface Pair {
      a?: string;
      b?: string;
    }
  `,
  errors: [
    {
      messageId: 'allOptional',
      data: {
        kind: 'Interface',
        name: 'Pair',
        optionalCount: '2',
        totalCount: '2',
      },
    },
  ],
},
```

### Step 2: Run test, confirm it fails

```bash
pnpm test -- -t "no-excessive-optionals"
```

Expected: failure mentioning either an unknown `messageId` `'allOptional'` or "Should have errors but had none" / "0 errors". Either is acceptable — the new behavior doesn't exist yet.

### Step 3: Add the `allOptional` messageId and detection branch

In `src/rules/no-excessive-optionals.ts`:

**3a.** Add a constant near the existing defaults:

```ts
const ALL_OPTIONAL_MIN_SIZE = 2;
```

**3b.** Update the `MessageIds` type:

```ts
type MessageIds = 'excessiveOptionals' | 'allOptional';
```

**3c.** Update the `messages` block in `meta`:

```ts
messages: {
  excessiveOptionals:
    '{{kind}} \'{{name}}\' has '
    + '{{optionalCount}}/{{totalCount}} '
    + 'optional or nullable members ({{percentage}}%). '
    + 'Consider modeling '
    + 'correlated state as a discriminated union.',
  allOptional:
    '{{kind}} \'{{name}}\' has '
    + '{{optionalCount}}/{{totalCount}} '
    + 'optional or nullable members (100%). '
    + 'Every member is optional, leaving no required structure. '
    + 'Consider modeling required state explicitly '
    + 'or using a discriminated union.',
},
```

**3d.** Modify the inner `report` function in `makeReporter`. Replace the existing `if (...)` block with a flipped-order `if / else if`:

```ts
return function report(args: ReportArgs): void {
  if (matchesPattern(args.name, opts.ignorePatterns)) {
    return;
  }
  const { total, optional } = checkMembers(args.members);
  if (total === 0) {
    return;
  }
  if (
    total >= ALL_OPTIONAL_MIN_SIZE
    && optional === total
  ) {
    context.report({
      node: args.node,
      messageId: 'allOptional',
      data: {
        kind: args.kind,
        name: args.name,
        optionalCount: String(optional),
        totalCount: String(total),
      },
    });
    return;
  }
  if (
    optional > opts.maxOptional
    && optional / total > opts.maxOptionalRatio
  ) {
    const percentage = Math.round(
      (optional / total) * PERCENTAGE_MULTIPLIER,
    );
    context.report({
      node: args.node,
      messageId: 'excessiveOptionals',
      data: {
        kind: args.kind,
        name: args.name,
        optionalCount: String(optional),
        totalCount: String(total),
        percentage: String(percentage),
      },
    });
  }
};
```

Note: the early `total === 0` guard replaces the `total > 0 &&` clause in the old condition — equivalent behavior, cleaner with two checks.

### Step 4: Run the new test, confirm it passes

```bash
pnpm test -- -t "no-excessive-optionals"
```

Expected: the new "Pair" test passes. **Other tests will likely now fail** — that's expected and addressed in Step 5.

### Step 5: Update existing tests whose messageId flips

The flipped order means existing 100%-optional cases now fire `allOptional` instead of `excessiveOptionals`. Update each in `tests/no-excessive-optionals.test.ts`:

| Test name (search by) | total/optional | Old messageId | New messageId |
|-----------------------|----------------|---------------|---------------|
| `UserProfile` (type alias) | 6/6 | `excessiveOptionals` | `allOptional` |
| `interface Snapshot` | 4/4 | `excessiveOptionals` | `allOptional` |
| `interface Triple` | 4/4 | `excessiveOptionals` | `allOptional` |
| `interface Mixed` | 4/4 | `excessiveOptionals` | `allOptional` |
| inline `function foo(opts: { a?...f? })` with `checkInlineTypes: true` | 6/6 | `excessiveOptionals` | `allOptional` |

For each: change the `messageId` value to `'allOptional'` and **remove the `percentage` key from the `data` object** (the new message doesn't interpolate `{{percentage}}`).

For tests that assert only `messageId` (no `data`): just change the messageId.

Tests that should NOT change (mixed ratios, not 100%):
- `interface Order` (6/8 = 75%)
- `interface Foo` with custom config (3/4 = 75%)
- `interface Document` (5/6 = 83%)
- `interface Foo` with nullable + custom config (3/4 = 75%)

### Step 6: Move `CcdSnapshotMeta` from valid → invalid

This is the motivating case. In `tests/no-excessive-optionals.test.ts`:

- Delete the `CcdSnapshotMeta` entry from the `valid` array (the comment above it reads "Mixed `?` and `| null` — 3 empty-able / 3 total = 100%, but count 3 not > 3").
- Add it to the `invalid` array:

```ts
// CcdSnapshotMeta: 3/3 = 100% → allOptional (motivating case)
{
  code: `
    interface CcdSnapshotMeta {
      source_document_key: string | null;
      source_document_date: string | null;
      note?: string;
    }
  `,
  errors: [
    {
      messageId: 'allOptional',
      data: {
        kind: 'Interface',
        name: 'CcdSnapshotMeta',
        optionalCount: '3',
        totalCount: '3',
      },
    },
  ],
},
```

### Step 7: Add a size-1 valid test (confirms the floor)

Add to the `valid` array:

```ts
// Size-1 fully optional: below floor, not flagged
{
  code: `
    interface Note {
      note?: string;
    }
  `,
},
```

### Step 8: Run full test suite, confirm all pass

```bash
pnpm test
```

Expected: all tests pass (count will be 21 + new tests; minus the moved one).

### Step 9: Commit

```bash
git add src/rules/no-excessive-optionals.ts tests/no-excessive-optionals.test.ts
git commit -m "Add allOptional check to no-excessive-optionals

Flag types where 100% of members are optional or nullable, with a
hardcoded floor of 2 to skip trivial size-1 cases. When both the
new and old triggers would fire, the new one wins (sharper diagnosis).

Existing tests for 100%-optional cases now expect the new messageId."
```

---

## Task 2: Make the floor configurable via `allOptionalMinSize`

**Files:**
- Modify: `tests/no-excessive-optionals.test.ts`
- Modify: `src/rules/no-excessive-optionals.ts`

### Step 1: Write a failing test for the option

Add to the `valid` array:

```ts
// allOptionalMinSize override: size-2 all-optional opted out
{
  code: `
    interface Pair {
      a?: string;
      b?: string;
    }
  `,
  options: [{ allOptionalMinSize: 3 }],
},
```

### Step 2: Run, confirm it fails

```bash
pnpm test -- -t "no-excessive-optionals"
```

Expected: failure. The schema rejects the unknown option, OR the rule fires `allOptional` despite the override. Either is acceptable.

### Step 3: Plumb the option through

In `src/rules/no-excessive-optionals.ts`:

**3a.** Rename the constant:

```ts
const DEFAULT_ALL_OPTIONAL_MIN_SIZE = 2;
```

(Replace the `ALL_OPTIONAL_MIN_SIZE` from Task 1.)

**3b.** Add to the `Options` type:

```ts
type Options = [
  {
    maxOptional?: number;
    maxOptionalRatio?: number;
    allOptionalMinSize?: number;
    checkInlineTypes?: boolean;
    ignorePatterns?: string[];
  },
];
```

**3c.** Add to `ResolvedOptions`:

```ts
interface ResolvedOptions {
  maxOptional: number;
  maxOptionalRatio: number;
  allOptionalMinSize: number;
  checkInlineTypes: boolean;
  ignorePatterns: string[];
}
```

**3d.** Add to `resolveOptions`:

```ts
allOptionalMinSize:
  options.allOptionalMinSize ?? DEFAULT_ALL_OPTIONAL_MIN_SIZE,
```

**3e.** Add to the schema in `meta`:

```ts
allOptionalMinSize: { type: 'number', minimum: 1 },
```

**3f.** Add to `defaultOptions`:

```ts
allOptionalMinSize: DEFAULT_ALL_OPTIONAL_MIN_SIZE,
```

**3g.** Use the resolved value in `report`:

```ts
if (
  total >= opts.allOptionalMinSize
  && optional === total
) {
```

### Step 4: Add a complementary invalid test for the option

For symmetry, add to the `invalid` array:

```ts
// allOptionalMinSize: 2 (default), size-2 all-optional → triggers
// (Already covered by the basic Pair test from Task 1; this adds an
// explicit lower override to confirm the option direction.)
{
  code: `
    interface Single {
      note?: string;
    }
  `,
  options: [{ allOptionalMinSize: 1 }],
  errors: [
    {
      messageId: 'allOptional',
      data: {
        kind: 'Interface',
        name: 'Single',
        optionalCount: '1',
        totalCount: '1',
      },
    },
  ],
},
```

### Step 5: Run tests, confirm pass

```bash
pnpm test
```

Expected: all tests pass.

### Step 6: Commit

```bash
git add src/rules/no-excessive-optionals.ts tests/no-excessive-optionals.test.ts
git commit -m "Make allOptional floor configurable via allOptionalMinSize

Default is 2 (size-1 types stay un-flagged). Setting it to a higher
number opts out larger sizes; setting it to 1 catches size-1."
```

---

## Task 3: Final verification

### Step 1: Build

```bash
pnpm run build
```

Expected: clean.

### Step 2: Typecheck

```bash
pnpm run typecheck
```

Expected: clean.

### Step 3: Check types (forbid-junk-object-types)

```bash
pnpm run check-types
```

Expected: clean.

### Step 4: Lint (self-referential — uses the built plugin)

```bash
pnpm run lint
```

Expected: clean. The plugin lints itself; if any internal interface in `src/` is now flagged by the new check, that's a real signal worth investigating before proceeding.

### Step 5: Full test suite

```bash
pnpm test
```

Expected: all tests pass.

### Step 6: Sanity-check the diff

```bash
git log --oneline main..HEAD
git diff main..HEAD -- src/ tests/
```

Read the diff. Confirm:
- `MessageIds` includes both ids.
- `messages` block has both texts.
- `Options`, `ResolvedOptions`, schema, `defaultOptions`, and `resolveOptions` all include `allOptionalMinSize`.
- The reporter has the flipped-order `if / else if`.
- Tests cover: size-1 valid, size-2 all-optional invalid, CcdSnapshotMeta moved to invalid, option override valid + lower-override invalid, existing 100%-cases use `allOptional`.

If anything is off, fix and amend or add a follow-up commit.

---

## What is intentionally NOT in this plan

- **Auto-fix.** The right transformation is domain-specific (split into a discriminated union, lift to required). Not mechanical.
- **A separate boolean disable toggle.** Setting `allOptionalMinSize` to a very large number is the opt-out. YAGNI on a second knob.
- **A tunable ratio for the new check.** "All optional" is a discrete signal. Users wanting a softer ratio already have `maxOptionalRatio`.
- **Updating README / docs/rules.** No such files exist yet in the repo; out of scope for this change.
