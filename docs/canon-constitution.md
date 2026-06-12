# ETC Canon Constitution v1.0 — Supreme System Rulebook

**Status:** Installed · 2026-04-23
**Scope:** Highest-order meta-canon of the ETC OS. Governs all canons.
**Machine surface:** `src/lib/canon-constitution.ts`
**Audit surface:** `src/lib/canon-map.ts` (`CANON_MAP`)

---

## 0. Purpose

This document is **not a canon**. It is the **constitution** that defines:
- what qualifies as a canon,
- how canons are created, merged, demoted, deprecated,
- how the ETC OS must reason about system truth.

> One domain = one active canon = one source of truth.

---

## 1. Truth Hierarchy (top wins)

1. **Constitution** (this document)
2. **Active Canon** (entries in `CANON_MAP` with `status: 'active'`)
3. **Enforced Registry** (`canonical-thresholds.ts`, `canonical-events.ts`, `canonical-roles.ts`, `get_kpi_truth()` RPC, lint rules)
4. **Feature / Surface**
5. **UI / Copy**

A lower layer must never contradict a higher layer.

---

## 2. Canon Definition

A rule is an **active canon** only if ALL hold:

- Defines a system **invariant** (not a tactic, not a styling choice)
- **Constrains** behavior or logic
- **Standardizes** a domain
- Has a **single owner** (file, RPC, table, or memory path)
- Belongs to **exactly one block** of the 6-block map

Otherwise it must be classified as: `feature spec`, `ui spec`, `implementation note`, or `temporary decision`.

---

## 3. The 6-Block Map (immutable)

| Block | Owns |
|---|---|
| **Foundation** | structural primitives: roles, thresholds, events, tenant scoping, idempotency |
| **Acquisition** | lead generation, narrative, routing, booking conversion |
| **Conversion** | call delivery, communication delivery, operator workflow, recovery |
| **Value** | onboarding, progression, mentoring, compensation |
| **Intelligence** | KPI truth, OSS/PSP, bottleneck control engine |
| **Governance** | performance surfaces, B2B governance |

**Forbidden buckets:** `cross-cutting`, `misc`, `temporary`, `hybrid`.

---

## 4. Canon Lifecycle

```
proposed → validated → active → reviewed
                          ├──→ merged
                          ├──→ deprecated
                          └──→ demoted
```

- **proposed** — candidate identified
- **validated** — passed gap + non-duplication + block check + coherence
- **active** — installed as live governing truth
- **reviewed** — periodically reassessed
- **merged** — absorbed by another canon (must keep stronger invariant)
- **deprecated** — no longer governs anything
- **demoted** — was never a true invariant; reclassified as spec

No canon may jump from idea to active without validation.

---

## 5. Allowed Statuses (in `CANON_MAP`)

`active` · `dormant` · `deprecated` · `merged` · `demoted`

Only `active` canons govern live behavior.

---

## 6. Required Fields per Canon

Every entry in `CANON_MAP` must declare:

`id` · `name` · `block` · `source` (path or `mem://`) · `status` · `absorbed?` (history of merges)

---

## 7. Conflict Resolution

If two active canons govern the same domain:

1. **Scope separation** — sharpen boundaries so each owns a sub-domain
2. **Merge** — combine into one canon with stronger invariant
3. **Override hierarchy** — explicitly declare which wins
4. **Demotion** — reclassify the weaker as feature/UI spec

Conflicts MUST NOT be left "handled by context".

---

## 8. Enforcement Ladder

Each canon should climb from documentation toward technical enforcement:

`documented_only` → `partially_enforced` → `enforced`

Enforcement mechanisms (preferred order):
`db_constraint` · `db_enum` · `rpc` · `ts_enum` · `typed_registry` · `lint_rule` · `route_gate` · `helper_fn`

Canons stuck at `documented_only` must be flagged in audits.

---

## 9. Future-Feature Filter

No new feature may ship until it answers:

1. Which **block** does it belong to?
2. Which **active canon** governs it?
3. Does it **duplicate** an existing capability?
4. Does it require a **new canon** or only a spec?

Programmatic check: `validateFeatureProposal()` in `canon-constitution.ts`.

---

## 10. Constitutional Gates (auto-checked)

`auditConstitution()` runs on `CANON_MAP` and verifies:

- **Block membership** — every active canon in a valid block
- **Unique ownership** — no duplicate id/name
- **Source of truth** — every canon declares a path
- **No forbidden buckets** — `cross-cutting` etc. rejected

If `passed: false`, the constitution is violated and must be repaired before merging changes.

---

## 11. Final Constitutional Test

The constitution holds only if YES to all:

- [x] Every active canon belongs to exactly one block
- [x] Every domain has exactly one active canon owner
- [x] Redundant canons merged or demoted (Consolidation v2)
- [x] Non-canonical specs removed from active layer
- [x] System can reveal all active canons (`CANON_MAP` + `auditConstitution()`)
- [x] Key canons enforced technically (Enforcement Pack v1)
- [x] Future additions filterable (`validateFeatureProposal()`)

---

## 12. Amendment Rule

This constitution may only be amended by:
1. Documented proposal in `docs/canon-constitution-amendments.md`
2. Update to `CONSTITUTION.version` in `canon-constitution.ts`
3. Re-run of `auditConstitution()` with `passed: true`

No silent edits. No drift.
