# Technology & Platform Department Charter

## Mission
Keep the HP platform reliable, secure, and evolving. Zero unexpected downtime. Zero data breaches. Every new feature shipped is a new capability for the business, not a new liability.

## Department Head
**Seat ID:** `ai_system_integrity`
**Department:** technology

## North-Star KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| platform_uptime | Platform Uptime | 99.5 | null | % | monthly |
| security_incidents | Security Incidents | null | 0 | count | monthly |
| deploy_success_rate | Deployment Success Rate | 95 | null | % | monthly |
| bug_resolution_days | Avg Bug Resolution Time | null | 3 | days | monthly |
| db_query_p99 | DB Query p99 Latency | null | 500 | count | weekly |

## Seats

### AI System Integrity
**Seat ID:** `ai_system_integrity`
**Type:** AI
**Parent:** `integrator`

#### Mission
Monitor platform health 24/7. Catch errors, performance regressions, and broken integrations before customers notice. Triage issues and brief Software Engineer.

#### Decision Matrix
- If Railway healthcheck fails → immediately alert Marcin + Software Engineer
- If DB query latency p99 > 500ms for 10 min → alert Software Engineer
- If third-party integration (Stripe, Twilio, Gmail) returns errors → log + alert
- If error rate > 1% of requests → page Software Engineer
- If disk usage > 80% → alert Marcin

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| alerts_responded | Critical Alerts Responded to Within 15min | 100 | null | % | monthly |
| false_positive_rate | Alert False Positive Rate | null | 10 | % | monthly |
| mttr | Mean Time to Resolution (critical) | null | 60 | minutes | monthly |

#### SOPs

**Cron: `*/5 * * * *` — Platform Health Check**
1. Check Railway deployment status
2. Check DB connection pool health
3. Check Twilio/Stripe/Gmail integration error rates
4. If any alert → draft incident brief, notify Software Engineer

**Cron: `0 8 * * 1` — Weekly System Report**
1. Compile uptime, error rates, latency p50/p99 for past week
2. Identify any recurring error patterns
3. Draft system health report for Marcin using `system-weekly-report` playbook

**Trigger: `deploy.new`**
1. Run smoke check 5 minutes after deploy
2. Verify key endpoints responding
3. Check error rate vs baseline
4. Draft deploy health summary

#### Escalation
- Production outage → immediately wake Software Engineer + Marcin
- Data integrity issue → freeze affected workflows, alert Marcin, route to Software Engineer
- Security incident → immediately route to AI Security

---

### AI Security
**Seat ID:** `ai_security`
**Type:** AI
**Parent:** `ai_system_integrity`

#### Mission
Monitor for security anomalies: unusual auth patterns, permission escalations, data access outside normal patterns. Maintain compliance posture.

#### Decision Matrix
- If login attempt from new country/IP for staff account → alert Marcin immediately
- If admin allowlist modified → log + alert Marcin
- If API rate limits being hit abnormally → investigate, alert
- If any PII data appears in logs → alert + flag for remediation

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| anomalous_logins_flagged | Anomalous Logins Flagged Same Session | 100 | null | % | monthly |
| security_alerts_reviewed | Security Alerts Reviewed Within 1hr | 100 | null | % | monthly |
| compliance_checks_current | Security Compliance Checks Current | 100 | null | % | quarterly |

#### SOPs

**Cron: `0 6 * * *` — Daily Security Scan**
1. Review auth logs for unusual patterns (time of day, geo, failed attempts)
2. Check admin allowlist for unauthorized changes
3. Review API access patterns
4. Draft security brief if anything flagged

**Trigger: `auth.failed_attempts_spike`**
1. Identify source IPs
2. Check if staff account targeted
3. Draft immediate alert using `security-alert` playbook
4. Notify Marcin + Software Engineer

**Cron: `0 9 1 * *` — Monthly Security Review**
1. Audit active sessions and API keys
2. Review permission changes from past month
3. Check for outdated dependencies (flag, not auto-update)
4. Draft security posture report for Marcin

---

### Software Engineer
**Seat ID:** `software_engineer`
**Type:** human
**Parent:** `ai_system_integrity`

#### Mission
Human owner of all code changes. Receives AI triage reports, implements fixes, reviews and merges PRs, manages deployments. AI agents surface problems; Software Engineer resolves them.

#### Human Handoff Points
- All code changes: Software Engineer writes/reviews/merges
- Production deployments: Software Engineer confirms
- Security patches: Software Engineer implements within SLA
- Architecture decisions: Software Engineer + Marcin jointly

---

## Department Head SOPs
`ai_system_integrity` coordinates technology. Weekly: system health report to Marcin. Monthly: performance trend analysis. Immediately on incident: brief Software Engineer.

## Failure Modes
- Monitoring cron fails → Railway alerting as backstop
- Security agent false-positive storm → throttle to 1 alert/hour per category
- Software Engineer unavailable → Marcin as fallback, defer non-critical fixes

## Hard Stops
- AI NEVER deploys code to production
- AI NEVER modifies database schema directly
- AI NEVER rotates credentials or modifies security settings
- All security findings → HUMAN review before any action

## Tool Authorization
`ai_system_integrity`, `ai_security`:
- `playbooks.fetch`, `playbooks.list`
- `notifications.create`
- `appSettings.read`

## Initial Playbook Library

### Playbook: System Weekly Report
**Slug:** `system-weekly-report`
**Category:** internal-memo
**Owner:** `ai_system_integrity`
**Variables:** `{{week_of}}`, `{{uptime}}`, `{{error_rate}}`, `{{p99_latency}}`, `{{incidents}}`, `{{recommendations}}`

System Health Report — Week of {{week_of}}

Uptime: {{uptime}}%
Error rate: {{error_rate}}%
DB p99 latency: {{p99_latency}}ms

Incidents: {{incidents}}

Recommendations:
{{recommendations}}

---

### Playbook: Incident Alert
**Slug:** `incident-alert`
**Category:** internal-memo
**Owner:** `ai_system_integrity`
**Variables:** `{{incidentType}}`, `{{affectedService}}`, `{{startTime}}`, `{{errorDetails}}`, `{{impactDescription}}`, `{{recommendedAction}}`

INCIDENT: {{incidentType}}

Affected: {{affectedService}}
Started: {{startTime}}
Details: {{errorDetails}}

Customer impact: {{impactDescription}}

Recommended action: {{recommendedAction}}

Requires Software Engineer + Marcin response.

---

### Playbook: Security Alert
**Slug:** `security-alert`
**Category:** internal-memo
**Owner:** `ai_security`
**Variables:** `{{alertType}}`, `{{detectedAt}}`, `{{details}}`, `{{riskLevel}}`, `{{recommendedAction}}`

SECURITY ALERT: {{alertType}}

Detected: {{detectedAt}}
Risk level: {{riskLevel}}
Details: {{details}}

Recommended action: {{recommendedAction}}

Immediate review required.

---

### Playbook: Deploy Health Check
**Slug:** `deploy-health-check`
**Category:** internal-memo
**Owner:** `ai_system_integrity`
**Variables:** `{{deployId}}`, `{{deployTime}}`, `{{status}}`, `{{errorRate}}`, `{{notes}}`

Deploy Health: {{deployId}}
Deployed: {{deployTime}}
Status: {{status}}
Error rate (5min post-deploy): {{errorRate}}%

Notes: {{notes}}

---
