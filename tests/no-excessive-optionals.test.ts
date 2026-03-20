import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../src/rules/no-excessive-optionals';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: require('@typescript-eslint/parser'),
  },
});

ruleTester.run('no-excessive-optionals', rule, {
  valid: [
    // Below count threshold (3 optional out of 3, but only 3 <= 3)
    {
      code: `
        interface SmallType {
          a?: string;
          b?: string;
          c?: string;
        }
      `,
    },
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
          messageId: 'excessiveOptionals',
          data: {
            kind: 'Type',
            name: 'UserProfile',
            optionalCount: '6',
            totalCount: '6',
            percentage: '100',
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
          messageId: 'excessiveOptionals',
        },
      ],
    },
  ],
});
