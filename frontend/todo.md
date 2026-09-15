# Current follow-up work

- [x] Replace the one-question-at-a-time student exam view with a single scrollable page containing all questions.
- [x] Preserve per-question autosave feedback, navigator status, timer, submission confirmation, and no-result student completion state.
- [x] Verify desktop and mobile behavior after the all-questions layout change.
- [x] Stabilize the active question navigator state so it reflects the question currently being read without flickering during scroll.
- [x] Add a visible red pointer security boundary and controlled exam logout on crossing it.
- [x] Persist unanswered and selected responses locally so an interrupted exam can resume safely.
- [x] Send the final attempt payload through the Laravel-ready service and clear recovered local data only after success.
- [x] Reduce the visual thickness of the red examination security boundary and align the detection threshold with the visible zone.
- [x] Keep the examination timer running after a security restriction and end it only on a successful final submission.
- [x] Generate a concise jsPDF result document containing only student ID, student name, marks, and status.
- [x] Add a manual question-entry option alongside CSV import in the question-bank workflow.
- [x] Replace the result PDF cards with one table and require explicit confirmation before downloading it.
- [x] Add a batch selector that filters the result list and confirmed result PDF download.
- [x] Repair the managed-preview Vite WebSocket connection used for hot reload.
- [x] Make the student login page the default public entry point and remove visible admin-login links.
- [x] Add a gated admin-access code step before the administrative email-and-password login page.
- [x] Remove the admin access-code gate and route `/admin` directly to admin login.
- [x] Convert client TypeScript and TSX source files to JavaScript and JSX.
- [x] Add a Laravel API Base URL configuration option and write run/deployment documentation.
- [x] Convert remaining server, shared, and Vite TypeScript sources to JavaScript and remove obsolete TypeScript configuration.
- [x] Pre-fill the administrator demonstration email and password on the direct login page.
- [x] Add reusable CSV template/demo downloads and bulk-upload actions to all administrative data-entry modules.
- [x] Provide file preview, validation feedback, and Laravel-ready import payloads for each CSV data type.
- [x] Remove CSV import controls from all non-student administrative modules.
- [x] Retain and verify the template, demo download/upload, preview, and Laravel-ready bulk import flow only for Students.
- [x] Audit and align npm development scripts with the Vite entry point.
- [x] Convert any remaining applicable React source files to JSX and verify Vite startup and production build.
- [x] Confirm a clean `npm install` and `npm run dev` workflow for Vite.
- [ ] Provide remediation steps for a local copy that still includes the incompatible Vite plugin.
- [x] Restore CSV template, preview, validation, and import controls in Questions management.
- [x] Add scheduled exam availability, late-entry duration calculation, and administrative early-stop controls.
- [x] Add student waiting, reduced-duration, closed-window, and administrator-stop states.
- [ ] Replace static administrative mock reads with a shared persistent frontend record store.
- [ ] Make create and edit actions immediately update dependent curriculum, question, and exam controls.
- [x] Validate every CSV header and row before import, with no partial import on an invalid file.
- [x] Display specific row and column errors so administrators can correct and re-upload the file.
- [x] Require course and batch selection before rendering examination results.
- [x] Filter displayed results strictly by the selected course and batch.
- [x] Require an exam-number selection after course and batch before displaying result records.
- [x] Retire the exam-date filter from the later simplified results workflow.
- [x] Include only the selected course, batch, and exam number in result PDF filenames.
- [x] Retrieve results from the configured Laravel API using the selected filters, with local fallback in mock mode.
- [x] Review the current project for professional-grade improvements without changing application code.
- [x] Show verified student details before the examination requirements and start action.
- [x] Review the uploaded SQL schema against the React examination workflows.
- [x] Prepare a separate updated SQL schema for missing records, constraints, and examination controls.
- [x] Add a copyable Laravel API environment template for future React integration.
- [x] Replace the MariaDB-targeted database upgrade with a MySQL 8.0-compatible schema upgrade.
- [x] Verify the Question Bank CSV import action in the current project and identify any local-version mismatch.
- [x] Identify the active project logo reference and replacement location.
- [x] Compare the uploaded local archive with the current Question Bank CSV import implementation.
- [x] Add a Super Admin role that creates administrator accounts and assigns course scopes.
- [x] Restrict course-scoped administrator access to assigned courses across students, questions, exams, and results.
- [x] Add MySQL and Laravel support for authoritative server-side course-scope enforcement.
- [x] Add role-specific demonstration accounts for Super Admin and course-scoped access testing.
- [x] Verify each demo account sees only the intended course scope.
- [x] Provide the current MySQL 8.0 upgrade as a separate downloadable SQL file.
- [x] Restrict administrator password changes to self-service and username/email changes to Super Admin approval.
- [x] Keep three Super Admin accounts available in data while showing only the active Super Admin interface identity.
- [x] Add the institutional logo and persistent “Made By IsDB-BISEW Batch -71” page watermark.
- [x] Revise course, TSP, round, subject, module, competency-unit, and element management fields and dependent dropdowns.
- [x] Rework exam sets, dynamic exam creation, availability, taken-number validation, and manual start/stop controls.
- [x] Support online dynamic exams and offline printable papers with fixed question rules.
- [x] Simplify Results filters and make dashboard widgets navigate to their related workspaces.
- [x] Update MySQL and Laravel documentation for roles, lifecycle transitions, and offline paper generation.
- [x] Keep all requested workflows functional in demonstration mode through Laravel-ready service contracts.
- [x] Allow an administrative subject record to be assigned to multiple courses.
- [x] Define a shared frontend scheduling model for availability, late-entry duration, and administrative closure.

## Requirements re-audit

- [x] Verify each account, role, and hidden-Super-Admin requirement in the live demonstration flow.
- [x] Verify all requested academic-management dropdowns, removed fields, and course-scoped dependent data behavior.
- [x] Verify exam-set editing, review-before-create, taken-number validation, lifecycle, and online/offline student visibility.
- [x] Verify the simplified results interface, logo, watermark, dashboard links, MySQL upgrade, and Laravel handoff stay aligned.

## Rendering fixes

- [x] Remove the duplicate or missing React key from the `/admin/exams` DataTable rows and verify the warning no longer occurs.

## Navigation adjustments

- [x] Place CSV Import Question between Question Bank and Exam Sets in the sidebar and connect it to a dedicated import route.

## Scheduling correction

- [x] Make created exam start and stop at the selected time with second-level demo countdown and automatic lifecycle refresh.

## Live timing and timeout safeguards

- [x] Show an exact live countdown until the exam starts on the student dashboard.
- [x] Automatically submit and persist current student answers when the exam reaches its end time.
- [x] Add a live Time Remaining column to the admin exam list for running exams.

## Student timer presentation

- [x] Keep the student countdown timer sticky at the top while scrolling through the question paper.
- [x] Show a clear success confirmation after automatic timeout submission completes.

## Student running-exam access correction

- [x] Ensure a Running online exam visible in the admin panel is selected for the matching student batch and is not reported as finished by the student portal.

## Runtime fixes

- [x] Fix `examSets.find is not a function` during student login and verify the exam store initializes safely.

## Student entry correction

- [x] Make eligible STU-1001 access the Running online exam for the student’s batch and preserve the access grant for the exam page.

## Student confirmation interaction

- [x] Make the student-details acknowledgement checkbox respond visibly and allow Start examination to open the granted online attempt.

## Student entry follow-up

- [x] Diagnose the remaining confirmation/start issue from the live student flow and make the exam-entry action work reliably.

## Pasted source bug fixes

- [x] Apply the five fixes from pasted_content_2.txt: timeout auto-submit, mount-time fullscreen enforcement, controlled multi-step exam form state, explicit step validation, and functional pagination.

## Monthly offline print

- [x] Add an admin-only Print Questions action for created Monthly exams that outputs only the fixed MCQ and descriptive questions.

## Monthly print visibility follow-up

- [x] Ensure every eligible created Monthly exam visibly shows an admin-only Print Questions button, while preserving the exact 23 MCQ + 2 descriptive output.

## Multi-row question distribution

- [x] Allow multiple subject/module/competency-unit/element distribution rows with independent cascading selections and persisted review output.


## Current copy request

- [ ] Inspect the existing Mid exam question-count logic and identify all affected validation, distribution, and display paths.
- [ ] Update Mid online exams to require and support 25 questions.
- [ ] Inspect Question Bank and CSV Import navigation active-state logic.
- [ ] Ensure exactly one of Question Bank or CSV Import is highlighted and active based on the current route.
- [ ] Review whether existing localStorage demo data needs a safe migration for the revised Mid exam rule.
- [ ] Confirm the change does not alter Monthly offline exam rules or other exam types.
- [ ] Run checks and verify the affected flows in the browser.
- [ ] Save the completed project checkpoint and report the changes.
