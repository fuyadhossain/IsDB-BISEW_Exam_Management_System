# IsDB-BISEW Exam Management System

A full-stack online exam management platform built for BISEW, featuring course/batch management, exam creation, question banks, student attempts, results, and reporting.

## Tech Stack

- **Backend:** Laravel 12 (PHP 8.2+), Laravel Sanctum for authentication
- **Frontend:** React + Vite
- **Database:** MySQL (SQLite supported for local development)

## Project Structure

```
IsDB-BISEW/
├── backend/    # Laravel API (auth, exams, courses, batches, results, reports)
└── frontend/   # React + Vite client application
```

## Key Features

- Role-based access control (Admin, Super Admin, Student)
- Course, batch, and student enrollment management
- Exam and question bank creation with question sets/papers
- Timed exam attempts with violation tracking
- Automated result computation and reporting
- Audit logging

## Getting Started

### Backend (Laravel)

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

Update `.env` with your database credentials before running migrations.

### Frontend (React + Vite)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` in `.env` to point to your backend API URL.

## Building for Production

```bash
# Backend
cd backend
composer install --optimize-autoloader --no-dev
php artisan config:cache

# Frontend
cd frontend
npm run build
```

## License

MIT
