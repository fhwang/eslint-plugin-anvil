import {
  AST_NODE_TYPES,
  ESLintUtils,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/fhwang/eslint-plugin-anvil/blob/main/docs/rules/${name}.md`,
);

const DEFAULT_MAX_OPTIONAL = 3;
const DEFAULT_MAX_OPTIONAL_RATIO = 0.5;
const PERCENTAGE_MULTIPLIER = 100;

const DEFAULT_IGNORE_PATTERNS = [
  '*Config',
  '*Options',
  '*Props',
  '*Params',
];

type Options = [
  {
    maxOptional?: number;
    maxOptionalRatio?: number;
    checkInlineTypes?: boolean;
    ignorePatterns?: string[];
  },
];

type MessageIds = 'excessiveOptionals';

interface ReportArgs {
  node: TSESTree.Node;
  kind: string;
  name: string;
  members: TSESTree.TypeElement[];
}

interface ResolvedOptions {
  maxOptional: number;
  maxOptionalRatio: number;
  checkInlineTypes: boolean;
  ignorePatterns: string[];
}

function matchesPattern(
  name: string,
  patterns: string[],
): boolean {
  return patterns.some((pattern) => {
    const regex = new RegExp(
      `^${pattern.replace(/\*/g, '.*')}$`,
    );
    return regex.test(name);
  });
}

function checkMembers(
  members: TSESTree.TypeElement[],
): { total: number; optional: number } {
  let total = 0;
  let optional = 0;
  for (const member of members) {
    if (
      member.type === AST_NODE_TYPES.TSPropertySignature
    ) {
      total += 1;
      if (member.optional) {
        optional += 1;
      }
    }
  }
  return { total, optional };
}

function resolveOptions(
  options: Options[0],
): ResolvedOptions {
  return {
    maxOptional: options.maxOptional ?? DEFAULT_MAX_OPTIONAL,
    maxOptionalRatio:
      options.maxOptionalRatio ?? DEFAULT_MAX_OPTIONAL_RATIO,
    checkInlineTypes: options.checkInlineTypes ?? false,
    ignorePatterns:
      options.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS,
  };
}

type RuleContext = TSESLint.RuleContext<MessageIds, Options>;

function makeReporter(
  context: RuleContext,
  opts: ResolvedOptions,
): (args: ReportArgs) => void {
  return function report(args: ReportArgs): void {
    if (matchesPattern(args.name, opts.ignorePatterns)) {
      return;
    }
    const { total, optional } = checkMembers(args.members);
    if (
      optional > opts.maxOptional
      && total > 0
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
}

function buildVisitors(
  context: RuleContext,
  opts: ResolvedOptions,
): TSESLint.RuleListener {
  const report = makeReporter(context, opts);

  return {
    TSInterfaceDeclaration(node): void {
      report({
        node,
        kind: 'Interface',
        name: node.id.name,
        members: node.body.body,
      });
    },
    TSTypeAliasDeclaration(node): void {
      if (
        node.typeAnnotation.type
        === AST_NODE_TYPES.TSTypeLiteral
      ) {
        report({
          node,
          kind: 'Type',
          name: node.id.name,
          members: node.typeAnnotation.members,
        });
      }
    },
    ...(opts.checkInlineTypes
      ? {
        'TSTypeLiteral:not(TSTypeAliasDeclaration > TSTypeLiteral)'(
          node: TSESTree.TSTypeLiteral,
        ): void {
          report({
            node,
            kind: 'Type',
            name: '(anonymous)',
            members: node.members,
          });
        },
      }
      : {}),
  };
}

export default createRule<Options, MessageIds>({
  name: 'no-excessive-optionals',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow object types where optional members dominate, '
        + 'suggesting a discriminated union instead',
    },
    messages: {
      excessiveOptionals:
        '{{kind}} \'{{name}}\' has '
        + '{{optionalCount}}/{{totalCount}} '
        + 'optional members ({{percentage}}%). '
        + 'Consider modeling '
        + 'correlated state as a discriminated union.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxOptional: { type: 'number' },
          maxOptionalRatio: { type: 'number' },
          checkInlineTypes: { type: 'boolean' },
          ignorePatterns: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [
    {
      maxOptional: DEFAULT_MAX_OPTIONAL,
      maxOptionalRatio: DEFAULT_MAX_OPTIONAL_RATIO,
      checkInlineTypes: false,
      ignorePatterns: DEFAULT_IGNORE_PATTERNS,
    },
  ],
  create(context, [options]) {
    const opts = resolveOptions(options);

    return buildVisitors(context, opts);
  },
});
