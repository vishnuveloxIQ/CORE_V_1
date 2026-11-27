# VeloxIQ Core: User and Administrator Guide

| Field | Value |
|---|---|
| Document ID | DOC-15 |
| Title | User and Administrator Guide |
| Version | 1.0 |
| Date | 2026-11-25 |
| Status | Draft for review |
| Owner | To be confirmed |
| Classification | Internal |

## 1. Purpose

This guide explains how to use VeloxIQ Core in plain English. It covers signing in, finding your way around, and every screen in the menu, in the same order as the menu on the left of the screen. For each screen it says what the screen is for, who can use it, how to do the common tasks, what the fields mean, and what to do when something goes wrong.

## 2. Scope and audience

- **Readers:** company administrators (the people who run Core for your company), and anyone who needs to look things up in Core: project and site coordinators, store keepers, equipment (P&M) coordinators, approvers, reviewers and support staff.
- **Covers:** the Core web application as built in the repository on 2026-11-24 (the latest commit). Names of buttons, tabs, fields and messages are taken from the application itself.
- **Does not cover:** the screens of HRMS, P&M, PMS and Stores. Those are separate modules. Core only approves requests from them, keeps the shared master data, and shows what they send.
- **Examples** use fictional names and data (for example project "NH-44" and user "ACME1234"). Replace them with your own.

> Screens that are not yet final are marked **[Gated]** (the page exists, but part of it depends on a decision or service that is still open). See the Open items (section 19).

## 3. How Core is organised (in one minute)

Core is the company control centre. It holds the information every other module relies on: your company profile, policies, projects, locations, stores, materials, vendors, equipment, people and organisation, and approval rules. Other modules read this information. They do not change it.

There are two kinds of signed-in people:

| Kind of user | What they see |
|---|---|
| **Administrator** (holds the access-management privilege) | The full application: the menu, dashboard and every screen in this guide. |
| **Everyone else** (module heads, approvers and so on) | A single page that says "Your module screens are not in this application", with a Sign out button. They use the screens of their own module instead. |

Inside the full application, what you can **change** depends on the "manage" privileges your account holds:

| Privilege | Lets you change |
|---|---|
| Projects manage | Projects, locations, stores, geo-fence zones, milestones, WBS |
| Masters manage | Materials, vendors, equipment types, equipment units, plan lines (equipment, resource and material planning), maintenance schedules |
| Organisation manage | Departments, roles, holidays, shifts |
| Access manage | Users and access grants (this privilege is also what makes you an administrator) |
| Policies manage | Policies, their versions, custom policies |

If you do not hold the privilege for a screen, you can still read it, but the Add, Edit, Remove, Bulk upload and similar buttons are not shown. Two screens are hidden completely unless you hold Access manage: **Users and roles** and **Activity log**.

## 4. Signing in

### 4.1 Choosing a login

Open the sign-in page and choose one of two options:

- **Login as admin** for the company administrator.
- **Login as user** for registered company users.

An administrator account only works on the admin login, and any other account only works on the user login. If you use the wrong one, you see: "This login ID does not sign in on the admin login. Try a different password, or login as user." (or the matching message for the user login). You are signed out again automatically.

### 4.2 Signing in with a password

1. Type your **Login ID**. It is made of your company prefix followed by four digits (for example ACME1234). Core changes what you type to capital letters.
2. Type your **Password**. Use the eye button to show or hide it.
3. Choose **Login**.

You land on the Dashboard. The header shows a chip with your company name, so you know which company's data you are looking at.

If the login ID starts with a prefix that no company uses, Core says "This login ID does not belong to a company set up here." Nothing is sent to the server in that case.

### 4.3 Signing in with a passkey

A passkey lets you sign in with the fingerprint, face or PIN of your device instead of typing a password.

1. Type your Login ID.
2. Choose **Sign in with passkey** and follow your device's prompt.

If the Login ID box is empty you see "Enter your login ID first." If the passkey fails or you close the prompt, Core shows the reason and you can try again or use your password.

To add or remove a passkey, open the account menu (your name, top right) and choose **Passkeys**, then **Add passkey**. To remove one, choose its remove option and confirm. You can add it again later.

### 4.4 Wrong password and locking

- A wrong Login ID or password shows "Login ID or password is wrong. Repeated failures lock the account for a while." Core does not say which one was wrong.
- After too many failures, Core locks the sign-in and counts down: "Too many attempts. Try again in N seconds." The Login button shows the countdown.

### 4.5 Forgot password and one-time passwords (OTP)

A one-time password (OTP) is a 6-digit code. Core uses OTP codes when you reset a forgotten password and when a new company registers (to confirm the email and mobile number). It does **not** ask for an OTP on every sign-in.

1. On the login page choose **Forgot password?**
2. Enter your Login ID and choose **Send OTP**.
3. Enter the 6-digit **OTP** and a new password, then choose **Reset password**.
4. After five wrong tries Core says "Too many wrong attempts. Request a new OTP." Choose **Resend OTP**.

At present no email or SMS service is connected. In test setups the screen shows a sample code. See Open items.

### 4.6 Your first sign-in and changing your password

If an administrator created your account or reset your password, you are given a **temporary password**. At first sign-in Core asks you to choose a new one:

- It must be at least **12 characters** and different from the current one.
- The two new-password boxes must match ("Passwords do not match.").
- After you change it: "Password changed. Other sessions were signed out."

### 4.7 Step-up confirmation ("Verify it's you")

Some actions are sensitive, so Core asks you to prove it is really you, even though you are signed in. A box titled **Verify it's you** appears. The check lasts **five minutes**; during that time you are not asked again.

| Action | How you confirm |
|---|---|
| Granting or revoking a user privilege | Passkey only |
| Exporting the full activity log | Passkey only |
| Changing or deleting a geo-fence zone | Passkey, or your password |

Choose **Use passkey** and follow your device's prompt. Where a password is allowed, type it and choose **Verify with password**. If you close the passkey prompt you see "The passkey prompt was closed. Try again to continue." If you have no passkey, add one first (section 4.3). If your browser does not support passkeys, Core asks you to use a browser that does.

### 4.8 "You signed in on another device, so this session has ended"

Core allows **one active session per person**. If you sign in on a second computer or browser, the first one is signed out the next time it talks to the server. The first browser then shows either:

- on the sign-in page: "You signed in on another device, so this session has ended."; or
- on a screen: "You have been signed out. Your session ended, or this device was signed out from another one. Sign in again."

Nothing is wrong with your account. Sign in again. Anything you typed but did not save is not kept.

### 4.9 Signing out

Open the account menu (your name, top right) and choose **Sign out**.

## 5. Finding your way around

### 5.1 The screen

- **Header:** a Search box ("Search or jump to a page…", Ctrl K), your company chip, the light/dark switch, the notifications bell and your account menu.
- **Menu (left):** grouped as listed in sections 7 to 21. On a phone the menu opens from the menu button, and the four most-used screens also appear in a bottom bar.
- **Page area:** each page has a title, a short description and buttons at the top right.

[Screenshot: Dashboard with menu, header and company chip]

### 5.2 Tables: search, filters, sorting and export

Most lists share the same behaviour:

- **Search box:** narrows the rows. On the Activity log, Search only narrows the rows already on the page; use the filters above it to search the whole log.
- **Chips:** filter by status or category. Pick more than one to combine them.
- **Export:** a button on the table downloads the rows as a CSV file.
- **Details / Edit:** open a row to see or change it.

### 5.3 Bulk upload (many records at once)

Bulk upload is available on Projects, Locations, Stores, Materials, Users, Project equipment planning, Resource planning, Material planning, Company equipment register, Departments, holidays and chainage markers.

1. Choose **Bulk upload**.
2. Step 1: choose **Download template** (a CSV file). Keep the column headings exactly as they are. Fill one row per record. Required columns are marked with an asterisk.
3. Step 2: choose your CSV file. If a column is missing, Core says "Missing column: ... Download the template to see the exact headings."
4. Core checks every row. You can show good rows and problem rows separately. Choose **Error report** to download a file listing each problem row and what is wrong.
5. Choose **Add N records**. Only the good rows are saved. Rows the server refuses are listed afterwards and the others still save.

### 5.4 The "Leave without saving?" prompt (unsaved changes)

If you started typing in a form and then try to leave (another menu item, the browser's back button, or closing the tab), Core stops you with **Leave without saving?** Choose **Stay and keep editing** to go back to the form, or confirm to leave and lose the changes. A form that is in the middle of saving is not counted as unsaved. After a successful save, no prompt appears.

### 5.5 Light and dark mode

Choose the sun/moon **switch** in the header ("Switch to dark mode" / "Switch to light mode"). You can also press Ctrl K and choose **Switch to dark mode** (or light mode) under Actions.

### 5.6 Notifications

The bell in the header lists items that need your attention. Choosing one opens the page where you must act (for example an approval request, a grievance, the geo-fence page or an approval chain). Some menu items show a count bubble: **Approvals** (requests waiting) and **Grievances** (visit requests).

### 5.7 Messages you will see on many screens

| Message | What it means |
|---|---|
| "Someone else changed this ... The latest version is loaded" | Another person saved the same record after you opened it. Nothing was overwritten. Check what is on screen, make your change again, and save. |
| A banner: Core cannot reach the server | Your last change may not be saved. Wait, choose **Check again**, then open the record to see whether your change is there. |
| An error with a reference code | Quote the reference to support. It identifies your request in the server logs. |
| "You do not have access to this page." | Your account lacks the privilege for that screen. |

## 6. Dashboard

**Purpose:** a summary of what needs administrator attention.

**Who:** every administrator.

**What you see:** cards for **Waiting for approval**, **Low stock**, **Active projects** and **Grievances** (each opens its list), chainage and project charts, and an **Awaiting approvals** table. The **Open approvals** button goes to Approvals. Administrators also see when other modules last synced.

**Tasks:** choose a card or the **Review** button on a row to go to the item.

[Screenshot: Dashboard]

## 7. Menu group: Company setup

### 7.1 Company profile

**Purpose:** the legal identity of your company, used across every module.

**Who:** all administrators can read. Saving needs the privilege for company changes held on your account.

**Fields:**

| Section | Fields |
|---|---|
| Legal identity | Company legal name, Trade name, PAN, GSTIN, CIN, TAN, company logo |
| Registered address | Address line 1, Address line 2, City, State, PIN code, Country |
| Primary contact | Contact name, Email, Mobile, Website |

**Notes:** GSTIN is filled in from the PAN and the state, and GSTIN, CIN and TAN are checked on the screen for the right shape. Use **Upload logo** or **Change logo**; a chosen but unsaved logo counts as an unsaved change. The offer-letter format also lives here (see 10.5). Saving shows "Company profile saved".

**Common errors:** a field shows its message under the box (for example an invalid PAN). Fix it and save again.

[Screenshot: Company profile]

### 7.2 Policies

**Purpose:** company rules that other modules follow. There are six built-in policies: **Rules and regulations**, **Payment threshold**, **Holiday policy**, **Shift count**, **Leave policy** and **Overtime policy**. You can also create **custom policies**.

**Who:** read for all administrators; change needs Policies manage.

**Tasks:**

- **Set up from standard templates:** policies that have no values yet can be set up from templates; Core reports how many were set up.
- **Change a policy:** open it, save a new **version** with an effective date and a reason. A new version applies only **from its effective date**; past payroll and attendance never change, so the earliest effective date is today.
- **Compare versions:** the version history lets you compare two versions; the change is highlighted.
- **Create a custom policy:** choose **Create custom policy**, give it a name and first values.
- **Delete a custom policy:** the confirmation tells you how many fields and versions go with it. After deleting, it is gone and the activity log records it.

**Note:** Payment threshold: advance payments below the threshold are paid by PMS; at or above it, Head Office approves and pays.

### 7.3 Subscription [Gated]

**Purpose:** shows your plan and a comparison of plans.

**Status:** the plans shown are sample data. Upgrade, renewal and support messages have no server connection yet, so do not rely on them. See Open items.

## 8. Menu group: Projects and locations

### 8.1 Projects

**Purpose:** the list of projects (contracts) and their details.

**Who:** read for all administrators; add and edit need Projects manage.

**Tasks:**

- **Add a project:** choose **New project** (or **Bulk upload**). Fields: **Project name**, **Project ID** (for example NH-44), **Client**, **Contract value (₹)**, **Start date**, **End date**, **Status**, **Description**.
- **Edit:** open a project and choose edit. The **Project ID cannot change** after creation, because other records refer to the project by it.
- **Project tabs:** **Details**, **Milestones**, **WBS**, **BOQ**, **Locations**, **Geo-fence**, **Resource Planning**, **Material Planning**, **Equipment Planning**.

**Tab notes:**

| Tab | What to do |
|---|---|
| Milestones | Add or edit a milestone with name, due date, weight (%) and status. The weights total and the percent complete are shown. |
| WBS | A tree of work items. Add an item with a parent, a code, a name and a status (an item can be set to Inactive). To remove an item, remove its child items first ("Remove its child items first."). |
| BOQ | Bill of quantities. Each amount is quantity times rate and the total adds up. |
| Locations | The locations that belong to this project. |
| Geo-fence | The map and zones for attendance (see 8.3). |
| Resource / Material / Equipment Planning | The same planning lines as sections 8.4, 8.5 and 12.4, filtered to this project. |

**Common errors:**

| Message | What to do |
|---|---|
| "Another project uses this project ID." | Choose a different project ID. |
| "Someone else changed this..." | See section 5.7. |
| "Planning and On hold are not stored by the server yet." (hint beside Status) | Use a status the server stores. Completed closes the project. |

[Screenshot: Projects list]

### 8.2 Locations (sites)

**Purpose:** each physical place where work or storage happens. A location belongs to **one project** and cannot be moved to another project later.

**Who:** read for all administrators; add and edit need Projects manage.

**Tasks:**

- **Add:** choose **New location** (or **Bulk upload**). Fields: **Location name**, **Location code**, **Project** (required, fixed afterwards), **Status** (Active or Inactive), **Address**, **City**, **State**, **PIN code**, **Location in-charge**, **Incharge mobile number**, **Email**, **Latitude**, **Longitude**. Latitude and longitude are optional decimals, for example 17.385044; when entered, the location page shows the position as a map link.
- **Open a location** from the list (Open button) to edit its details.
- **Chainage tab:** the location page has two tabs, **Details** and **Chainage**. Chainage belongs to a **project**, so the tab shows the chainage of **the location's own project**. You see a **Chainage range** (start and end km) and **Chainage markers** (km, label and WBS item). Choose **Edit chainage** to change the range, to add markers one by one, or to **Bulk upload** them from a CSV. If the location has no project, the tab says "No project yet".

**Common errors:** "Another location uses this code." (choose another code); "Projects were not read from the server, so no location was saved. Reload the page and try again." (reload, then retry).

[Screenshot: Location details and Chainage tab]

### 8.3 Geofences

**Purpose:** the boundary zones on a map inside which attendance is accepted. "Attendance is accepted inside any zone of its project."

**Who:** read for all administrators; changes need Projects manage and a **step-up confirmation** (passkey or password).

**Tasks:** choose the **Project**, select a zone on the map or in the **Zones** list, then **Edit zone**. To add one, use the add option on the map. Zone shapes: a polygon (click the map to drop pins), a circle (centre and radius) or a linear zone for a road or canal (pins along the centre line plus width). **Delete** removes a zone after verification; if you cancel the check you see "Zone not deleted: verification cancelled".

A project with no zone shows a note: "Attendance needs a geo-fence".

### 8.4 Resource planning

**Purpose:** the manpower each project needs by role or trade.

**Fields:** **Project**, **Position** (a role from the organogram), **Role / trade**, **Headcount** (whole number, 1 or more), **From**, **To** (must be after From), **Status** (Planned, Confirmed or Fulfilled).

**Tasks:** **Add requirement**, **Bulk upload**, **Edit**, **Remove**; filter with **Show project** and the status chips. Totals appear above the table. Needs Masters manage to change.

**Note:** the code and the release notes disagree about whether this screen uses the server or sample data. See Open items.

### 8.5 Material planning

**Purpose:** the materials each project needs, with the quantity planned against the BOQ.

**Fields:** **Project**, **Material**, **Quantity**, **Unit**, a required-by date, **Target store**, **Status** (Planned, Requested, Ordered or Received).

**Tasks:** **Add material line**, **Bulk upload**, **Edit**, **Remove** (needs Masters manage). The same open item as 8.4 applies.

## 9. Menu group: People and organisation

### 9.1 Organogram

**Purpose:** a chart of your reporting structure, built from roles.

**Tasks:** select a role to view, edit or add a role below it; use **Find a role or person**, the **View** switch, **Show inactive roles** and the zoom controls; **Export** downloads the structure as CSV; **Users and roles** opens that screen; **Add role** adds a role (needs Organisation manage).

### 9.2 Departments

**Purpose:** the departments that roles belong to.

**Fields:** **Department name**, **Department code**, **Part of** (optional parent), **Head role**, **Status** (Active or Inactive), colour on the organogram, **Description**.

**Tasks:** add, edit, bulk upload (needs Organisation manage). A department that still has active roles cannot be deactivated: move the roles first.

### 9.3 Users and roles

**Purpose:** create and manage the people who have Core accounts, and the roles on the organogram.

**Who:** only administrators (Access manage). The menu item does not appear for anyone else.

**Two views** (tabs): **People** and **Roles**.

**People:**

- Only **module heads** and **high-level approvers** are created in Core. Ordinary module users are created in HRMS and managed by their module head.
- **New user** (or **Bulk upload**): **Full name**, **Designation**, **Email**, **Mobile**, **Login ID** (type only the 4 digits; the company prefix is added for you; it cannot change later), **Role** (Module head or Approver), **Modules** (for module heads; each module has only one active head, though one person may head several) and **Scope** (Company or specific projects).
- After you create a user, a **Temporary password** box shows the Login ID and password **once only**. Copy it and pass it on securely; the user must change it at first sign-in. With a bulk upload you can also download a CSV of the passwords.
- On each row: **Open**, **Reset password** (ends the user's sessions and issues a temporary password) and **Deactivate** or **Reactivate**. Reactivating is blocked when another active head already holds one of the user's modules.
- **Privileges:** open a user and use **Grant privilege** or **Revoke**. Each change asks for a passkey step-up and appears in the activity log. Revoking takes the privilege away at once.

**Roles:** add or edit a role with **Role title**, **Role code**, **Department**, **Grade** (E executive, M manager, S staff, W workmen), **Reports to**, **Planned positions**, **Held by**, **What the role does** and **Status**.

**Common errors:** "Another role uses this code." (choose another code); the department must be active when saving a role.

[Screenshot: Users and roles]

### 9.4 Approvals

**Purpose:** requests from across the company that need a decision.

**Who:** all administrators can read. Only the **current approver** at the request's current level can decide.

**The list:** summary tiles (**Waiting for decision**, **Emergency**, **Approved**, **Rejected**), a view switch (**All**, **Approved**, **Pending**, **Rejected**), filters **Module**, **Current level** (Level 1 to 4), **Raised from** and **Raised to**, and category chips (Hiring, Employee actions, Equipment and material, Payments and loans). Buttons: **New request**, **Approval matrix**, **Review oldest**.

**Raise a request:** choose **New request**. Fields include **Request type**, **Module**, **Title**, **Amount (INR)**, **Emergency**, **Needed by**, **Project**, **Location** and **Chainage**. If the request is not an emergency you must give the date: "Enter the date this is needed by, or mark the request as an emergency." The emergency flag raises priority only and never skips approval.

**Decide a request:** open it (Review). You see the request details and the approval chain with each level's state. Then:

1. Optionally type a **Comment**. It is **required** when you reject or ask for clarification.
2. Choose **Approve**, **Reject** or **Clarify**.
3. Core asks you to confirm ("Approve REQ-...?" or "Reject REQ-...?"). Rejecting says the request is closed and **cannot be undone**. Approving says it moves to the next level, or, at the last level, that the request is approved. Choose **Confirm approval** or **Confirm rejection**. A second click does not send twice.

**Why are the buttons greyed out?**

| What you see | Reason |
|---|---|
| "Waiting on [name]" | You are not the approver for this level. |
| "You raised this request" | Segregation of duties: someone else must approve it. |
| "Clarification requested" | The request stays at its level until the person who raised it answers. |

**Reminders:** if an approver does not act within the level's reminder interval, the same approver is reminded again at each interval. Requests are never escalated and nothing is decided automatically.

### 9.5 Job openings

**Purpose:** recruitment vacancies and whether hiring is done at the location or by Head Office.

**Tasks:** the table shows each request's position and project, CTC range, route, approval state and stage. Approve an opening from its request page; **publish** Head Office openings from here. **Offer letter format** shows the one company format (replaced from Company profile).

## 10. Menu group: Inventory/Store

### 10.1 Stores

**Purpose:** the stores that hold materials. **A store is linked directly to a location** (and through the location to its project).

**Who:** read for all administrators; add and edit need Projects manage.

**Fields:** **Store name**, **Store code**, **Location** (required; the list shows location name, code and project), **Address**, **Store keeper**, **Store Keeper Mobile**, **Status** (Active or Inactive).

**Tasks:** **New store**, **Bulk upload** (columns: code, name, location_code, location, keeper, phone, status), **Edit**, and a **Live stock** button on each row that opens that store's stock. Tiles show Stores, Material masters, Out of stock and Projects served.

**Common errors:**

| Message | What to do |
|---|---|
| "Another store uses this code." | Choose another store code. |
| "Location code ... does not exist." (bulk) | Use a code from the Locations screen. |
| "Store code ... already exists." / "appears twice in the file." (bulk) | Remove the duplicate. |
| "Check the highlighted fields." | Fix the boxes shown in red. |

[Screenshot: Stores]

### 10.2 Materials

**Purpose:** the material master (owned by Stores).

**Fields:** **Material name**, **Material code**, **HSN code**, **Category**, **Unit of measure**, **Reorder level**, **Status**, and which stores the material is available in. **Who:** change needs Masters manage.

### 10.3 Vendors

**Purpose:** suppliers, equipment hire owners and service providers.

**Fields:** **Vendor name**, **Vendor code**, **GSTIN**, **PAN**, **Email**, **Phone**, **Address**, **Status**.

**Notes:** GSTIN is 15 characters and PAN is 10 (for example AAHCV1234K); characters 3 to 12 of the GSTIN must equal the PAN. Choose **Verify** on a vendor to mark it verified (the **Verified** column then shows a date). A vendor is **deactivated, never deleted**, so history stays. Needs Masters manage.

### 10.4 Live stock

**Purpose:** current stock per store as published by the Stores module (read only).

**Columns:** Material, Free, On hand, Reserved, Reorder level, Level. **Free stock = on hand less reserved.** Use **Show stock for** to pick a store; chips filter by stock level. The subtitle shows the time of the last update.

### 10.5 Available materials

**Purpose:** materials that are free to assign to work: on hand less reserved, across every store, with where they are held. If no stock has been published yet, a note says so.

## 11. Menu group: Equipment

Equipment screens work together:

1. **Company equipment register** lists each machine.
2. **Maintenance** holds each machine's service schedules.
3. **Available equipment** lists machines marked Available and lets you assign them.
4. **Project equipment planning** says how many of each type a project needs.

### 11.1 Company equipment register

**Purpose:** every registered equipment unit with its project and availability.

**Who:** read for all administrators; add, bulk upload, edit and assign need Masters manage.

**The table:** **S No**, **Equipment Name**, **Made**, **Model**, **Capacity / size**, **Company Code**, **Current Project** and **Current Status**. Tiles count **Available**, **In use**, **Under maintenance** and **Breakdown**. Filter with **Show project** and the availability chips; search by asset code, name, type or registration number.

**Add equipment:** choose **Add equipment**. A four-step form opens: **Identity** (Equipment ID, Equipment name, Ownership type Owned or Hired, Machine photo), **Technical** (manufacturer, model, manufacturing year, chassis and engine numbers, registration number, capacity and capacity unit, meter reading and meter photo, fuel details, invoice, insurance, PUC and fitness papers), **Ownership & location** (owner or vendor, hire agreement reference and dates, warranty, **Current project** and **Current location**) and **Review & save**. Choose **Continue** and **Back**, then **Register equipment**. The meter photo is required. You can take a photo with the camera or upload a file.

**Bulk upload** columns include asset_code, equipment_name, reg_no, ownership_type, project_code and availability (default Available), plus the specification columns shown in the template.

**Details:** choose **Details** on a row to see all fields, the photo and documents, and the **Project assignments**. **Edit** changes name, registration number, availability, location, owner, meter reading and expiry dates.

**Assign:** choose **Assign** on a row. The **Assign to project** box asks for a **Project** and a **Quantity** (a whole number, 1 or more). Assignments are kept **per project and equipment type, not per unit**. To undo one, open **Details** and choose **Unassign** next to it. If the unit's type is not on the server yet, the Assign button is disabled ("This type is not on the server yet").

**Common errors:**

| Message | What to do |
|---|---|
| "The project has no location to link the unit to. Add a location to the project first." | Add a location to the project, then register the unit. |
| "Company code ... is already registered." (bulk) | Use a unique code. |
| "Choose a location of the selected project." | The location must belong to the chosen project. |

> Machine positions on the register are sample data until a GPS device is chosen; "No fix" is normal.

[Screenshot: Company equipment register]

### 11.2 Maintenance

**Purpose:** how often each machine is serviced and when it is next due.

**Who:** everyone signed in can read; **Add schedule**, **Edit** and **Remove** need Masters manage.

**Fields:** **Machine**, **Task** (for example General service, Oil change), **Every (months)**, **Every (running hours)**, **Last serviced on**, **Meter hours at last service**, **Notes**. Give months, hours or both. With both, "whichever comes first" applies. A schedule stays with its machine, and a machine cannot have two schedules for the same task.

**Status meanings:**

| Status | Meaning |
|---|---|
| Up to date | Next due date or hours are comfortably away. |
| **Due soon** | Within **14 days** of the due date, or within the **last 10%** of the hour interval. |
| **Overdue** | The due date has passed, or the machine's meter reading is past the due hours. |
| No service recorded | There is no last service date or hours, so Core has nothing to count from. |

Hours are counted from the **meter reading in the equipment register**, so keep that reading current. Tiles show Overdue, Due soon, Up to date and Machines without a schedule. Use the status chips to filter. Removing a schedule asks you to confirm and cannot be undone.

**Common errors:** "Set how often: months, hours, or both."; "This machine already has a schedule for this task."; the Add schedule button is disabled until schedules and machines have loaded.

### 11.3 Available equipment

**Purpose:** units marked **Available** that can be given to work.

**Columns:** Asset, Type, Model, Capacity / size. Tiles show Units available and Equipment types. **Assign to project** opens the same box as the register (needs Masters manage). **Open the register** goes to the full register.

### 11.4 Project equipment planning

**Purpose:** the equipment each project needs.

**Who:** read for all administrators; change needs Masters manage.

**How the table works:**

- **One row per project and equipment type.** If a project has several lines for the same type, Core **adds the units together** in one row.
- Columns: **Type**, **Needed at** (the project and the purposes), **Capacity / size**, **Model**, **Units planned** and **Needed from** (the earliest date). If lines differ, the capacity and model show every different value.
- A line has **no end date**, only a "needed from" date.
- Use **Show project** to filter. Tiles show Planned units, Equipment types and Projects planned.

**Add a line:** choose **Add plan line**. Fields: **Equipment type** (or **Other…** to name a new type), **Units needed**, **Capacity / size** (optional; pick a suggestion or type your own, for example 30-ton), **Model** (optional, for example EX200), **Project**, **Needed from** and **Purpose** (at least 3 characters).

**Manage lines:** when a row combines more than one line, its button reads **Manage N lines**. It opens a **Planned lines** box listing each line (units, capacity and model, from date, purpose) with **Edit** and **Remove** on each. A row with a single line shows **Edit** and **Remove** directly.

**Remove:** a **Remove plan line?** box asks for a **Reason** (at least 3 characters). Equipment requests are then checked without that line. The change is kept in the activity log.

**Bulk upload** columns: equipment_type, code (project code), units, from, purpose.

**Common errors:** "Choose the project."; "Whole units only."; "Pick a start date."; "Say what the units are for."; "Someone else changed this line..."; in bulk, "The same line already exists."

[Screenshot: Project equipment planning]

## 12. Menu group: Governance

### 12.1 Approval matrix

**Purpose:** the approval chains: who approves each request type, at up to four levels.

**Tasks:**

- **New approval chain:** pick a **Request type** and **Scope** (whole company, one or more projects, or one or more locations), then set the approvers: start with one level and add up to four. Each level has a **Remind every** interval.
- **Selecting a chain:** the most specific chain applies: location first, then project, then company.
- **Edit:** saving creates a **new version dated from its effective date**. Requests already raised keep the version they started with.
- **Not usable yet:** a chain with no level 1 approver cannot be used until you set one.

### 12.2 Grievances

**Purpose:** requests to visit Head Office. A grievance holds only an ID, the person's name, a short message and the wanted visit date.

**Tasks:** open one and **confirm** the date, **reschedule** it with a reason, or after the day mark it **Visited** or **Not visited** (with an optional visit note). Each step is kept in the History. **Next Head Office visit** opens the nearest one.

### 12.3 Activity log

**Purpose:** a record of what people did in Core and in the other modules, kept so the company can check who did what and when. Entries cannot be edited or deleted.

**Who:** only administrators (Access manage).

The page has **four tabs**:

| Tab | What it shows |
|---|---|
| **Activity** | Changes to records in Core and the other modules (HRMS, P&M, PMS, Stores): who did what, and when. |
| **Sign-ins** | Sign-ins, failed attempts, lockouts, ended sessions, passkeys and refused access. |
| **Data exchange log** | Messages Core sends to and receives from HRMS, P&M, PMS and Stores: waiting, sent, received or failed. |
| **Shared records** | The latest copy Core holds of records owned by HRMS, P&M, PMS and Stores. |

**Activity tab filters:** **From**, **To** (From must be on or before To), **Module** (CORE, HRMS, P&M, PMS, Stores), **Area** (for example Project, Store, Equipment unit, User access, Approval request), **What** (Created, Updated, Deleted) and **Person** (name or login). Choose **Apply filters**; **Clear filters** resets. Filters run on the server, so they search the whole log; the Search box only searches the page you are looking at. Results are 50 per page with **Previous** and **Next**.

**Table columns:** Date/Time, Module, Changed by, Record, What happened, Area. **Details** opens an entry showing the changed fields (from and to) or the values recorded or removed.

**Export all entries** (top right) downloads every entry that matches the filters as a CSV. It needs a **passkey step-up**.

**Sign-ins tab:** filters From, To, Module, **Event** (for example Signed in, Sign-in failed, Account locked, Signed out, Password reset, Signed in with a passkey) and Person.

**Data exchange log tab:** summary tiles (**Waiting to send**, **Sent**, **Received**, **Dead-letter**), filters **Direction** and **State**, and a **Refresh** button. A **Dead-letter** message is one Core could not apply and stopped trying; after the cause is fixed, choose **Replay**. A note says that messages to other modules wait until the way of sending them is chosen. See Open items.

**Shared records tab:** a **Sync by module** summary (how many records and when each kind last changed), a search, and a list of records with their source module, fields, sequence, last synced time and state (**Current** or **Deleted at source**).

[Screenshot: Activity log]

## 13. Menu group: Support

### 13.1 Help and support

**Purpose:** answers to common questions and a way to raise a ticket.

**Tasks:** search the **Frequently asked questions**. To raise a ticket, fill **Subject** (up to 120 characters), **Category**, **Priority** (Low, Medium, High) and **Description** (at least 20 characters; include the screen, the record ID and what you expected), then send.

## 14. Keyboard and accessibility tips

| Tip | How |
|---|---|
| **Search or jump anywhere** | Press **Ctrl K** (Cmd K on a Mac), or choose the search box in the header. Type at least two letters to also find records by code or name. |
| Move in the search list | Up and down arrows move, **Enter** opens, **Esc** closes. |
| Skip the menu | The first Tab press on a page offers **Skip to main content**. |
| Dark or light | The header switch, or Ctrl K then "Switch to dark mode". |
| Show the password | The eye button on password boxes. |
| Phone | The menu button opens the menu; the bottom bar holds the four most-used screens. |
| Zoom the organogram | Use the zoom buttons on the chart. |
| Forms | Errors appear under the box and are announced; boxes marked required carry an asterisk. |

The release notes record that Core was not yet tested in Edge or with a screen reader. See Open items.

## 15. Glossary

| Term | Meaning |
|---|---|
| Administrator | A user holding the access-management privilege; sees the full Core application. |
| Approval chain | The ordered levels (1 to 4) of approvers for a request type. |
| Approval matrix | The set of all approval chains. |
| Assignment (equipment) | A quantity of an equipment type given to a project; kept per project and type. |
| BOQ | Bill of quantities: items with quantity and rate. |
| Chainage | Distance markers in km along a road or canal, kept per project. |
| Dead-letter | A message Core could not apply and stopped retrying. |
| Due soon / Overdue | Maintenance states; see 11.2. |
| Geo-fence | A map boundary inside which attendance is accepted. |
| HMR | Hour meter reading: a machine's running hours. |
| Location | A place where work or storage happens; belongs to one project. |
| Manage privilege | A permission to change one family of records (section 3). |
| OTP | One-time password: a 6-digit code. |
| Passkey | A sign-in method using your device's fingerprint, face or PIN. |
| Plan line | One row of planning (equipment, people or material) for a project. |
| Step-up | An extra identity check before a sensitive action; lasts five minutes. |
| Version | A saved edition of a policy or approval chain with an effective date. |
| WBS | Work breakdown structure: the tree of work items in a project. |

## 16. Frequently asked questions

1. **Why do I only see a page saying my module screens are not in this application?** Your account is not an administrator. Use your own module's screens, or ask an administrator.
2. **Why is "Users and roles" or "Activity log" missing from my menu?** Both need the access-management privilege.
3. **Why can I see a screen but not the Add or Edit buttons?** You lack the manage privilege for that area (section 3).
4. **Is my login ID case sensitive?** Core changes what you type to capital letters, so type it either way.
5. **Why was I signed out?** Your session expired, you signed in somewhere else (one session per person), or an administrator ended it. Sign in again.
6. **I forgot my password. What do I do?** Choose Forgot password?, enter your Login ID, then the 6-digit OTP and a new password (section 4.5).
7. **How long must a new password be?** At least 12 characters, and different from the current one.
8. **Why am I asked to "Verify it's you"?** The action is sensitive (privilege changes, activity log export, geo-fence changes). The check lasts five minutes.
9. **Can I confirm with my password instead of a passkey?** Only for geo-fence changes. Privilege changes and the activity log export need a passkey.
10. **Can I change a project ID?** No. It is fixed after creation.
11. **Can I move a location to another project?** No. A location stays with the project it was created for.
12. **Where do I see the chainage of a location?** On the location's Chainage tab. It shows the chainage of the location's project.
13. **Why does the equipment planning table show one row for several lines?** Lines for the same project and equipment type are added together. Use Manage N lines to see or change each one.
14. **Does an equipment plan line have an end date?** No. Only a Needed from date.
15. **Why is the Assign button greyed out?** The unit's equipment type is not on the server yet.
16. **Is equipment assigned per machine?** No. Assignments are per project and equipment type, with a quantity.
17. **What does "Due soon" mean for maintenance?** Within 14 days of the due date, or inside the last 10% of the hour interval.
18. **Why does a machine show "No service recorded"?** Its schedule has no last service date or hours.
19. **Can I delete a vendor?** No. Deactivate it; its history stays.
20. **Can I edit an activity log entry?** No. Entries cannot be edited or deleted.
21. **Why can't I approve a request?** You are not the current approver, you raised it, or it is waiting for a clarification.
22. **What does the emergency flag do?** It raises priority only. It never skips approval.
23. **Does editing an approval chain change requests already raised?** No. They keep the version they were raised under.
24. **What happens if an approver is absent?** They are reminded at each interval. Nothing is escalated or decided automatically.
25. **Where did I put the temporary password for a new user?** It is shown once when the user is created or reset. If lost, use Reset password to issue a new one.
26. **Why does a bulk upload add fewer rows than my file?** Rows with problems are not added. Download the Error report, fix the rows and upload again.

## 17. Troubleshooting

| What you see | Likely cause | What to do |
|---|---|---|
| "Login ID or password is wrong..." | Wrong ID or password | Retype carefully; use Forgot password? if needed. |
| "Too many attempts. Try again in N seconds." | Too many failed sign-ins | Wait for the countdown. |
| "This login ID does not belong to a company set up here." | Unknown company prefix | Check the prefix with your administrator. |
| "This login ID does not sign in on the admin/user login..." | Wrong login type | Use the other login choice. |
| "You signed in on another device..." / "You have been signed out..." | Session ended | Sign in again. |
| "Cannot reach the server. Check your connection and try again." | Network or server unavailable | Check the connection; use Check again on the banner. |
| "Someone else changed this..." | Two people edited the same record | Review the loaded version and redo your change. |
| "You do not have access to this page." | Missing privilege | Ask an administrator. |
| "The passkey prompt was closed." | You dismissed the prompt | Try again, or add a passkey first. |
| "Projects were not read from the server, so no location (or store) was saved..." | Project list did not load | Reload the page and retry. |
| Upload says "Missing column..." | Template headings changed | Download the template again. |
| "The project has no location to link the unit to." | Project has no location | Add a location to the project. |
| Maintenance "could not be loaded" | Server error | Choose Try again. |
| Error with a reference | Server error | Send the reference to support. |

## 18. Sources checked

Application (frontend `CORE__FRONTEND`):

- `src/modules/shell/config/nav.ts`, `src/modules/shell/components/Header.tsx`, `CommandPalette.tsx`, `Shell.tsx`
- `src/app/App.tsx`, `src/app/pages/ModuleHome.tsx`, `NoAccess.tsx`
- `src/modules/auth/pages/Login.tsx`, `ForgotPassword.tsx`, `ChangePassword.tsx`, `Passkeys.tsx`, `Register.tsx`; `auth/access.ts`; `auth/store/useAuth.ts`
- `src/shared/lib/stepUp.tsx`, `unsaved.ts`, `useGuardedForm.ts`, `api.ts`; `src/shared/ui/UnsavedChangesGuard.tsx`; `src/shared/ui/data/BulkUpload.tsx`
- `src/modules/resources/pages/*` (EquipmentPlanning, EquipmentRegister, AvailableEquipment, Maintenance, Stores, Materials, Vendors, LiveStock, AvailableMaterials) and `resources/components/EquipmentControls.tsx`
- `src/modules/core-data/api/maintenance.ts`, `api/audit.ts`
- `src/modules/projects/pages/*` and `projects/components/ProjectForm.tsx`, `SiteForm.tsx`, `GeoFenceTab.tsx`, `utils/planning.ts`
- `src/modules/audit/pages/AuditTrail.tsx`, `audit/components/SignInHistory.tsx`; `integrations/pages/EventMonitor.tsx`, `ReadModels.tsx`
- `src/modules/organisation/pages/*` and `components/UserForm.tsx`, `PrivilegeGrants.tsx`, `TempPasswordDialog.tsx`, `RoleForm.tsx`, `DepartmentForm.tsx`
- `src/modules/approvals/pages/*` and `components/RaiseRequestDialog.tsx`; `grievances/pages/*`; `company/pages/*`, `company/utils/meta.ts`; `support/pages/Help.tsx`; `dashboard/pages/Dashboard.tsx`

Existing documents (`CORE__FRONTEND/docs`): `SCREEN_INVENTORY.md`, `UAT_SCRIPTS.md`, `RELEASE_NOTES_DRAFT.md`, `screens/23-users-and-roles.md`.

## 19. Open items

| # | Item | Status |
|---|---|---|
| 1 | Document owner and approver | To be confirmed |
| 2 | Support contact channel, support hours and ticket response times | To be confirmed |
| 3 | Email/SMS provider for OTP codes (today no message is sent; test builds show a sample code) | To be confirmed |
| 4 | Whether Resource planning and Material planning read and write the server. The release notes and screen inventory say "sample data"; the page code saves through the server. Verify on a running system before release. | To be confirmed |
| 5 | Subscription page: plan tiers and upgrade/renewal behaviour (sample data today) | To be confirmed |
| 6 | Data exchange log: the way messages are sent to other modules is not chosen, so outgoing messages wait | To be confirmed |
| 7 | The Help FAQ answer "Why am I asked for a code again?" mentions an authenticator app, but step-up in the code uses a passkey (or password for geo-fences). This guide follows the code; align the Help text. | To be confirmed |
| 8 | Which privilege lets an administrator save the Company profile, and the exact privilege names shown to users when granting | To be confirmed |
| 9 | Testing in Microsoft Edge and with a screen reader (NVDA) | Not yet done (per release notes) |
| 10 | Screenshots for the placeholders above | To be added |
| 11 | The menu notifications panel lists fixed sample entries in the code; confirm whether real notifications will replace them | To be confirmed |

## 20. Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-25 | To be confirmed | First draft for review. |
