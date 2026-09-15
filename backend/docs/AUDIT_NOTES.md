# Audit notes (working)

## Verified environment

- Laravel Framework 12.68.0.
- PHP 8.3.6.
- Composer 2.7.1.
- `php artisan migrate:status`: all five migration files ran.
- Local SQLite inventory: 39 tables total, comprising 30 business tables and 9 framework/infrastructure tables.
- `php artisan route:list --path=api/v1`: 92 routes.
- Current test suite: 4 test files, 8 tests, 21 assertions, passing before this audit.

## Verified issue

Unauthenticated requests to protected API routes such as `GET /api/v1/admin/questions` and `POST /api/v1/admin/exams/999/transition` return HTTP 500 with `Route [login] not defined.` instead of the required standardized HTTP 401 JSON response. The response exposes exception details and stack trace while the local environment has debug enabled. This is a confirmed critical API error-handling/security defect. No fix has been applied because the supplied audit instruction requires findings to be reported before deciding on fixes.

## Verified positive findings

- No obsolete `exam_questions` or `exam_question_quotas` structures were found.
- No separate `shifts` table, `batch_code`, `capacity`, or `component` schema elements were found.
- Question Bank symbols resolve to one controller and one import service; no duplicate class declarations were found.
- Student login response is minimal in the existing feature test and does not expose date of birth.
- Attempt feature test confirms 25 questions and omits `is_correct` from delivered options.
- Batch capacity feature test confirms the fifteenth active-student limit.

## Additional verified issue

Under `APP_DEBUG=false`, unauthenticated `GET /api/v1/admin/questions` returns the standardized JSON envelope but still uses HTTP 500 instead of HTTP 401. Under local debug mode it returns a 500 response with `Route [login] not defined`, an exception class, file path, and trace. An authenticated request for a missing exam returns HTTP 404 with the standard envelope and no trace in the observed response.

## Coverage and quality findings

The project has four test files and eight tests. Meaningful integration coverage exists for health, validation shape, unauthorized admin access, batch capacity, student login privacy, and exact 25-question generation. There are no automated tests for CSV imports, question-option validation, exam lifecycle transitions, distribution remainder behavior, result calculation/idempotency, violation reporting, rate limits, authenticated 404 behavior, or Consultant course scoping.

The main application logic is concentrated in three large shared files. The longest controller line is over 4,000 characters and the longest service line is over 3,000 characters. No Form Request, Policy, or API Resource classes are present. Static review found no debug statements, wildcard imports, duplicate class declarations, obsolete exam-question tables, or exposed production credentials.

## Additional verified issue

A read-only Eloquent probe of `User::permissions` throws `LogicException: App\\Models\\User::permissions must return a relationship instance.` The method returns a query builder rather than an Eloquent relationship. The current `/auth/me` endpoint avoids this property and manually traverses roles, but the model contract itself is invalid and can break future authorization code or serialization.

## Additional code-quality findings

`CatalogController::update()` uses `$r->all()` rather than a validated allow-list, so arbitrary model attributes can be passed into updates. All models in the compact implementation use `protected $guarded=[]`, increasing the impact of that controller pattern. Several controller actions use generic `$r->validate()` inline rather than Form Requests, and no Policy or API Resource classes exist.

## Route and environment evidence

The route inventory contains 92 unique method/URI pairs with no duplicate keys. Category counts are: Academic/Batch 47, Authentication 3, Exam 11, Health 1, Other 2, Question Bank/Import 7, RBAC 9, Result 2, Student 8, and Violation 2. Protected admin routes use Sanctum plus `AdminMiddleware`; protected student routes use Sanctum plus `StudentMiddleware`; login endpoints use throttle middleware.

The active local environment is APP_ENV=local, APP_DEBUG=true, DB_CONNECTION=sqlite, FILESYSTEM_DISK=local, with Sanctum expiration configured to 180 minutes and local CORS origins configured for ports 3000 and 5173. The API was exercised at `http://127.0.0.1:8090`; a production-style instance with APP_DEBUG=false was exercised at `http://127.0.0.1:8091`. Composer audit reported no known dependency advisories.
