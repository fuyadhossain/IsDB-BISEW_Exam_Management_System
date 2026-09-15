# API contract

All responses use `{ "success": boolean, "message": string, "data": any }`. Validation failures return HTTP 422 with `data.errors`. Admin authentication uses `POST /api/v1/auth/login` with `email,password`, then `Authorization: Bearer <token>`. Student authentication uses `POST /api/v1/student/login` with `student_id,date_of_birth` in `YYYY-MM-DD` format.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/health` | None | Liveness |
| GET/POST | `/api/v1/admin/courses` | Admin | Paginated course list/create |
| GET/POST/PUT | `/api/v1/admin/questions` | Admin | Question bank CRUD |
| POST | `/api/v1/admin/question-imports` | Admin | Private CSV import |
| GET/POST | `/api/v1/admin/exam-sets` | Admin | Exam set management |
| GET/POST | `/api/v1/admin/exams` | Admin | Exam management |
| PUT | `/api/v1/admin/exams/{id}/configuration` | Admin | Curriculum selection |
| GET | `/api/v1/admin/exams/{id}/distribution` | Admin | Computed 25-question allocation |
| POST | `/api/v1/student/exams/{id}/start` | Student | Start/resume attempt |
| POST | `/api/v1/student/attempts/{id}/answers` | Student | Autosave answer |
| POST | `/api/v1/student/attempts/{id}/submit` | Student | Finalize attempt |
| POST | `/api/v1/student/attempts/{id}/violations` | Student | Report validated security signal |
| GET | `/api/v1/admin/results` | Admin | Paginated result management |
| GET | `/api/v1/admin/violations` | Admin | Paginated violation review |

The actual route list is authoritative and can be inspected with `php artisan route:list --path=api/v1`.
