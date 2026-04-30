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
const DEFAULT_ALL_OPTIONAL_MIN_SIZE = 2;

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
    allOptionalMinSize?: number;
    checkInlineTypes?: boolean;
    ignorePatterns?: string[];
  },
];

type MessageIds = 'excessiveOptionals' | 'allOptional';

interface ReportArgs {
  node: TSESTree.Node;
  kind: string;
  name: string;
  members: TSESTree.TypeElement[];
}

interface ResolvedOptions {
  maxOptional: number;
  maxOptionalRatio: number;
  allOptionalMinSize: number;
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

function isNullableTypeNode(node: TSESTree.TypeNode): boolean {
  return (
    node.type === AST_NODE_TYPES.TSNullKeyword
    || node.type === AST_NODE_TYPES.TSUndefinedKeyword
  );
}

function annotationAllowsAbsence(
  typeAnn: TSESTree.TSTypeAnnotation | undefined,
): boolean {
  if (!typeAnn) {
    return false;
  }
  const inner = typeAnn.typeAnnotation;
  if (inner.type === AST_NODE_TYPES.TSUnionType) {
    return inner.types.some(isNullableTypeNode);
  }
  return isNullableTypeNode(inner);
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
      if (
        member.optional
        || annotationAllowsAbsence(member.typeAnnotation)
      ) {
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
    allOptionalMinSize:
      options.allOptionalMinSize ?? DEFAULT_ALL_OPTIONAL_MIN_SIZE,
    checkInlineTypes: options.checkInlineTypes ?? false,
    ignorePatterns:
      options.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS,
  };
}

type RuleContext = TSESLint.RuleContext<MessageIds, Options>;

interface Counts {
  total: number;
  optional: number;
}

function reportAllOptional(
  context: RuleContext,
  args: ReportArgs,
  counts: Counts,
): void {
  context.report({
    node: args.node,
    messageId: 'allOptional',
    data: {
      kind: args.kind,
      name: args.name,
      optionalCount: String(counts.optional),
      totalCount: String(counts.total),
    },
  });
}

function reportExcessive(
  context: RuleContext,
  args: ReportArgs,
  counts: Counts,
): void {
  const percentage = Math.round(
    (counts.optional / counts.total) * PERCENTAGE_MULTIPLIER,
  );
  context.report({
    node: args.node,
    messageId: 'excessiveOptionals',
    data: {
      kind: args.kind,
      name: args.name,
      optionalCount: String(counts.optional),
      totalCount: String(counts.total),
      percentage: String(percentage),
    },
  });
}

function makeReporter(
  context: RuleContext,
  opts: ResolvedOptions,
): (args: ReportArgs) => void {
  return function report(args: ReportArgs): void {
    if (matchesPattern(args.name, opts.ignorePatterns)) {
      return;
    }
    const counts = checkMembers(args.members);
    if (counts.total === 0) {
      return;
    }
    if (
      counts.total >= opts.allOptionalMinSize
      && counts.optional === counts.total
    ) {
      reportAllOptional(context, args, counts);
      return;
    }
    if (
      counts.optional > opts.maxOptional
      && counts.optional / counts.total > opts.maxOptionalRatio
    ) {
      reportExcessive(context, args, counts);
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
        'Disallow object types where optional or nullable members dominate, '
        + 'suggesting a discriminated union instead',
    },
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
    schema: [
      {
        type: 'object',
        properties: {
          maxOptional: { type: 'number' },
          maxOptionalRatio: { type: 'number' },
          allOptionalMinSize: { type: 'number', minimum: 1 },
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
      allOptionalMinSize: DEFAULT_ALL_OPTIONAL_MIN_SIZE,
      checkInlineTypes: false,
      ignorePatterns: DEFAULT_IGNORE_PATTERNS,
    },
  ],
  create(context, [options]) {
    const opts = resolveOptions(options);

    return buildVisitors(context, opts);
  },
});
