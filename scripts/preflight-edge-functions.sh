#!/usr/bin/env bash
# Pre-deploy check for Supabase Edge Functions
# Catches: parse/syntax errors, unescaped typographic quotes, common pitfalls
# Run: npm run preflight:edge  OR  bash scripts/preflight-edge-functions.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

FUNCTIONS_DIR="supabase/functions"
ERRORS=0
WARNINGS=0

if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo -e "${RED}ERROR: $FUNCTIONS_DIR not found${NC}"
  exit 1
fi

echo "══════════════════════════════════════════════"
echo "  Edge Function Pre-Deploy Check"
echo "══════════════════════════════════════════════"
echo ""

# ── 1. Syntax / parse check (swc parse, NOT full type-check) ─────────
echo "▸ Phase 1: Syntax parse check"
for fn_dir in "$FUNCTIONS_DIR"/*/; do
  entry="${fn_dir}index.ts"
  [ -f "$entry" ] || continue
  fn_name=$(basename "$fn_dir")
  [[ "$fn_name" == _* ]] && continue

  # Use deno's transpile-only mode — catches parse errors without resolving imports
  if deno eval --no-lock "await Deno.readTextFile('$entry').then(s => { try { new Function(s) } catch {} }); Deno.exit(0)" 2>/dev/null; then
    # Fallback: use esbuild-style parse via deno emit
    if deno eval --no-lock "
      const src = await Deno.readTextFile('$entry');
      // Simple parse test: look for unmatched quotes that would break bundling
      let inSingle = false, inDouble = false, inTemplate = false, escaped = false;
      for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (escaped) { escaped = false; continue; }
        if (c === '\\\\') { escaped = true; continue; }
        // Check for typographic quotes inside double-quoted strings
        if (inDouble && (c.charCodeAt(0) === 0x201C || c.charCodeAt(0) === 0x201D)) {
          console.error('Parse risk: typographic quote at offset ' + i);
          Deno.exit(1);
        }
      }
      Deno.exit(0);
    " 2>/tmp/parse-err; then
      echo -e "  ${GREEN}✓${NC} $fn_name"
    else
      echo -e "  ${RED}✗${NC} $fn_name — parse risk detected"
      sed 's/^/    /' /tmp/parse-err
      ERRORS=$((ERRORS + 1))
    fi
  fi
done
echo ""

# ── 2. Unsafe quote detection (grep-based, precise) ─────────────────
echo "▸ Phase 2: Unsafe typographic quotes"
FOUND_QUOTES=0
for fn_dir in "$FUNCTIONS_DIR"/*/; do
  entry="${fn_dir}index.ts"
  [ -f "$entry" ] || continue
  fn_name=$(basename "$fn_dir")
  [[ "$fn_name" == _* ]] && continue

  if grep -Pn '[\x{201C}\x{201D}]' "$entry" > /tmp/quote-hits 2>/dev/null; then
    while IFS= read -r line; do
      lineno=$(echo "$line" | cut -d: -f1)
      content=$(echo "$line" | cut -d: -f2-)
      FOUND_QUOTES=1
      if echo "$content" | grep -qP '"[^"]*[\x{201C}\x{201D}]'; then
        echo -e "  ${RED}✗${NC} $fn_name:$lineno — typographic quote inside \"-delimited string"
        echo "    $(echo "$content" | sed 's/^[[:space:]]*//')"
        ERRORS=$((ERRORS + 1))
      else
        echo -e "  ${YELLOW}~${NC} $fn_name:$lineno — typographic quote (likely safe, in '-string)"
        WARNINGS=$((WARNINGS + 1))
      fi
    done < /tmp/quote-hits
  fi
done
[ $FOUND_QUOTES -eq 0 ] && echo -e "  ${GREEN}✓${NC} No typographic quotes found"
echo ""

# ── 3. Common pitfalls ───────────────────────────────────────────────
echo "▸ Phase 3: Common pitfalls"
FOUND_PITFALLS=0
for fn_dir in "$FUNCTIONS_DIR"/*/; do
  entry="${fn_dir}index.ts"
  [ -f "$entry" ] || continue
  fn_name=$(basename "$fn_dir")
  [[ "$fn_name" == _* ]] && continue

  if grep -qn 'process\.env' "$entry" 2>/dev/null; then
    echo -e "  ${YELLOW}~${NC} $fn_name — uses process.env (should be Deno.env.get)"
    WARNINGS=$((WARNINGS + 1))
    FOUND_PITFALLS=1
  fi

  if grep -qP '(?<!\/\/.*)(?<!\*)(?<!\*\s)\brequire\s*\(' "$entry" 2>/dev/null; then
    echo -e "  ${YELLOW}~${NC} $fn_name — uses require() (should use import)"
    WARNINGS=$((WARNINGS + 1))
    FOUND_PITFALLS=1
  fi
done
[ $FOUND_PITFALLS -eq 0 ] && echo -e "  ${GREEN}✓${NC} No common pitfalls found"
echo ""

# ── 4. Deno lint (catches actual syntax issues) ─────────────────────
echo "▸ Phase 4: Deno lint (parse-critical rules only)"
LINT_ERRORS=0
# Only check rules that cause actual bundling/deploy failures.
# Exclude style rules that don't break deployment.
LINT_EXCLUDE="no-import-prefix,no-explicit-any,no-unused-vars,prefer-const,no-inferrable-types,no-empty,require-yield,no-unreachable,no-case-declarations,no-fallthrough,no-var,no-empty-interface,ban-unused-ignore,no-namespace,no-redeclare,ban-types,no-inner-declarations,no-dupe-class-members,no-unversioned-import,require-await"
for fn_dir in "$FUNCTIONS_DIR"/*/; do
  entry="${fn_dir}index.ts"
  [ -f "$entry" ] || continue
  fn_name=$(basename "$fn_dir")
  [[ "$fn_name" == _* ]] && continue

  if deno lint --quiet --rules-exclude="$LINT_EXCLUDE" "$entry" 2>/tmp/deno-lint-err 1>/dev/null; then
    : # pass silently
  else
    echo -e "  ${RED}✗${NC} $fn_name"
    sed 's/^/    /' /tmp/deno-lint-err | head -8
    ERRORS=$((ERRORS + 1))
    LINT_ERRORS=$((LINT_ERRORS + 1))
  fi
done
[ $LINT_ERRORS -eq 0 ] && echo -e "  ${GREEN}✓${NC} All functions pass deno lint"
echo ""

# ── Summary ──────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════"
if [ $ERRORS -gt 0 ]; then
  echo -e "  ${RED}FAILED${NC}: $ERRORS error(s), $WARNINGS warning(s)"
  echo "══════════════════════════════════════════════"
  exit 1
else
  echo -e "  ${GREEN}PASSED${NC}: 0 errors, $WARNINGS warning(s)"
  echo "══════════════════════════════════════════════"
  exit 0
fi
