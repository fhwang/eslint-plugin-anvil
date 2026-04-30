import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../src/rules/no-excessive-optionals';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: require('@typescript-eslint/parser'),
  },
});

ruleTester.run('no-excessive-optionals', rule, {
  valid: [
    // Below ratio threshold (3 optional out of 10 = 30%)
    {
      code: `
        interface MostlyRequired {
          a: string;
          b: string;
          c: string;
          d: string;
          e: string;
          f: string;
          g: string;
          h?: string;
          i?: string;
          j?: string;
        }
      `,
    },
    // Matches ignorePatterns — *Config
    {
      code: `
        interface AppConfig {
          a?: string;
          b?: string;
          c?: string;
          d?: string;
          e?: string;
          f?: string;
          g?: string;
          h?: string;
        }
      `,
    },
    // Matches ignorePatterns — *Props
    {
      code: `
        interface ButtonProps {
          a?: string;
          b?: string;
          c?: string;
          d?: string;
          e?: string;
          f?: string;
          g?: string;
          h?: string;
        }
      `,
    },
    // Matches ignorePatterns — *Options
    {
      code: `
        interface FetchOptions {
          a?: string;
          b?: string;
          c?: string;
          d?: string;
          e?: string;
          f?: string;
          g?: string;
          h?: string;
        }
      `,
    },
    // Matches ignorePatterns — *Params
    {
      code: `
        interface QueryParams {
          a?: string;
          b?: string;
          c?: string;
          d?: string;
          e?: string;
          f?: string;
          g?: string;
          h?: string;
        }
      `,
    },
    // Type alias pointing to non-object (union type)
    {
      code: `
        type Status = 'active' | 'inactive';
      `,
    },
    // Methods excluded from count
    {
      code: `
        interface Service {
          start(): void;
          stop(): void;
          reset(): void;
          configure(): void;
          validate(): void;
          process(): void;
          a?: string;
        }
      `,
    },
    // Inline type in function param — off by default
    {
      code: `
        function foo(opts: {
          a?: string;
          b?: string;
          c?: string;
          d?: string;
          e?: string;
          f?: string;
        }): void {}
      `,
    },
    // Single nullable field below threshold
    {
      code: `
        interface User {
          id: string;
          name: string;
          email: string;
          middleName: string | null;
        }
      `,
    },
    // ignorePatterns still applies to nullable-heavy types
    {
      code: `
        interface FetchConfig {
          a: string | null;
          b: string | null;
          c: string | null;
          d: string | null;
          e: string | null;
        }
      `,
    },
    // Size-1 fully optional: below floor, not flagged
    {
      code: `
        interface Note {
          note?: string;
        }
      `,
    },
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
  ],

  invalid: [
    // Interface: 6 optional out of 8 total (75%, > 50%)
    {
      code: `
        interface Order {
          id: string;
          status: string;
          refundedAt?: string;
          refundAmount?: number;
          shippedAt?: string;
          trackingNumber?: string;
          cancelledAt?: string;
          cancelReason?: string;
        }
      `,
      errors: [
        {
          messageId: 'excessiveOptionals',
          data: {
            kind: 'Interface',
            name: 'Order',
            optionalCount: '6',
            totalCount: '8',
            percentage: '75',
          },
        },
      ],
    },
    // Type alias: all optional, exceeds count
    {
      code: `
        type UserProfile = {
          bio?: string;
          avatar?: string;
          website?: string;
          location?: string;
          twitter?: string;
          github?: string;
        };
      `,
      errors: [
        {
          messageId: 'allOptional',
          data: {
            kind: 'Type',
            name: 'UserProfile',
            optionalCount: '6',
            totalCount: '6',
          },
        },
      ],
    },
    // Custom config: lower thresholds
    {
      code: `
        interface Foo {
          a: string;
          b?: string;
          c?: string;
          d?: string;
        }
      `,
      options: [{ maxOptional: 2, maxOptionalRatio: 0.5 }],
      errors: [
        {
          messageId: 'excessiveOptionals',
        },
      ],
    },
    // checkInlineTypes enabled
    {
      code: `
        function foo(opts: {
          a?: string;
          b?: string;
          c?: string;
          d?: string;
          e?: string;
          f?: string;
        }): void {}
      `,
      options: [{ checkInlineTypes: true, maxOptional: 5 }],
      errors: [
        {
          messageId: 'allOptional',
        },
      ],
    },
    // All `| null`: 4 nullable / 4 total = 100%, count 4 > 3
    {
      code: `
        interface Snapshot {
          a: string | null;
          b: string | null;
          c: string | null;
          d: string | null;
        }
      `,
      errors: [
        {
          messageId: 'allOptional',
          data: {
            kind: 'Interface',
            name: 'Snapshot',
            optionalCount: '4',
            totalCount: '4',
          },
        },
      ],
    },
    // Mixed `?` and `| null`: 5 empty-able / 6 total = 83%
    {
      code: `
        interface Document {
          id: string;
          author?: string;
          editor?: string;
          publishedAt: string | null;
          archivedAt: string | null;
          deletedAt: string | null;
        }
      `,
      errors: [
        {
          messageId: 'excessiveOptionals',
          data: {
            kind: 'Interface',
            name: 'Document',
            optionalCount: '5',
            totalCount: '6',
            percentage: '83',
          },
        },
      ],
    },
    // `T | null | undefined` counts once per field, not twice
    {
      code: `
        interface Triple {
          a: string | null | undefined;
          b: string | null | undefined;
          c: string | null | undefined;
          d: string | null | undefined;
        }
      `,
      errors: [
        {
          messageId: 'allOptional',
          data: {
            kind: 'Interface',
            name: 'Triple',
            optionalCount: '4',
            totalCount: '4',
          },
        },
      ],
    },
    // Nullable counting respects custom thresholds
    {
      code: `
        interface Foo {
          a: string;
          b: string | null;
          c: string | null;
          d: string | null;
        }
      `,
      options: [{ maxOptional: 2, maxOptionalRatio: 0.5 }],
      errors: [
        {
          messageId: 'excessiveOptionals',
        },
      ],
    },
    // Property both `?` and `| null` counts once
    {
      code: `
        interface Mixed {
          a?: string | null;
          b?: string | null;
          c?: string | null;
          d?: string | null;
        }
      `,
      errors: [
        {
          messageId: 'allOptional',
          data: {
            kind: 'Interface',
            name: 'Mixed',
            optionalCount: '4',
            totalCount: '4',
          },
        },
      ],
    },
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
    // SmallType: 3/3 = 100% → allOptional (was below old count threshold)
    {
      code: `
        interface SmallType {
          a?: string;
          b?: string;
          c?: string;
        }
      `,
      errors: [
        {
          messageId: 'allOptional',
          data: {
            kind: 'Interface',
            name: 'SmallType',
            optionalCount: '3',
            totalCount: '3',
          },
        },
      ],
    },
    // allOptionalMinSize: 1 forces size-1 to be flagged
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
  ],
});
