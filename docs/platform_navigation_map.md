# Platform Navigation Map

**Date:** 2026-05-04

## Canonical Routes

| Function | Canonical Route | Component |
|----------|----------------|-----------|
| Operator Master Dashboard | `/members/performance` | PerformanceShell |
| Revenue Flow | `/members/performance/revenue` | ConversionIntelligence |
| Talent OS | `/members/performance/talent` | PerformanceRankingAdmin |
| Intelligence Control | `/members/performance/intelligence` | IntelligenceDashboard |
| Team Control | `/members/dashboard/performance/operator-control` | OperatorControl |
| Self-Optimization | `/members/dashboard/self-optimization` | SelfOptimization |
| Audit & Reports (Operator) | `/members/dashboard/audit-center` | AuditCenter (operatorScopeOnly) |
| Audit & Reports (Admin) | `/members/admin/audit-center` | AuditCenter |

## Legacy Redirects

| Old Route | → Target |
|-----------|----------|
| `/members/admin/conversion-intelligence` | `/members/performance/revenue` |
| `/members/admin/intelligence-control` | `/members/performance/intelligence` |
| `/members/dashboard/intelligence-control` | `/members/performance/intelligence` |
| `/members/admin/performance` | `/members/performance/talent` |
| `/members/dashboard/operator-control` | `/members/dashboard/performance/operator-control` |
| `/members/admin/self-optimization` | `/members/dashboard/self-optimization` |

## Sidebar Structure by Role

### L6+ (PERFORMANCE section)
1. Performance → `/members/performance`
2. Marketing Dashboard → `/members/admin/funnel-intelligence`
3. Experimente → `/members/admin/experiments`
4. Team Control → `/members/dashboard/performance/operator-control`
5. Self-Optimization → `/members/dashboard/self-optimization`
6. Audit & Reports → `/members/dashboard/audit-center`
7. Touchpoint-Sequenzen → `/members/dashboard/touchpoint-sequences`
8. Smart Attendance → `/members/dashboard/performance/attendance`
9. AI Setter Voice Agent → `/members/dashboard/performance/ai-setter`

### Admin (VERWALTUNG section)
**Core:** Admin Workspace, Admin Panel
**System:** System Health, System Integrity, System Audit, System Monitoring
**Operations:** Produkte, Neues Produkt, Auszahlungen, Team & Support, Community Access, Team Coach
**Tools:** Tools, White-Label, Clone Verification, Automation Hub, Smart Attendance, AI Setter
**Governance:** Governance
**Reports:** CEO Dashboard

### L0 (Prospect)
Dashboard, Karriereweg, Bewerbungsgespräch, Portal entdecken

### L1-L5
Dynamic sections from useAccessResolver: ORIENTIERUNG, CLOSING OS, ANWENDUNG, NACHWEIS, EINKOMMEN, GEMEINSCHAFT, WACHSTUM + PLAYBOOKS + COMMUNITY
