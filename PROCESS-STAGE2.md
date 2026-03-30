# Stage 2 — What changed and why

## What the follow-up surfaced

The Stage 1 build was directionally right but had two structural problems that Dana and Luis named precisely.

**The first was an ETTO problem.** The brief made technicians faster by surfacing everything about an account in one place. But faster created a hidden cost: the screen was asking techs to do the sorting themselves — deciding in thirty seconds what was for right now versus background context versus office-owned follow-up. Luis named it directly: "tell me what is for right now, give me the rest when I need it." The tool was efficient in the sense that the information was there. It was not thorough in the sense that the tech could reliably act on the right thing at the right moment.

**The second was a boundary problem.** The brief collapsed three distinct job types into one flat list: failure follow-ups, planned multi-stop work, and items pending office approval. The log form collapsed three distinct outcomes into a binary: resolved or not. The recommendation section collapsed two different conversations — field upsell for hobbyists and office-owned spend decisions for commercial accounts — into one "Recommend today" prompt. Luis: "those are not the same thing." Dana: "it should not feel like a failure item for planned work." The system was not wrong about what existed — it was wrong about what those things meant in context.

---

## What we changed

### 1. The ETTO fix — surface the job, not the file

Added a **Today's Job** component as the first always-visible section of the brief. It shows the visit category (monthly maintenance, biweekly, emergency rescue) and surfaces only the active work items — things the tech is expected to act on today. Everything else (recurring issues, tank inventory, recommendations) remains accessible but is visually subordinate.

The principle: the brief should answer "what matters before I walk in" in under ten seconds. Longer context is still there for the tech who wants it. It is no longer competing for attention with the immediate job.

### 2. The boundary fix — structured log and clear ownership

Replaced the thin log form (issue found / followup required / notes) with a **structured outcome model**:

- `logged_work_completed` — what the tech actually did
- `logged_resolution_status` — resolved / ongoing / escalated / needs_part
- `logged_next_step` + `logged_next_step_owner` — field / office / customer

This captures the distinctions Luis described: "I handled the immediate issue, but Dana needs to follow up." "This was planned work, not a miss." "Nothing is open, but this same issue keeps coming back." The form no longer forces the tech to compress those into a notes box.

The follow-up view was also updated via a coalesced database view that reads `logged_work_completed` first, falling back to the older `issue_found` field — so open follow-ups show what was actually logged, not "Unspecified."

### 3. Pattern detection that runs regardless of resolution status

Dana's point: "If the same tank keeps having evaporation swings and the tech keeps solving it on site, that is still a pattern I want surfaced." The nightly insights cron runs `deriveRecurringPatterns` across all service visits, not just unresolved ones. Issues that appear three or more times in a six-month window surface as alerts with a suggested ops action — regardless of whether anything is formally open today.

### 4. Making the boundaries maintainable

The deeper version of the boundary problem: rules that encode business judgment were locked in code. The compatibility engine, the upsell mappings, the pattern action suggestions, the delivery zone constraints — these are policy decisions that belong to ops, but ops had no path to change them.

Added:
- **`/ops` Claude Code skill** — when invoked, lists every changeable rule and walks ops through making the edit, type-checking, and deploying. No developer required.
- **`OPS-HANDOFF.md`** — documents every rule, where it lives, and the heuristic for when to tighten vs leave to human judgment
- The handoff includes explicit guidance on the ETTO and leaky boundaries problems — so ops understands not just *what* to change but *when* and *why*

The heuristic for leaky boundaries: don't encode a hard block unless you have a clear, documented failure it would have prevented. Default to friction (show the concern, ask for acknowledgement) before a block. When tightening a rule, put the failure in the commit message so the next person knows why the rule exists.

---

## What is still open

The three-moment separation — parking lot, during the visit, after the visit — is partially addressed by Today's Job but not fully resolved as a structural view change. The current shape is one screen with better prioritisation. A more complete version would be progressive disclosure: a short pre-entry view, an active-work view once inside, and a handoff view for logging. The data model supports this. The presentation does not do it yet.

The Mark resolved ownership problem is also still present. The structured log captures what the tech did and who owns the next step. But the close action on open follow-ups is still a single button rather than a state transition that office confirms. That is a workflow change that will become obvious after real visits and can be tightened once the failure pattern is clear.

Both of these are left intentionally. The instinct from the field review is to not set hard boundaries until you have seen the failure. Building the full three-moment view before knowing how techs actually use the current shape would be the same mistake made smaller.

---

## What is in the repo

- `app/(app)/visit/[id]/brief/` — updated brief with Today's Job component
- `components/brief/TodaysJob.tsx` — visit category badge and active work items
- `app/(app)/visit/[id]/log/` — structured log form with outcome model
- `supabase/migrations/002_service_visit_log_fields.sql` — schema for structured log columns
- `supabase/migrations/003_open_followups_view.sql` — coalesced view fixing "Unspecified" in follow-ups
- `supabase/migrations/004_pattern_alerts.sql` — tables for nightly cron output
- `app/api/cron/insights/` — nightly pattern detection cron (Vercel, 02:00 UTC)
- `app/api/insights/run/` — manual trigger for authenticated users
- `app/(app)/insights/` — ops-facing pattern alerts view with Run now / Clear
- `app/api/compatibility/check/` — compatibility engine over HTTP
- `app/api/delivery-windows/check/` — delivery window engine over HTTP
- `app/(app)/demo/` — live API sandbox with preset scenarios for both engines
- `.claude/commands/ops.md` — `/ops` skill for HQ Operations
- `OPS-HANDOFF.md` — rule ownership, change process, ETTO and leaky boundaries guidance
