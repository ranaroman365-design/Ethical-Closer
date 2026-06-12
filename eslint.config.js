import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * ETC Canon Enforcement — Role Naming Lint Rule (Layer 11)
 * Blocks hardcoded internal role labels (e.g. "Operator") in user-facing code.
 * Use roleLabel(level, context, lang) from src/lib/canonical-roles.ts instead.
 */
const FORBIDDEN_ROLE_LITERALS = [
  // L6 internal label must NEVER appear in JSX/strings outside canonical-roles.ts
  { pattern: /(^|[^A-Za-z])Operator([^A-Za-z]|$)/, message: '"Operator" is internal-only — use roleLabel(6, "external") which returns "Senior Closer".' },
];

const roleNamingRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid hardcoded internal role labels in external surfaces.' },
    schema: [],
    messages: { forbidden: '{{message}}' },
  },
  create(context) {
    const filename = context.getFilename();
    // Allow inside the canonical source files themselves and docs/admin contexts
    if (
      filename.includes('canonical-roles.ts') ||
      filename.includes('canonical-thresholds.ts') ||
      filename.includes('operational-canon.ts') ||
      filename.includes('canonical-events.ts') ||
      filename.includes('/admin/') ||
      filename.endsWith('.test.ts') ||
      filename.endsWith('.test.tsx')
    ) return {};

    function check(node, value) {
      if (typeof value !== 'string') return;
      for (const { pattern, message } of FORBIDDEN_ROLE_LITERALS) {
        if (pattern.test(value)) {
          context.report({ node, messageId: 'forbidden', data: { message } });
          return;
        }
      }
    }
    return {
      Literal(node) { check(node, node.value); },
      TemplateElement(node) { check(node, node.value && node.value.cooked); },
    };
  },
};

/**
 * B8 — Meta event chokepoint guard.
 * Forbids direct `fbq(...)` calls and direct invocation of the `send-meta-event`
 * edge function from anywhere outside the central Meta utility files. Forces
 * all Meta traffic through the canonical allowlist in src/lib/meta-pixel.ts.
 */
const metaChokepointRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid direct fbq() and send-meta-event invocation outside the central Meta utility.' },
    schema: [],
    messages: {
      noDirectFbq: 'Direct fbq(...) calls are forbidden. Use trackPixelEvent() from src/lib/meta-pixel.ts.',
      noDirectCapi: 'Direct invocation of "send-meta-event" is forbidden from the client. Use sendCapiEvent() from src/lib/meta-capi.ts.',
    },
  },
  create(context) {
    const filename = context.getFilename();
    const isAllowed =
      filename.includes('src/lib/meta-pixel.ts') ||
      filename.includes('src/lib/meta-capi.ts') ||
      filename.includes('src/lib/track-event.ts') ||
      filename.includes('supabase/functions/');
    if (isAllowed) return {};
    return {
      CallExpression(node) {
        // window.fbq(...) or fbq(...)
        const callee = node.callee;
        if (
          (callee.type === 'Identifier' && callee.name === 'fbq') ||
          (callee.type === 'MemberExpression' &&
            callee.property?.type === 'Identifier' &&
            callee.property.name === 'fbq')
        ) {
          context.report({ node, messageId: 'noDirectFbq' });
        }
      },
      Literal(node) {
        if (typeof node.value === 'string' && node.value === 'send-meta-event') {
          context.report({ node, messageId: 'noDirectCapi' });
        }
      },
    };
  },
};

/**
 * Unsafe-Quote Guard — prevents bundling failures from unescaped quotes.
 *
 * Detects:
 * 1. Straight double-quote " inside a double-quoted string (common with
 *    German typographic quotes „…" where the closing " is U+201C/201D but
 *    editors sometimes auto-correct to ASCII 0x22).
 * 2. Any RIGHT DOUBLE QUOTATION MARK (U+201D) inside a regular "-delimited
 *    string — Deno/esbuild treats it as ASCII " and breaks the parse.
 *
 * The rule inspects every string literal and template literal element.
 * It flags strings wrapped in `"` that contain characters which could
 * terminate the string early at bundle time.
 */
const unsafeQuoteRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid unescaped typographic quotes that break Deno/esbuild bundling.' },
    schema: [],
    messages: {
      unsafeTypographicQuote:
        'String contains a typographic quote (U+201C „ or U+201D ") that may break bundling. ' +
        'Wrap the string in single quotes or backticks, or escape the character.',
    },
  },
  create(context) {
    // We only care about raw source — check if the token in source is "-delimited
    function check(node) {
      const src = context.getSourceCode();
      const raw = src.getText(node);
      // Only flag "-delimited strings (not ' or `)
      if (node.type === 'Literal' && typeof node.value === 'string') {
        if (!raw.startsWith('"')) return; // single-quoted — safe
        // Check for RIGHT DOUBLE QUOTATION MARK (U+201D) or LEFT (U+201C)
        // inside the string value — these look like " to some bundlers
        if (/[\u201C\u201D]/.test(node.value)) {
          context.report({ node, messageId: 'unsafeTypographicQuote' });
        }
      }
      if (node.type === 'TemplateLiteral') {
        for (const quasi of node.quasis) {
          if (/[\u201C\u201D]/.test(quasi.value.cooked ?? '')) {
            context.report({ node: quasi, messageId: 'unsafeTypographicQuote' });
          }
        }
      }
    }
    return {
      Literal(node) { check(node); },
      TemplateLiteral(node) { check(node); },
    };
  },
};

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "etc-canon": {
        rules: {
          "no-hardcoded-role-label": roleNamingRule,
          "meta-chokepoint": metaChokepointRule,
          "no-unsafe-quotes": unsafeQuoteRule,
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "etc-canon/no-hardcoded-role-label": "warn",
      "etc-canon/meta-chokepoint": "error",
      "etc-canon/no-unsafe-quotes": "error",
    },
  },
);
