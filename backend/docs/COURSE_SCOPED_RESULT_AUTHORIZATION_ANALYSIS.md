# Consultant Course-Scoped Result Authorization Analysis

**Project:** IsDB-BISEW Online Examination Management System

**Baseline:** Existing Laravel 12.68.0 backend, Laravel Sanctum, 30 approved business tables, 92 API routes, and deny-by-default non-Super-Admin result access.

**Scope of this document:** Architecture and specification analysis only. No application code, migration, table, column, route, or database data was changed.

## 1. Current authorization flow analysis

Administrative result routes are inside the `/api/v1/admin` route group. That group uses `auth:sanctum` followed by `AdminMiddleware`. The middleware requires an authenticated `User`, allows the `SUPER_ADMIN` role to bypass permission checks, and otherwise derives a resource/action permission from the request path and HTTP method.

`ResultController` then applies a second result-specific guard. Super Admin users may list, view, and process results. Every non-Super-Admin result request is currently rejected with HTTP 403 because there is no approved course-scope relation. This is intentionally fail-closed and removes the previously verified result-IDOR behavior.

| Current path | Current control | Current behavior |
|---|---|---|
| `GET /api/v1/admin/results` | Sanctum → AdminMiddleware → `ResultController::index()` | Super Admin allowed; non-Super-Admin denied |
| `GET /api/v1/admin/results/{result}` | Sanctum → AdminMiddleware → `ResultController::show()` | Super Admin allowed; non-Super-Admin denied before result lookup |
| `POST /api/v1/admin/attempts/{attempt}/process-result` | Sanctum → AdminMiddleware → `ResultController::process()` | Super Admin allowed; non-Super-Admin denied before attempt processing |
| Future result endpoint | Not automatically covered by a course-scope relation today | Must use a shared authorization policy/service when approved |

The existing RBAC tables authorize capabilities such as `results.view` and `results.create`, but they do not identify which courses a particular user may access. A role permission answers **what** a user may do; it does not answer **which course records** the user may do it to.

## 2. Why the existing schema cannot safely represent Consultant course assignments

The current approved business schema contains `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, and `courses`. It does not contain a user-to-course assignment table, a course foreign key on `users`, or another approved relation that connects an individual administrator/consultant to one or more courses.

The existing academic relationships do not solve this problem. `batches`, `subjects`, `competency_units`, and `questions` point toward courses, but none of those records point back to an authorized administrator. `user_roles` only links users to roles, and `role_permissions` only links roles to capabilities. Assigning `results.view` to a Consultant would therefore authorize all result records equally and would recreate the IDOR risk.

A configuration list, hardcoded course IDs, token-only claim, or inferred scope from a role name would be an invented authorization mechanism. It would not represent an explicit, durable assignment and would not satisfy the requirement that Consultants access **only explicitly assigned courses**. The current deny-by-default behavior is therefore the only safe behavior under the locked schema.

## 3. Minimum recommended schema/authorization design

The minimum durable design is a dedicated many-to-many assignment relation between `users` and `courses`. It should be used for both non-Super-Admin roles that require course-scoped result access, including Admin and Consultant, unless the approved business rules explicitly state that one of those roles is globally scoped.

The authorization rule should be centralized in one reusable service or policy:

> Super Admin is globally authorized. A non-Super-Admin is authorized for a result only when the result’s exam resolves to a batch, the batch resolves to a course, and an active user-course assignment exists for the authenticated user and that course.

The same service must be called for result list, detail, processing, filter constraints, exports if later approved, and any future result-related endpoint. Authorization must be applied before returning records and before processing an attempt. List filters must be intersected with the user’s authorized course IDs rather than trusted from request parameters.

## 4. Exact proposed table, columns, and relationships

No table is proposed for immediate creation. The following is the minimum schema proposal for approval.

### Proposed table: `user_courses`

| Column | Proposed definition | Purpose |
|---|---|---|
| `id` | Big integer primary key | Assignment identity |
| `user_id` | Foreign key to `users.id`, required | Assigned Admin/Consultant |
| `course_id` | Foreign key to `courses.id`, required | Authorized course |
| `status` | String or approved enum, required; minimum values `ACTIVE` and `INACTIVE` | Revocation without deleting history |
| `assigned_at` | Date-time, required | Assignment effective time |
| `created_at` | Date-time | Laravel timestamp |
| `updated_at` | Date-time | Laravel timestamp |

Recommended constraints and indexes are a unique constraint on `(user_id, course_id)`, an index on `(user_id, status)`, an index on `(course_id, status)`, and foreign keys to `users` and `courses`. The application should use transactions for assignment changes and should not delete historical rows merely to revoke access. If assignment provenance is required by the business, an optional `assigned_by` foreign key to `users.id` may be approved as a separate audit enhancement, but it is not required for the minimum authorization design.

### Proposed Eloquent relationships

`User` would have `belongsToMany(Course::class, 'user_courses')->withPivot(['status', 'assigned_at'])`. `Course` would have the inverse `belongsToMany(User::class, 'user_courses')->withPivot(['status', 'assigned_at'])`. A shared `ResultAuthorizationService` would resolve `ExamResult → Exam → ExamSet → Batch → Course` and verify the active pivot row for the authenticated user.

## 5. Impact on existing tables

The recommended design leaves all existing 30 business tables unchanged. It adds only the approved assignment relation and its foreign-key/index metadata. Existing result, attempt, exam, batch, course, user, role, and permission rows do not need to be rewritten.

The existing `users`, `courses`, and result-related tables would be read through new relationships, not structurally modified. The existing Super Admin behavior would remain a global bypass. Existing `role_permissions` records would continue to express capability permissions, while `user_courses` would express record scope.

## 6. Impact on existing APIs

The preferred API contract is to keep the existing result routes and response shapes unchanged. The behavior would become:

| Caller | Authorized result behavior after approval |
|---|---|
| Super Admin | List, detail, and processing across all courses |
| Admin with active assignment | List, detail, and processing only for assigned courses, subject to `results.view`/processing permission |
| Consultant with active assignment | List, detail, and processing only for assigned courses, subject to the approved permissions |
| Non-assigned Admin/Consultant | HTTP 403 for detail/process; list returns only the permitted scope, which may be empty |
| Student | No administrative result access |

The `exam_id`, `student_id`, and any future course/batch filters must be applied in addition to, and never outside, the authorized course scope. Changing a result ID must not change the authorization outcome. A result outside the user’s scope should be denied consistently, preferably with the project’s established HTTP 403 authorization response rather than leaking whether the record exists.

A future administrative assignment API may be approved separately. It is not necessary to implement that API to establish the minimum relation, but assignments must be manageable by Super Admin and auditable if the operational requirements demand it.

## 7. Security implications

A dedicated active assignment relation provides an explicit authorization boundary and prevents a capability-only permission from becoming global data access. The key security properties are fail-closed behavior, authorization before record serialization, authorization before result processing, scope-aware filtering, and the same policy for every result endpoint.

Assignment changes should be audited, and inactive assignments should take effect immediately for new requests. Existing bearer tokens should not encode a permanent course list unless token revocation and reassignment semantics are explicitly designed; querying the active relation at request time is safer and reflects revocation promptly. The system should also avoid returning different error details that reveal the existence of an out-of-scope result.

## 8. Non-destructive migration strategy

Migration must occur only after explicit approval. The safe rollout sequence is additive:

1. Create a new migration for `user_courses` only. Do not alter or recreate any existing migration and do not run `migrate:fresh`.
2. Add the foreign keys, unique constraint, status/indexes, and timestamps. Deploy the additive migration through the normal forward migration process.
3. Deploy the shared authorization policy/service in a compatibility mode that preserves the current deny-by-default behavior for non-Super-Admins when no assignment exists.
4. Have Super Admin assign approved courses to Admin/Consultant users through an approved operational process.
5. Enable course-scoped result access and verify list, detail, processing, filters, IDOR regression tests, and revocation behavior.
6. Keep the existing 30 tables and historical rows intact. Do not backfill guessed assignments; there is no reliable source in the current schema from which to infer them.

Rollback should not be treated as permission to drop a populated assignment table in production. If approval is withdrawn, access can remain deny-by-default while the additive table is retained for controlled migration handling.

## 9. Alternative design if schema modification is not approved

The safe alternative is the current behavior: retain Super Admin global result access and deny all non-Super-Admin result list/detail/process access with HTTP 403. This prevents cross-course data exposure but does not satisfy the functional requirement for legitimate Admin/Consultant result access.

An external authorization service could be considered only if it is an explicitly approved system of record, has a durable user-course assignment API, is available on every request, and has defined failure-closed behavior. A local configuration file, environment variable, role-name convention, or token-only claim is not recommended because it is not a durable approved assignment relation and creates audit/revocation risks.

## 10. Recommendation

Approve **Option A: the dedicated `user_courses` assignment pivot** with the minimum columns listed above. Use the same active assignment rule for Admin and Consultant unless the business owner explicitly approves a broader Admin scope. Keep `role_permissions` for capability authorization and use `user_courses` for course-record scope. Implement the policy centrally and preserve the existing API paths and response shapes.

Do not approve any design that derives Consultant course scope from role permissions alone. Do not modify the current locked schema, create migrations, or change result authorization code until the proposed relation and Admin scope semantics are explicitly approved.

## Current decision state

The existing backend remains unchanged by this analysis. The result-access blocker is understood, the minimum safe design is identified, and the recommended option is ready for an approval decision.

# WAITING FOR APPROVAL

## References

1. [Course-scope architecture instructions](../../upload/pasted_content_4.txt)
2. [Current result authorization implementation](../app/Backend/Controllers.php)
3. [Current authorization middleware](../app/Backend/Middleware.php)
4. [Current locked business-schema migration](../database/migrations/2026_08_27_140000_create_isdb_schema.php)
5. [Current RBAC user model](../app/Models/User.php)
