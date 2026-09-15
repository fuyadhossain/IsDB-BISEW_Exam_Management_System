# Laravel API Handoff

The React client already reads `VITE_API_BASE_URL` and `VITE_USE_MOCK_API`. Copy `docs/react-laravel-api.env.template` to `.env.local`, set the Laravel API URL, and set `VITE_USE_MOCK_API=false` only after the backend endpoints below are protected and tested. For a new database, import the canonical root dump `../../database/isdb_bisew.sql`, then run `php artisan migrate --force`. Do not apply the deprecated frontend SQL notice as a schema upgrade.

| Frontend workflow | Required Laravel route | Notes |
|---|---|---|
| Results list | `GET /api/admin/results` | Accept `course`, `batch`, `exam_number`, and optional outcome query parameters. Return an array or `{ "data": [] }`. |
| Result filter values | `GET /api/admin/results/filter-options` | Return only the permitted course, batch, exam-number, and outcome options for the signed-in administrator. |
| Academic dropdown data | `GET /api/admin/curriculum/options?course={id}&subject={id}&module={id}&competency_unit={id}` | Return only authorized, cascading course → subject → module → competency unit → element values; TSP payloads include `location`. |
| Student access | `POST /api/student/exam/login` | Verify Student ID and date of birth; return student profile, exam availability, server-calculated `expires_at`, and attempt token. |
| Start and save an attempt | `POST /api/student/attempts`, `PUT /api/student/attempts/{attempt}/answers` | Check server time, early-stop status, attempt expiry, eligibility, and ownership on every request. |
| Exam sets | Resource routes under `POST`, `GET`, and `PUT /api/admin/exam-sets` | Require one course. Accept one batch or `all_batches=true`; derive delivery: `MID_MONTHLY` becomes `ONLINE_DYNAMIC`; `MONTHLY` becomes `OFFLINE_PRINTABLE`. |
| Create or edit exam | Resource routes under `/api/admin/exams` | Accept `exam_set_id`, selected available number, timing, lifecycle status, and curriculum distribution only. Derive course, batch coverage, title, delivery mode, and fixed `max_marks=50` from server-side rules. |
| Exam lifecycle | `POST /api/admin/exams/{exam}/start`, `POST /api/admin/exams/{exam}/stop` | Permit manual start only for `READY` and manual stop only for `STARTED`. Laravel scheduler must start and complete exams by the server clock. |
| Offline paper | `POST /api/admin/exams/{exam}/offline-paper`, `GET /api/admin/exams/{exam}/offline-paper/print` | Admin-only. Create one fixed 23 MCQ + 2 descriptive snapshot without shuffle; never expose it through the student portal. |
| CSV import | `POST /api/admin/imports/students`, `POST /api/admin/imports/questions` | Validate all rows first and use one transaction. If any row fails, return errors and save no student/question records. |
| Super Admin users | `GET`, `POST`, `PUT /api/super-admin/users` | Permit only the `SUPER_ADMIN` role. Create administrators, assign their role, and write their course IDs to `user_course_scopes`. |
| Account identity and password | `PATCH /api/admin/account/password`, `PATCH /api/super-admin/users/{user}` | The signed-in user may update only their own password after current-password verification. A Super Admin exclusively changes an administrator's name, username, email, role, status, or course scope. |
| Administration | Resource routes under `/api/admin` | Apply Laravel authentication, rate limits, policies, audit logging, and course-scope query restrictions on every action. |

> The browser must never hold database credentials or decide permissions, examination timing, early closure, score calculation, import success, or course visibility. Those decisions belong to Laravel and MySQL.

## Course-scope policy

A user with the existing `SUPER_ADMIN` role has full access and is the only role allowed to create administrators or change `user_course_scopes`. Every other administrator is restricted to the courses assigned in `user_course_scopes`. Laravel must apply this restriction server-side to every list, detail, create, update, import, export, and result request. A URL or request body containing another course ID must return `403 Forbidden` rather than exposing or changing the record.

Laravel should keep three active Super Admin accounts through secure provisioning or a protected seeder. The demonstration interface hides two reserved Super Admin records from the visible User list, but this is only a presentation convention; production authentication and authorization must never depend on a hidden flag.

## Exam lifecycle policy

The application must treat `DRAFT`, `SCHEDULED`, `READY`, `STARTED`, `ENDED`, `PROCESSING`, and `COMPLETED` as server-owned states. An administrator may manually start only a `READY` exam and manually stop only a `STARTED` exam. A Laravel scheduled command must start an eligible exam at `start_at` and complete it at `end_at`, even if no browser is open. An online mid-monthly exam creates a per-attempt dynamic question snapshot only for an eligible student while the exam is running. An offline monthly exam generates a print-only, unshuffled fixed paper with exactly 23 MCQ and 2 descriptive questions; Laravel must reject paper generation if the filtered Question Bank cannot supply all 25 records.
