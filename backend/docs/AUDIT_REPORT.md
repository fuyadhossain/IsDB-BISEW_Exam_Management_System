# IsDB-BISEW Backend Audit & Verification Report

**Audit basis:** Manus AI 1.6 master prompt, Backend Phases 1–10, and `pasted_content_2.txt`.

**Audit scope:** Existing Laravel backend only. No rebuild, destructive database command, schema modification, route deletion, or feature implementation was performed during this audit.

## 1. Executive Summary

The existing backend is a functioning Laravel 12.x prototype with a broad API surface and meaningful integration tests, but it is **not production-ready and should not be classified as READY**. The audit verified the local runtime, 30 business tables, 92 unique API routes, successful migrations, passing tests, private local storage, rate limits, and several important business controls. It also verified two critical security/authorization defects: unauthenticated protected API requests can return HTTP 500 rather than HTTP 401, and a non-super-admin with `results.view` can retrieve an arbitrary result detail without verified course assignment. These defects directly affect the required security and result-access rules.

The final classification is **NEEDS IMPORTANT FIXES**. The project is suitable as an auditable development baseline, but the critical issues should be fixed before frontend integration is treated as secure or before any production-like deployment.

| Area | Status | Basis |
|---|---|---|
| Laravel/runtime foundation | PASS | Laravel 12.68.0, PHP 8.3.6, Composer 2.7.1 verified |
| Business-table inventory | PASS | All 30 approved business tables present; infrastructure tables are separate |
| API boot and migrations | PASS | Routes load and all current migrations are marked Ran |
| Authentication/error handling | FAIL | Unauthenticated API request produced HTTP 500 and `Route [login] not defined` |
| RBAC | PARTIAL | Super Admin and admin middleware work; Consultant course assignment is not represented |
| Academic/batch management | PARTIAL | CRUD/filtering/capacity exist; some hierarchy and update validation is incomplete |
| Question Bank/CSV | PARTIAL | Core flows exist; import and manual validation are not fully unified or tested |
| Exam/distribution | PARTIAL | Lifecycle and deterministic distribution exist; persistence and comprehensive tests are incomplete |
| Student attempt | PARTIAL | Exact 25 generation, ownership, snapshots, expiry, and autosave exist; concurrency and expiry coverage are limited |
| Results | FAIL | Result detail does not enforce course assignment for non-super-admins |
| Violations/security | PARTIAL | Ownership, type validation, duplicate suppression, and rate limits exist; administrative filtering and tests are incomplete |
| Test suite | PARTIAL | 8 tests/21 assertions pass, but major workflows are not covered |

## 2. Environment Verification

The actual local environment was inspected rather than assumed. The project is running with Laravel Framework 12.68.0, PHP 8.3.6, and Composer 2.7.1. The active `.env` uses `APP_ENV=local`, `APP_DEBUG=true`, SQLite, and the local filesystem disk. Sanctum expiration is configured for 180 minutes, and CORS allows the local React origins on ports 3000 and 5173.

| Verification | Actual result |
|---|---|
| `php artisan --version` | Laravel Framework 12.68.0 |
| `php -v` | PHP 8.3.6 |
| `composer --version` | Composer 2.7.1 |
| `composer validate --no-check-publish` | Valid |
| `composer audit --no-interaction` | No security vulnerability advisories found |
| `php artisan migrate:status` | All five migration files Ran |
| `php artisan route:list --path=api/v1` | 92 routes |
| Local API URL | `http://127.0.0.1:8090` |
| APP_DEBUG=false API check | `http://127.0.0.1:8091` |
| `php artisan test` | 8 tests, 21 assertions passed |

The local API health endpoint returned the expected safe payload. The production-style `APP_DEBUG=false` check confirmed that the response envelope is used for unexpected errors, but it also confirmed that the unauthenticated protected-route status remains 500 rather than 401.

## 3. Database Schema Audit

The read-only SQLite inventory found **39 total tables**: the 30 requested business tables plus 9 framework/infrastructure tables. The 30 business tables are present: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `courses`, `tsps`, `rounds`, `batches`, `students`, `batch_students`, `subjects`, `modules`, `competency_units`, `elements`, `questions`, `question_options`, `question_imports`, `question_import_rows`, `exam_sets`, `exams`, `exam_subjects`, `exam_modules`, `exam_competency_units`, `student_exam_attempts`, `exam_attempt_questions`, `exam_answers`, `exam_results`, `exam_violations`, and `audit_logs`.

| Schema check | Finding | Status |
|---|---|---|
| Required business tables | All 30 present | PASS |
| Extra tables | `cache`, `cache_locks`, `failed_jobs`, `job_batches`, `jobs`, `migrations`, `password_reset_tokens`, `personal_access_tokens`, `sessions`; these are infrastructure tables | PASS |
| Obsolete `exam_questions` | Not present | PASS |
| Obsolete `exam_question_quotas` | Not present | PASS |
| Separate shift table | Not present; `shift` is a batch column | PASS |
| `batch_code`/capacity columns | Not present | PASS |
| Exam `component` column | Not present | PASS |
| Foreign keys | Academic and historical relationships use mostly `restrictOnDelete`; attempt children use controlled cascades | PARTIAL |
| Status enums | Stored as strings, with application validation rather than database enums | PARTIAL |
| Exact reference comparison | The supplied prompts do not enumerate every field for every table, so a complete locked-schema comparison cannot be proven from the text alone | NOT VERIFIED |

The actual columns include the required curriculum, question, exam, attempt, result, violation, and audit fields described by the phase documents. The implementation uses one consolidated business-schema migration rather than one migration file per table. That is not itself a table-count defect, but it makes incremental review and future migration history less granular.

A potential integrity concern is that `batch_students` has a unique constraint over `(batch_id, student_id, assigned_at)`, which permits multiple historical rows for the same student and batch at different timestamps. This is compatible with historical assignments but requires application logic to prevent more than one active assignment; the current create path does not explicitly reject an existing active assignment.

## 4. Phase-by-Phase Audit

| Phase | Required functionality | Implemented functionality | Missing/incorrect functionality | Status |
|---|---|---|---|---|
| Phase 1 | Foundation, API envelope, migrations, models, health, Sanctum/CORS, audit foundation | Foundation, 30-table migration, compact models, health, Sanctum, CORS, audit logger, tests | Exact schema cannot be fully compared from supplied text; models are not split into conventional files | PARTIAL |
| Phase 2 | Admin/student auth, RBAC, permission middleware, brute-force protection, eligibility foundation | Admin login/logout/me, student ID+DOB login, lock counters, roles/permissions, admin/student middleware | Consultant/course assignment absent; invalid User permissions relationship; protected unauthenticated response defect | PARTIAL |
| Phase 3 | Academic CRUD, filtering, pagination, dependent hierarchy, batch capacity, assignment history | Catalog CRUD, server filtering, pagination, relationship-derived competency course, transaction/row lock capacity | Generic update accepts all request fields; duplicate active assignment not explicitly rejected; full hierarchy tests missing | PARTIAL |
| Phase 4 | Question Bank CRUD/options, hierarchy authority, CSV import, duplicate detection, private storage | Manual create/update/list/detail, option ordering, element-derived hierarchy, private import tracking, duplicate checks | Import validation is separate from manual rules and weak; import row listing is not separately paginated; options are not fully validated on input | PARTIAL |
| Phase 5/6 | Exam sets/exams, lifecycle, curriculum configuration, exact 25 distribution, availability | Exam management, lifecycle service, hierarchy validation, deterministic computed 25 allocation, availability check | No persisted distribution because schema forbids quota storage; comprehensive lifecycle/distribution tests absent | PARTIAL |
| Phase 7 | Eligibility, one attempt, exact 25 generation, question order, snapshots, autosave, timer, submit | Batch eligibility, unique attempt constraint, transactional generation, random order, ordered options, snapshots, autosave, expiry enforcement, submit | Concurrency tests absent; expired attempts are not automatically marked by a scheduler; no student exam-list endpoint | PARTIAL |
| Phase 8 | Backend result evaluation, idempotency, admin access, course-scoped Consultant access, student privacy | Result calculation, exact set matching, one-result unique constraint, admin-only result routes, student result routes absent | Non-super-admin detail access is not course-scoped; result list is forced empty rather than implementing assigned-course access | FAIL |
| Phase 9 | Violations, validated client signals, duplicate suppression, rate limits, hardening | Ownership checks, approved types, active-attempt checks, duplicate window, throttles, privacy envelope | Admin filters are limited; violation audit logging and broad security tests absent | PARTIAL |
| Phase 10 | Full review, optimization, tests, documentation, deployment readiness | README/API docs, test suite, lint, migration/route checks, Composer audit | Full workflow coverage and production readiness review were not previously present | PARTIAL |

## 5. Question Bank Audit

Question Bank functionality exists once in the current source. Static inspection found one `QuestionController` and one `ImportService`; no duplicate controller/service class declarations were found. No obsolete exam-question tables or competing question-bank route groups were found.

Manual question creation derives `course_id`, `subject_id`, `module_id`, and `competency_unit_id` from the authoritative `element_id`, which satisfies the central hierarchy-integrity rule. Question listings are paginated and support the stated hierarchy filters and search fields. Student-facing delivery is not mounted as a standalone question route, while attempt payloads omit `is_correct`.

The implementation is only partial because option request fields are not fully validated, update operations do not support transactional replacement of options, question type/difficulty/status values are not consistently constrained to an approved enum set, and the current tests do not exercise manual question creation or option correctness. The current `QuestionController::store()` and `ImportService` do not share one validation service, contrary to the explicit audit requirement that manual and CSV flows use the same core rules.

## 6. CSV Import Audit

CSV files are stored through Laravel’s local private disk under a private import path. The import and row tables track file metadata, row data, success/failure/duplicate counts, question linkage, and errors. Duplicate detection checks existing question codes and normalized question text within an element. Valid rows can succeed while other rows fail, because each row is handled independently and the question/option creation is transactional.

The audit could not verify the workflow through an executed upload test. The implementation also does not validate the CSV header structure before processing, does not fully validate the number and correctness of options, and can create a question with an incomplete option configuration when imported values are malformed. These differences make the import rules less strict than the manual Question Bank path.

## 7. Exam Management Audit

Exam sets and exams have paginated management routes. Exam lifecycle transitions are centralized in `ExamService` and follow the declared sequence: `DRAFT → SCHEDULED → READY → STARTED → ENDED → PROCESSING → COMPLETED`, with controlled backward transitions from `SCHEDULED` to `DRAFT` and `READY` to `SCHEDULED`.

Curriculum configuration validates that subjects belong to the exam batch’s course, modules belong to selected subjects, and competency units belong to selected modules. Configuration writes are transactional and protected once the exam reaches `STARTED` or a later protected state.

The audit did not find duplicate exam-question tables or a component field. However, there are no automated tests for valid/invalid transitions, invalid curriculum combinations, duplicate selection prevention, or protected-state updates. The exam-set update/status behavior is also less strictly lifecycle-aware than exam configuration.

## 8. 25-Question Distribution Audit

The `DistributionService` computes a deterministic allocation by ordering selected competency units by ID, assigning an equal base allocation, and distributing the remainder to the first ordered units. The sum is always 25 when at least one competency unit is configured. Availability is checked per competency unit against active questions before `READY` and again before attempt generation.

The current design calculates distribution in `DistributionService::forExam()` whenever configuration, distribution, readiness, or attempt generation needs it. Later phases consume the same deterministic calculation rather than a stored quota record. This is compatible with the explicit prohibition on `exam_question_quotas` and the absence of an approved quantity column, but it means the distribution is not an immutable database snapshot. If the active question pool changes between configuration and attempt start, the computed availability can change.

| Distribution requirement | Audit result |
|---|---|
| Exact total 25 | Implemented in service logic; tested indirectly by the attempt test |
| Even allocation | Algorithm supports base allocation |
| Uneven allocation/remainder | Algorithm distributes remainder deterministically |
| Subject/module/CU hierarchy | Computed at competency-unit level, with module and subject context returned |
| Question shortage | Validation error is raised; no silent reduction |
| Persistence | Not persisted; deliberate locked-schema limitation |
| Automated distribution tests | Not present | 

## 9. Student Exam Audit

Student authentication is separate from administration and uses Student ID plus date of birth. The student login response is minimal and the current feature test confirms that date of birth is not exposed. Start/resume checks active batch assignment, exam status and time window, and the one-attempt database uniqueness constraint prevents a second attempt for the same student/exam combination.

Attempt generation uses transactions, chooses exactly 25 questions when availability permits, shuffles only the main question order, keeps option order, stores a question snapshot, and returns student-safe options without `is_correct`. Answers are ownership-checked through the student’s attempt, saved idempotently by the attempt-question key, and rejected after submission or server-side expiry.

The phase is partial because the concurrency behavior is not tested under parallel requests, no scheduler-based expiry path is present, automatic expired-state persistence is not implemented, and there is no student endpoint listing all currently eligible exams. The current result evaluator uses the snapshot for marks and correct keys, which is a positive historical-integrity control.

## 10. Result Audit

Result processing evaluates submitted or expired attempts, compares selected option sets exactly against the snapshot’s correct option set, calculates correct/wrong/unanswered counts, marks, percentage, and pass/fail, and relies on a unique attempt ID to prevent duplicate result rows. Students have no mounted result route, satisfying the requirement not to expose result data to students.

The result access-control requirement is not satisfied. `ResultController::authorized()` grants a non-super-admin access when that user has `results.view`, but it does not resolve and verify the result’s batch course against an assigned-course relation. The list path instead applies `whereIn('course_id', [])` for all non-super-admins, which prevents legitimate Consultant results rather than implementing the required course-scoped access. The detail path remains the more serious issue because changing a result ID can expose another course’s result to any user with the broad permission.

## 11. Violation/Security Audit

Student violation reporting verifies the authenticated student owns the attempt, requires the attempt to be active and not expired, restricts event types to `FOCUS_LOSS`, `TAB_SWITCH`, `FULLSCREEN_EXIT`, and `PAGE_EXIT`, and suppresses identical events within the configured duplicate window. Rate limits are applied to login, start, answer autosave, and violation-reporting endpoints. Student question payloads omit answer keys, and CSV files are stored privately.

The audit did not verify an executed valid/invalid violation workflow through the local API. Administrative violation filters currently cover type and attempt ID but not the broader course, TSP, round, batch, exam, student, and time-range filters described by the specification. Violation reporting is not sent through the centralized audit logger. Metadata is accepted as an arbitrary array without a documented size or field allow-list.

The unauthenticated protected-route error is a critical security/error-handling defect. With `APP_DEBUG=true`, the local API returned a stack trace, exception class, and server file path. With `APP_DEBUG=false`, it returned a safe envelope but retained HTTP 500 instead of HTTP 401. The root behavior is the missing `login` route used by the authentication middleware’s guest redirect path.

## 12. API Route Audit

The current route inventory has 92 unique method/URI pairs and no duplicate method/URI keys. The routes are organized under `/api/v1` and are separated into public health/login, admin, and student groups.

| Category | Count | Assessment |
|---|---:|---|
| Authentication | 3 | Admin login, logout, me |
| Student | 8 | Student login, logout, me, start, attempt, answers, submit, violations |
| Academic/Batch | 47 | Shared catalog CRUD and batch assignment routes |
| Question Bank/Import | 7 | Questions and import history/upload routes |
| Exam | 11 | Exam sets, exams, configuration, distribution, transitions |
| RBAC | 9 | Users, roles, permissions, assignments |
| Result | 2 | Result list/detail; processing is grouped under attempts |
| Violation | 2 | Admin list/detail |
| Health | 1 | Liveness |
| Other | 2 | Route categorization remainder |

Admin routes use `auth:sanctum` plus `AdminMiddleware`; student routes use `auth:sanctum` plus `StudentMiddleware`; login and sensitive student actions use throttle middleware. The route design is functional but the shared dynamic catalog closures and path-parsing permission inference are fragile. The audit found no duplicate routes. Missing or incomplete purpose-specific routes include a separate paginated import-row endpoint, a student eligible-exam list, and comprehensive admin violation filters.

## 13. RBAC Audit

Custom roles, permissions, `user_roles`, and `role_permissions` are present and seeded with a `SUPER_ADMIN` role. The admin middleware rejects authenticated users without an admin role, and the current feature test verifies this behavior. The Super Admin bypass is functional.

The model-level `User::permissions()` method is invalid: a read-only probe throws `LogicException` because the method returns a query builder rather than an Eloquent relationship instance. The current `/auth/me` path avoids this method by traversing roles manually, but future code that accesses `$user->permissions` can fail.

Consultant authorization is not implemented to the required course scope. The locked schema has no user-course assignment table or approved user column that can represent assigned courses. No schema change was made during this audit, as prohibited by the audit instructions. This is both a specification limitation and the cause of the result-access failure described above.

## 14. Test Suite Audit

There are four test files and eight tests, all currently passing with 21 assertions. The tests are meaningful but narrow.

| Test file/functionality | Coverage |
|---|---|
| `BackendSmokeTest` | Health response and validation envelope |
| `BackendWorkflowTest` | Unauthorized admin access, batch capacity, student login privacy, exact 25-question attempt, correct-answer suppression |
| `ExampleTest` feature/unit | Laravel scaffold smoke coverage |
| Missing coverage | CSV import, option validation, lifecycle, distribution remainder, result processing, result access, violations, rate limits, authenticated 404s, concurrency, Consultant scoping |

The audit therefore classifies the test suite as **PARTIAL**. `php artisan test` was actually executed during this audit and passed; passing tests must not be interpreted as complete business verification.

## 15. Code Quality Audit

The implementation is compact but not idiomatic Laravel for a maintainable production codebase. Controllers, services, and models are concentrated in `app/Backend/Controllers.php`, `app/Backend/Services.php`, and `app/Backend/Models.php`. The longest controller line exceeds 4,000 characters and the longest service line exceeds 3,000 characters. There are no Form Request, Policy, or API Resource classes.

The service layer does contain meaningful centralization for audit logging, hierarchy derivation, distribution, exam lifecycle, imports, attempts, and results. Transactions and row locks are present in important flows. Source review found no `dd()`, `dump()`, wildcard PHP imports, duplicate class declarations, obsolete exam-question tables, or production credentials in source.

The most important quality defect is `CatalogController::update()` using `$r->all()` with `$guarded=[]` models. Although the route is authenticated, this allows arbitrary attributes from the request to reach the model update path. The implementation should use resource-specific validated allow-lists or Form Requests.

## 16. Specification Conflicts

The phase specifications contain two material overlaps. First, an earlier phase describes administrator-controlled quantities while the later Phase 6 instruction says administrators only select curriculum nodes and the backend computes the fixed distribution. The later instruction is the controlling requirement under the master prompt’s priority rule. The current implementation follows the later automatic interpretation.

Second, the result requirement needs Admin/Consultant course assignment, but the locked business-table list contains no user-course assignment relation. The current implementation does not invent a table or column. It therefore supports unrestricted Super Admin result access and cannot safely implement legitimate Consultant course-scoped access. This conflict requires an approved schema or authorization design decision before that requirement can be fully satisfied.

The Phase 3 audit prompt also describes a longer academic chain containing Chapter and Topic, while the locked schema explicitly states that there are no Chapter or Topic tables and that Elements are the lowest curriculum level before Questions. The current implementation follows the locked schema and does not create Chapter or Topic tables.

## 17. Critical Issues

| Priority | Issue | Impact |
|---|---|---|
| Critical | Unauthenticated protected API requests return HTTP 500; local debug response leaks `Route [login] not defined`, file path, and trace | Breaks required 401 behavior and can leak internals |
| Critical | Non-super-admin result detail lacks course-assignment verification | IDOR risk: result ID changes can expose another course’s result |
| Critical | `User::permissions()` is not a valid relationship | Future authorization/serialization code can fail at runtime |
| High | Generic catalog updates use `$r->all()` with `$guarded=[]` models | Unsafe mass-assignment surface and weak input integrity |
| High | Consultant course access cannot be represented with the locked schema | Required result access rule cannot be implemented correctly |
| High | Manual Question Bank and CSV import do not share one validation core | Different paths can accept inconsistent question/option data |

## 18. Non-Critical Issues

The compact shared-file layout makes code review and maintenance difficult. Many lists and administrative flows lack dedicated API Resources, Form Requests, and Policies. The result list for non-super-admins returns no rows instead of a meaningful assigned-course result set. Violation administration lacks the full requested filter set. Expiry is enforced at request time but does not automatically persist an expired status without a scheduled process. The test suite does not cover several critical business flows. The consolidated migration is harder to evolve incrementally than separate migration units.

## 19. Recommended Fixes

The first fix should configure API authentication failures to return an explicit HTTP 401 JSON response without attempting to redirect to a missing `login` route, and should ensure the production exception path never returns HTTP 500 for an authentication failure. The second fix should introduce an approved, non-destructive course-assignment authorization mechanism or obtain explicit requirement approval for an alternative, then enforce that scope in result list, detail, process, and every filter path.

Next, replace the invalid `User::permissions()` implementation with a real relationship or a clearly named permission-resolution method, and replace dynamic `$r->all()` updates with validated resource-specific fields. Extract Form Requests, Policies, API Resources, and service-level question validation so manual and CSV creation share identical rules. Add tests for protected-route status codes, Consultant/Super Admin result access, question/CSV integrity, lifecycle transitions, distribution remainders, result idempotency, violation ownership, and concurrency-sensitive attempt creation.

These recommendations do not authorize schema changes. Any schema-level solution for Consultant course assignments or persisted distribution must be proposed and approved before migration changes are made.

## 20. Final Readiness Status

# NEEDS IMPORTANT FIXES

The backend is **not READY**. It has a usable Laravel foundation and meaningful implemented workflows, but the confirmed authentication error defect, result IDOR risk, invalid permissions relationship, and incomplete Consultant authorization are important enough to block a READY classification. No code or schema fixes were applied during this audit, in accordance with the supplied instruction to report findings first.

## References

1. [Full Backend Audit & Verification Instructions](../../upload/pasted_content_2.txt)
2. [Current API route definitions](../routes/api.php)
3. [Current business-schema migration](../database/migrations/2026_08_27_140000_create_isdb_schema.php)
4. [Current backend workflow tests](../tests/Feature/BackendWorkflowTest.php)
5. [Current controllers and API authorization paths](../app/Backend/Controllers.php)
6. [Current services and business-rule implementation](../app/Backend/Services.php)
