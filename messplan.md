AI Agent Implementation Guide: Mess Management System (MMS)

Objective: Build a zero-cost, responsive web app for mess management.
Stack: Next.js (App Router), Tailwind CSS, shadcn/ui, Supabase (Auth, DB, Storage).

Part 1: Database Initialization (Supabase SQL)

Task: Create the following tables and enable Row Level Security (RLS).

profiles: id (uuid, PK), full_name (text), role (enum: 'manager', 'member'), upi_id (text, nullable), qr_code_url (text, nullable), balance (numeric, default 0).

meals: id (uuid), user_id (fk), date (date), type (enum: 'lunch', 'dinner'), status (enum: 'eating', 'off'), is_guest (bool, default false).

bazar_logs: id (uuid), shopper_id (fk), amount (numeric), items (text), date (date), verified (bool).

transactions: id (uuid), user_id (fk), amount (numeric), proof_url (text), txn_id (text), status (enum: 'pending', 'approved', 'rejected').

duty_roster: id (uuid), user_id (fk), date (date), duty_type (enum: 'bazar', 'water'), is_skipped (bool).

Part 2: Authentication & Onboarding

Task: Setup Supabase Auth and User Creation.

Implement Email/OTP or Google Login.

Logic: If it's the first user ever signing up, assign role: 'manager'. All others default to member.

Create a "Profile Setup" screen to collect full_name.

Part 3: Manager Settings & UPI Integration

Task: Build the Manager-only configuration page.

Allow Manager to update their upi_id.

Implement File Upload for qr_code_url using Supabase Storage.

UI: Display the QR code and UPI ID to members on their "Add Funds" page.

Part 4: Meal Attendance Engine (The Toggle)

Task: Build the core attendance interface.

Cut-off Logic: Ensure the AI uses local time (e.g., Moment.js or Intl.DateTimeFormat) for these checks so the server time doesn't lock users out early.

Lunch: Locked for users if current time > 09:00 AM.

Dinner: Locked for users if current time > 05:00 PM.

Manager Override: The Manager view must show a list of all members with a manual toggle that ignores cut-off times.

Guest Meals: Add a button "Add Guest Meal" which creates a record in the meals table with is_guest: true.

Part 5: Financial Workflow (Member Side)

Task: Implement the payment submission flow.

Create a form: Amount, Transaction ID, and File Picker (Screenshot).

Upload screenshot to supabase-storage/payments/.

Insert record into transactions with status pending.

Part 6: Manager Approval Center

Task: Build a dashboard for the Manager to verify entries.

Payment List: Show pending transactions. On "Approve":

Update transactions.status to approved.

Increment profiles.balance for that user.

Rejection Logic: Ask the AI to implement a 'Reject' button that allows the manager to add a brief note (e.g., 'Wrong screenshot') which deletes the record or updates it to 'rejected' status.

Bazar List: Show pending bazar entries. On "Approve":

Mark bazar_logs.verified as true.

Part 7: The "Prioritized Circular Queue" Duty Roster

Task: Logic for Bazar and Water assignments.

Algorithm:

Maintain a sorted list of members by joined_at.

Normal assignment: Day $X$ assigns User $N$.

Skip Logic: If User $N$ clicks "Skip":

Mark current record as is_skipped: true.

Assign today's duty to User $N+1$.

Penalty: For the next available date, the system must check for any is_skipped flags and assign that user before continuing the normal queue.

Part 8: Shopping (Bazar) Input

Task: Create the interface for the daily shopper.

The user assigned for "Bazar" today sees a "Log Bazar" form.

Fields: Total Amount Spent, Itemized List (text area).

On submission, record is sent to Manager for verification.

Part 9: Real-time Calculations (The Math)

Task: Implement the live "Meal Rate" calculator.

Total Member Meals: Count meals where status = 'eating' and is_guest = false.

Total Guest Meals: Count meals where is_guest = true.

Total Expense: Sum of verified bazar_logs.

Formula: Make the 'Fixed Rate' for guests a variable defined in a configuration file or the database so you can adjust it if inflation rises.

$$Meal Rate = \frac{Total Expense - (Total Guest Meals \times Fixed Rate)}{Total Member Meals}$$

Display "Estimated Current Meal Rate" on everyone's dashboard.

Part 10: Role Transfer Logic

Task: Implement "The Handover".

Manager selects a member from a dropdown.

Transaction: Update current manager to role: 'member' and selected user to role: 'manager'.

Ensure the new manager's UPI and QR are now the ones displayed to the group.

Part 11: PWA & UI Polish

Task: Make it mobile-friendly.

Configure next-pwa so users can "Install" the app on their home screens.

Use shadcn/ui "Cards" for the dashboard to make it look like a mobile app.

Add "Balance Low" alerts (e.g., if balance < ₹200).
