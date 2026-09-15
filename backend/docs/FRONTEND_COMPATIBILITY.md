# Frontend compatibility handoff

This backend package keeps the React frontend source unchanged. The canonical Laravel API remains available under `/api/v1`. Additional compatibility routes are mounted under `/api` so the existing frontend handoff can call the backend without changing frontend files.

| Frontend-facing route | Backend behavior |
| --- | --- |
| `GET /api/admin/results` | Returns authorized result records in the frontend field names and accepts `course`, `batch`, `exam_number`, and `outcome` filters. |
| `GET /api/admin/results/filter-options` | Returns authorized course, batch, exam-number, and outcome options. |
| `POST /api/admin/imports/questions` | Delegates to the transactional private question CSV importer. |
| `POST /api/student/exam/login` | Authenticates Student ID and date of birth, returns the student token plus availability, schedule, exam, and timing fields. |
| `GET /api/student/attempts/{attempt}` | Returns the persisted attempt snapshot. |
| `PUT /api/student/attempts/{attempt}/answers/{question}` | Adapts the frontend question ID request to the persisted `exam_attempt_question_id` answer service. |
| `POST /api/student/attempts/{attempt}/submit` | Finalizes the owned attempt. |
| `POST /api/student/attempts/{attempt}/violations` | Records a validated student violation. |
| `POST /api/admin/exams/{exam}/start` and `/stop` | Adapt to the backend transition service with `STARTED` and `ENDED` states. |

## SQL status

The uploaded `isdb_bisew(1).sql` schema matches the backend’s Laravel model and migration naming for the application tables, including `students`, `questions`, `exams`, `student_exam_attempts`, `exam_attempt_questions`, `exam_answers`, `exam_results`, `question_imports`, and `question_import_rows`. No SQL change was required for the compatibility layer, so no altered schema file is included. Use the supplied SQL dump as the database import source, or use the Laravel migrations for a clean environment.

## Local verification

From the backend directory, install PHP 8.2+, Composer, and the required PHP extensions. Copy `.env.example` to `.env`, configure MySQL or SQLite, set `APP_KEY`, and run `composer install`. For a clean local SQLite environment, create `database/database.sqlite`, then run `php artisan migrate:fresh --seed --force`. Start the API with `php artisan serve --host=0.0.0.0 --port=8000`.

The frontend’s API base should point to `http://localhost:8000/api` when its live API configuration is enabled. The backend allows `http://localhost:3000` and `http://localhost:5173` by default through `CORS_ALLOWED_ORIGINS`; update that environment value for the actual frontend host.

The backend verification suite passes with 31 tests and 136 assertions. The tests include the existing 25-question Mid Monthly online attempt rule and the new compatibility route guard checks.
