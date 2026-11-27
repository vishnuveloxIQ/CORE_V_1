| Field | Value |
|---|---|
| Document ID | DOC-00 |
| Title | Document Register and Gap Analysis |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This is the entry point to the documentation of VeloxIQ Core. It lists every document, says where it lives, who it is for and what state it is in, and shows what a large enterprise would still expect that the repository cannot supply by itself.

## 2. How to read this set

- **DOC-00 to DOC-13** are the enterprise documentation set written on 2026-11-25. They sit in this `docs` folder.
- **Existing documents** (written earlier by the team) stay where they are. This register links to them and the new documents refer to them instead of repeating them.
- Every new document carries a document-control table. Anything the code cannot answer (owners, service levels, retention periods, vendors, certifications) is marked **To be confirmed** and collected under "Open items" at the end of that document. Nothing has been invented.
- Status words: **Draft for review** (written, needs an owner's sign-off), **Existing** (written earlier, not reviewed here).

## 3. Enterprise documentation set (new)

| ID | Document | Audience | File |
|---|---|---|---|
| DOC-00 | Document register and gap analysis (this document) | Everyone | `docs/00-Document-Register-and-Gap-Analysis.md` |
| DOC-02 | System architecture: high-level and low-level design, decisions | Architects, developers, auditors | `docs/02-System-Architecture.md` |
| DOC-03 | Data architecture and governance: tenancy, data inventory, personal data, retention | Architects, data owners, DPO | `docs/03-Data-Architecture-and-Governance.md` |
| DOC-04 | Security architecture and controls: threat model, control catalogue, gaps | Security, auditors | `docs/04-Security-Architecture-and-Controls.md` |
| DOC-05 | Access control and role matrix: privileges, roles, route and screen access | Security, administrators, auditors | `docs/05-Access-Control-and-RBAC-Matrix.md` |
| DOC-06 | Integration and event contract specification: HRMS, P&M, PMS, Stores | Integration teams of the other modules | `docs/06-Integration-and-Event-Contract-Specification.md` |
| DOC-07 | Audit, logging and observability specification | Operations, security, auditors | `docs/07-Audit-Logging-and-Observability-Specification.md` |
| DOC-08 | Test strategy and quality plan | QA, developers, delivery managers | `docs/08-Test-Strategy-and-Quality-Plan.md` |
| DOC-09 | Operations runbook and support model | Operations, support | `docs/09-Operations-Runbook-and-Support-Model.md` |
| DOC-10 | Business continuity and disaster recovery plan | Operations, business owners | `docs/10-Business-Continuity-and-Disaster-Recovery-Plan.md` |
| DOC-11 | Release and change management | Delivery managers, developers | `docs/11-Release-and-Change-Management.md` |
| DOC-12 | Risk register and open decisions | Programme leadership | `docs/12-Risk-Register-and-Open-Decisions.md` |
| DOC-13 | Third-party software and licence inventory | Legal, security, procurement | `docs/13-Third-Party-Software-Inventory.md` |
| DOC-14 | Design document, light mode | Designers, front-end developers | `CORE__FRONTEND/docs/design/VeloxIQ-Core-Design-Light.html` |
| DOC-14 | Design document, dark mode | Designers, front-end developers | `CORE__FRONTEND/docs/design/VeloxIQ-Core-Design-Dark.html` |
| DOC-15 | User and administrator guide | End users, administrators, support | `docs/15-User-and-Administrator-Guide.md` |
| DOC-16 | Training plan and material outline | Training leads, trainers | `docs/16-Training-Plan-and-Material-Outline.md` |
| DOC-17 | Service catalogue and SLA framework | Business owners, service managers, customers | `docs/17-Service-Catalogue-and-SLA.md` |
| DOC-18 | Privacy impact assessment and records of processing | Data protection officer, legal | `docs/18-Privacy-Impact-Assessment-and-Records-of-Processing.md` |
| DOC-19 | Performance and capacity test plan | QA, operations, architects | `docs/19-Performance-and-Capacity-Test-Plan.md` |
| DOC-20 | Compliance readiness matrix | Compliance, auditors | `docs/20-Compliance-Readiness-Matrix.md` |
| DOC-21 | Supplier assessment and security test scope | Procurement, security | `docs/21-Supplier-Assessment-and-Security-Test-Scope.md` |

## 4. Existing documents

| Area | Document | File |
|---|---|---|
| Product | Application document | `CORE__FRONTEND/docs/VeloxIQ_CORE_application_document.md` |
| Product | Requirements | `CORE__FRONTEND/docs/VeloxIQ_CORE_requirements.md` |
| Product | Overview and team brief | `CORE__FRONTEND/docs/00-overview.md`, `TEAM_BRIEF.md` |
| Product | Screen inventory and screens | `CORE__FRONTEND/docs/SCREEN_INVENTORY.md`, `CORE__FRONTEND/docs/screens/` |
| Product | Workflow architecture | `CORE__FRONTEND/docs/WORKFLOW_ARCHITECTURE.md` |
| Architecture | Frontend architecture and modular proposal | `CORE__FRONTEND/docs/ARCHITECTURE.md`, `MODULAR_ARCHITECTURE_PROPOSAL.md` |
| Architecture | Data model (frontend view) | `CORE__FRONTEND/docs/data-model.md` |
| Architecture | Non-functional requirements | `CORE__FRONTEND/docs/non-functional.md` |
| Design | Design and design system | `CORE__FRONTEND/docs/DESIGN.md`, `DESIGN_SYSTEM.md` |
| Quality | UAT scripts | `CORE__FRONTEND/docs/UAT_SCRIPTS.md` |
| Quality | Accessibility audit | `CORE__FRONTEND/docs/ACCESSIBILITY_AUDIT.md` |
| Quality | Defects and schedule status | `DEFECTS.md`, `SCHEDULE-STATUS.md` |
| Delivery | Release notes draft, change plan, change list | `CORE__FRONTEND/docs/RELEASE_NOTES_DRAFT.md`, `FRONTEND_CHANGE_PLAN.md`, `BACKEND_FRONTEND_CHANGES.md`, `CORE__FRONTEND/CHANGES_TODO.md` |
| API | Locked API v1 contract and changelog | `CORE__BACKEND/docs/API_V1.md`, `CORE__BACKEND/docs/api/openapi-v1.json` |
| API | Frontend contract notes and handoff | `CORE__FRONTEND/docs/api-contract.md`, `CORE__BACKEND/docs/frontend-handoff.md` |
| Database | Database handoff (full schema design) | `CORE__BACKEND/Core_Database_Handoff.md` |
| Operations | Deployment guide | `CORE__BACKEND/docs/DEPLOYMENT.md` |
| Operations | Restore drill reports | `CORE__BACKEND/docs/restore-drills/` |
| Quality | Regression guide | `CORE__BACKEND/docs/REGRESSION.md` |
| Engineering | Backend README, progress log, working notes | `CORE__BACKEND/README.md`, `PROGRESS.md`, `CLAUDE.md` |

## 5. Gap analysis against an enterprise documentation standard

"Enterprise standard" here means the set of documents that large organisations normally require before a system goes live or passes an audit. The table shows how each one is covered.

| Expected document | Covered by | Status |
|---|---|---|
| Business requirements and scope | Existing requirements and application document | Covered (existing) |
| Solution architecture (HLD and LLD) | DOC-02 | Covered (new) |
| Data model and data dictionary | Database handoff, DOC-03 | Covered |
| Data classification and personal-data inventory | DOC-03 | Covered; classification owner needed |
| API specification | `openapi-v1.json`, `API_V1.md` | Covered (existing, locked) |
| Integration and interface specification | DOC-06 | Covered; payload formats still open by decision |
| Security architecture and threat model | DOC-04 | Covered; no external test evidence |
| Access control and segregation of duties | DOC-05 | Covered |
| Audit and logging standard | DOC-07 | Covered |
| Test strategy, plan and traceability | DOC-08 and UAT scripts | Covered |
| Operations runbook and support model | DOC-09 | Covered; contacts and service hours to be confirmed |
| Backup, business continuity and disaster recovery | DOC-10 and restore drill reports | Covered; business RPO and RTO targets to be confirmed |
| Release, change and configuration management | DOC-11 | Covered |
| Risk register and decision log | DOC-12 | Covered; owners to be assigned |
| Third-party software and licence inventory | DOC-13 | Covered; no SBOM or scan automation yet |
| UI design system and accessibility | DOC-14, design system, accessibility audit | Covered |
| User and administrator guides | DOC-15 | Covered (new) |
| Training material | DOC-16 | Covered (new); delivery needs trainers |
| Service level agreement and service catalogue | DOC-17 | Covered as a framework; targets are proposals until the business agrees them |
| Privacy impact assessment (DPIA) and records of processing | DOC-18 | Covered as a draft; the data protection officer must review and set lawful bases |
| Independent penetration test scope | DOC-21 | Covered; the test itself still has to be carried out by an external party |
| Performance and capacity test plan | DOC-19 | Covered; test results do not exist yet |
| Compliance readiness and mapping (ISO 27001, SOC 2, data protection) | DOC-20 | Covered as a readiness view; not a certification |
| Vendor and supplier assessment | DOC-21 | Covered as a questionnaire template |

Every document an enterprise would normally ask for now has a first issue. What remains is not writing but evidence and sign-off that only people or time can supply: the penetration test report, the load-test results, agreed service-level numbers, the data protection officer's approval, named document owners and certification audits. Each of those is listed under "Open items" in the document concerned.

## 6. Document control rules (proposed)

| Rule | Proposal |
|---|---|
| Location | In the repository under `docs/`, reviewed through the same change process as code |
| Versioning | Semantic: major for structural change, minor for new content, patch for corrections |
| Review cycle | At least yearly, and at every major release |
| Owners | One named owner per document (currently To be confirmed for all) |
| Approval | Owner drafts, a reviewer from engineering and one from the business sign off |
| Retention | Keep superseded versions in git history |

## 7. Open items

1. Name an owner for every document in section 3.
2. Decide who approves each document and record the sign-off in its revision history.
3. Commission the documents listed as gaps in section 5, starting with the user and administrator guide and the privacy impact assessment.
4. Review the open items at the end of DOC-02 to DOC-13 and assign them.

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | Engineering | First issue |
