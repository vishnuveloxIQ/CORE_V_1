# UAT scripts (CORE-27-02, 28-06), 2026-11-22

For owner-led acceptance testing on staging once it exists (blocker B1). Until then they can be run on the development setup. Use test accounts only, with fictional data.

For each step, record: tester, date, result (Pass, Fail or Blocked), and a screenshot for every Fail. A Fail becomes a defect with the steps, expected result and actual result.

**Accounts needed** (one company, created by the administrator; login IDs are the company prefix plus 4 digits):
- an administrator with every manage privilege;
- an approver for levels 1 and 2;
- a plain module user with no manage privilege.

## U1. Sign-in and session

| # | Steps | Expected |
|---|---|---|
| U1.1 | Sign in with a correct login ID and password. | The dashboard opens, and the header chip names the company. |
| U1.2 | Sign in with a wrong password. | "Login id or password is incorrect". The message doesn't say whether the login exists. |
| U1.3 | Sign in as the same user on a second browser. | The first browser is signed out on its next action ("You have been signed out…"). One session per user. |
| U1.4 | Forgot password: enter a login ID, then use the sample OTP shown (testing only) and a new password. | The password changes, and the new password signs in. |
| U1.5 | Enter a login ID with an unknown prefix. | "This login ID does not belong to a company set up here." Nothing is sent. |

## U2. Master data

| # | Steps | Expected |
|---|---|---|
| U2.1 | Create a project with a project ID, then edit it. | Saved. On edit the project ID can't be changed. |
| U2.2 | Create a location for that project, with latitude and longitude. | Saved. The location page shows the position as a map link. |
| U2.3 | Add a WBS item, then set it to Inactive. | The tree shows it as Inactive. |
| U2.4 | Add BOQ items with quantity and rate. | Each amount is quantity × rate, and the total adds up. |
| U2.5 | Try a project ID that already exists. | "Another project uses this project ID." |
| U2.6 | As the plain user, open Projects. | No create or edit buttons appear. Saving through the API is refused (403). |
| U2.7 | Two people edit the same record; the second saves. | "Someone else changed this…". Their version is loaded, and nothing is overwritten. |

## U3. Access

| # | Steps | Expected |
|---|---|---|
| U3.1 | Create a user. Type only 4 digits for the login ID. | The login ID becomes the company prefix plus those digits. A temporary password is shown once. |
| U3.2 | Grant and revoke a privilege. | A passkey step-up is asked for. The change appears in the audit trail. |
| U3.3 | As the plain user, open `/audit`. | "You do not have access to this page." |

## U4. Approvals

| # | Steps | Expected |
|---|---|---|
| U4.1 | Create a 2-level chain with a reminder interval. | Saved as v1. The editor offers reminders only; there's no escalation. |
| U4.2 | Raise a request that isn't an emergency, without a needed-by date. | Refused: "Enter the date this is needed by…". With a date, it's raised. |
| U4.3 | As the level-1 approver, approve it. | A confirmation is asked for. After confirming, the request moves to L2. A second click doesn't send twice. |
| U4.4 | As someone else, open the request at L2. | "Waiting on [approver]". Approve, Reject and Clarify are disabled. |
| U4.5 | Leave a request past its interval (or run `npm run approvals:remind`). | The approver gets a reminder notification. The request stays at its level. |
| U4.6 | Reject a request without a reason. | Refused. With a reason, a confirmation says rejection is final. |
| U4.7 | Edit the chain to a new version dated today. | New requests use the new version. Requests already raised keep their snapshot. |

## U5. Policies

| # | Steps | Expected |
|---|---|---|
| U5.1 | Save a new version of the payment threshold. | The version history grows. Compare versions highlights the change. |
| U5.2 | Delete a custom policy. | The confirmation says how many fields and versions go with it. After deleting, it's gone and the audit trail records it. |

## U6. Equipment, inventory and events

| # | Steps | Expected |
|---|---|---|
| U6.1 | Add a maintenance schedule: every 3 months or 500 hours, with a last service. | The next due date and hours are shown, with the status. |
| U6.2 | Add a vendor with a PAN, then verify it. | Saved and marked as verified. |
| U6.3 | Open Available materials. | Free stock per material and where it is held. |
| U6.4 | Open the Event monitor after U4.3. | Approval events are listed as Queued (no transport yet: D13), with field names only. |

## U7. Resilience

| # | Steps | Expected |
|---|---|---|
| U7.1 | Stop the backend, then try to save. | A banner says Core can't reach the server and the change may not be saved. The screen shows its own error. Nothing claims success. |
| U7.2 | Start the backend again, then choose Check again. | The banner clears. |

**Sign-off:** the owner records Pass, Fail or Blocked for each section, with names and dates. A critical (P0) defect blocks sign-off.
