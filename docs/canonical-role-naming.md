# ETC Canonical Role Naming System (Hardwired)

**Status:** Canonical · Hardwired · Naming Governance
**Stack Position:** Layer 11 of the ETC Architecture
**Source of truth:** `src/lib/canonical-roles.ts`
**Depends on:** Operator Life Cycle Map (Layer 10), Role Definitions v11

---

## 🎯 Objective

A single, enforced naming system for all levels **L0–L8** that separates:

- **Internal precision** — system logic, DB, admin
- **External clarity** — user-facing UI, marketing, communication

…and eliminates label drift across the entire platform.

---

## ⚠️ Hard Rules

| Rule | Status |
|------|--------|
| Rename levels (L0–L8) | ❌ Forbidden |
| Free-text role names anywhere in code | ❌ Forbidden |
| Mix internal + external labels in same surface | ❌ Forbidden |
| Use `roleLabel()` from `src/lib/canonical-roles.ts` | ✅ Mandatory |
| Use the word **"Operator"** in any external surface | ❌ Forbidden |

---

## 🧩 Core Principle

```
Level (Lx)     = System Anchor       (immutable)
Internal Name  = Functional Precision (admin/DB)
External Name  = Market Clarity       (UI/comms/sales)
```

---

## 1️⃣ Canonical Mapping (FINAL)

| Level | Internal | External (EN) | External (DE) |
|-------|----------|---------------|---------------|
| L0 | Applicant | Applicant | Bewerber |
| L1 | Trainee | Trainee / Opener | Trainee / Opener |
| L2 | Setter | Associate Setter | Associate Setter |
| L3 | Advanced Setter | Senior Setter | Senior Setter |
| L4 | Junior Closer | Junior Closer | Junior Closer |
| L5 | Closer | Managing Closer | Managing Closer |
| **L6** | **Operator** | **Senior Closer** ⚠️ | **Senior Closer** ⚠️ |
| L7 | Director | Director | Director |
| L8 | Partner | Partner | Partner |

> **⚠️ L6 critical rule:** "Operator" is **internal-only**. Every user-facing surface must say **"Senior Closer"**.

---

## 2️⃣ Context Rules

| Context | Format | Example |
|---------|--------|---------|
| **internal** | `Lx + Internal` | `L6 Operator` |
| **external** | `External only` | `Senior Closer` |
| **hybrid** | `External (Lx)` | `Senior Closer (L6)` |
| **admin** | `Lx — Internal (External)` | `L6 — Operator (Senior Closer)` |

---

## 3️⃣ Surface-by-Surface Enforcement

| Surface | Context | Example |
|---------|---------|---------|
| Member dashboard "Your Level" | hybrid | `Senior Closer (L6)` |
| Leaderboards (member-facing) | external | `Senior Closer`, `Managing Closer` |
| Admin user table | admin | `L6 — Operator (Senior Closer)` |
| Email / SMS / WhatsApp | external | `You are now a Senior Closer` |
| OLCM (Layer 10) node tooltip | hybrid + footnote | `Senior Closer (L6) — Internal: Operator` |
| DB / logs / audit | internal anchor | `level=6, role=operator` |

---

## 4️⃣ Communication Engine Integration

All workflow templates (WF_ACQ_*, WF_VAL_*) must resolve role names through `roleLabel(level, 'external', lang)`. Never hardcode role strings in templates.

```
❌ WRONG: "You are now an Operator"
✅ RIGHT: `You are now a ${roleLabel(level, 'external', lang)}`
```

---

## 5️⃣ OLCM Integration

Each L6 node card must render:
```
Senior Closer
(Internal: Operator)
```

The hidden internal name is shown only as a small footnote, never as the headline.

---

## 6️⃣ Implementation Contract

```ts
import { roleLabel, roleLabelAdmin, getCanonicalRole } from '@/lib/canonical-roles';

roleLabel(6, 'external')        // → "Senior Closer"
roleLabel(6, 'internal')        // → "L6 Operator"
roleLabel(6, 'hybrid')          // → "Senior Closer (L6)"
roleLabel(6, 'external', 'de')  // → "Senior Closer"
roleLabelAdmin(6)               // → "L6 — Operator (Senior Closer)"
```

A dev-mode `assertExternalSafe(label)` guard logs an error if the literal `"Operator"` leaks into an external surface.

---

## 7️⃣ Migration Path (Non-Destructive)

1. New code → must import `roleLabel`.
2. Existing code that renders raw `business_stage` strings → migrate opportunistically when those files are touched for unrelated reasons.
3. No mass refactor required; the canonical module is the contract that prevents future drift.

---

## 🧠 Final Truth

Strong systems always carry **two languages**:
- **technical** (internal precision)
- **persuasive** (external clarity)

This layer makes both explicit, enforceable, and aligned.

---

*Layer 11 of the ETC architecture stack — naming governance.*
