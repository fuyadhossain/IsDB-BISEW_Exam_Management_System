# IsDB-BISEW Backend — Manus AI 1.6 Implementation

This repository is a self-contained Laravel 12.x REST API backend for the IsDB-BISEW Online Examination Management System. It implements the requested Phase 1–10 scope with versioned APIs under `/api/v1`, Laravel Sanctum tokens, custom RBAC, the locked business-table set, academic hierarchy validation, private CSV imports, automatic deterministic 25-question distribution, student attempts, answer autosave, result processing, violation reporting, audit logging, and pagination.

## Local setup

Use PHP 8.2+, Composer, and SQLite for the included local smoke-test configuration or MySQL for deployment. Run `composer install`, copy `.env.example` to `.env`, set `APP_KEY`, configure `DB_*`, then run `php artisan migrate --seed`. The seed creates `admin@example.test` with password `ChangeMe!123`; change it immediately outside local testing.

Run `php artisan route:list --path=api/v1`, `php artisan test`, and `php artisan storage:link` only if public assets are separately required. Question CSV files are stored on the private disk and are never exposed as public URLs.

## CSV template

The import endpoint accepts headers `element_id,question_code,question_text,question_type,difficulty,marks,options,correct_options`. The `options` field uses `A:First option|B:Second option|C:Third option`; `correct_options` uses `A` or `A|C`. The service derives course, subject, module, and competency-unit IDs from `element_id`.

## Important design decisions

Phase 6 is the later approved interpretation of question distribution: administrators select curriculum nodes and the backend computes exactly 25 allocations deterministically. Because the locked table list does not define a quantity column and explicitly forbids `exam_question_quotas`, distribution is computed from the selected competency units and exposed through configuration/distribution APIs rather than persisted in a new schema object.

Result access is administrative only. Student question APIs omit `is_correct`; result APIs are not mounted in the student route group. Attempt creation uses a database uniqueness constraint on `(student_id, exam_id)`, transactions, persisted question order, question snapshots, fixed option order, server-side expiry, and ownership checks.

## API groups

| Group | Purpose |
|---|---|
| `/api/v1/health` | Safe health check |
| `/api/v1/auth/*` | Admin authentication |
| `/api/v1/student/*` | Student ID + date-of-birth authentication and exam workflow |
| `/api/v1/admin/*` | Admin-managed academic, question, exam, result, and violation APIs |

All list endpoints are paginated. All protected routes use Sanctum; administrative authorization is enforced by the `admin` middleware and can be tightened per route with `permission:<name>`.
