# WhatsApp Message Templates (Meta WABA)

MediSathi sends **proactive** reminders to elderly patients outside the 24-hour session window using **approved utility templates**. Create these in Meta Business Manager (linked to your Exotel WhatsApp number).

## Required templates

### 1. `medicine_reminder` (Utility)

**Purpose:** Scheduled dose reminder when patient has not messaged recently.

| Component | Content |
|-----------|---------|
| Body | `Hello {{1}}, it is time for {{2}} ({{3}}). Please take your medicine and tap the buttons we send next.` |
| Footer | `MediSathi` |

**Variables:** `{{1}}` patient name, `{{2}}` medicine name, `{{3}}` time

**Note:** Follow-up interactive buttons (Taken / Will take / Skipped) are sent as a **session message** after the patient replies once, or within 24h of any inbound message. For fully cold outreach, submit a template that includes quick-reply buttons if Meta approves.

### 2. `missed_dose_alert` (Utility)

**Purpose:** Notify family when dose is missed after grace period.

| Component | Content |
|-----------|---------|
| Body | `Alert: {{1}} did not confirm {{2}} for the {{3}} dose. Please check on them.` |

**Variables:** `{{1}}` patient name, `{{2}}` medicine, `{{3}}` time

### 3. `daily_digest` (Utility, optional)

| Component | Content |
|-----------|---------|
| Body | `Today's medicine summary: {{1}}` |

**Variables:** `{{1}}` summary line (e.g. `Ram: 3/4 doses taken`)

## Approval tips

- Category: **Utility** (not Marketing)
- Avoid promotional language
- Use Hindi + English samples if targeting Indian users
- Allow 24–48 hours for Meta review

## Environment mapping

Set approved template names in `.env`:

```
TEMPLATE_MEDICINE_REMINDER=medicine_reminder
TEMPLATE_MISSED_DOSE_ALERT=missed_dose_alert
TEMPLATE_DAILY_DIGEST=daily_digest
```

If templates are not yet approved, MediSathi falls back to plain text messages when the API allows (inside 24h session).

## WhatsApp Flow (optional)

Import [`flows/caregiver-setup.json`](../flows/caregiver-setup.json) in Meta Flow Builder, publish, then set:

```
EXOTEL_FLOW_ID=your_flow_id
EXOTEL_FLOW_TOKEN=medisathi_setup
```

Caregivers send `FLOW` to open the form instead of the guided `SETUP` chat.
