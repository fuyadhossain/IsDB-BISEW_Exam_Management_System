# IsDB-BISEW Frontend — Run, Laravel API, and Deployment Guide

**Author:** Manus AI  
**Project:** IsDB-BISEW Examination Management System

## Overview

This repository uses **JavaScript and JSX** for the client application. Every React page, component, context, hook that renders UI, and application entry file uses the `.jsx` extension. Plain JavaScript files are intentionally retained for non-UI utilities, API services, mock data, Vite configuration, and the Node server. The initial public route is the student login screen. Administrators may open `/admin` or `/admin/login` directly to use the administrative email-and-password login screen.

| Area | Location | Purpose |
|---|---|---|
| Application entry | `client/src/main.jsx` | Starts the React application. |
| Pages and components | `client/src/**/*.jsx` | User interface and routing. |
| API configuration | `client/src/services/api-client.js` | Stores the Laravel API base URL and switches between mock and live modes. |
| Runtime API option | Admin → Settings | Lets an authorized administrator set a browser-local Laravel API base URL. |
| Environment configuration | `.env.local` | Optional build-time Laravel API defaults; create it locally and keep it out of source control. |

## Run Locally

Install project dependencies once, then start the Vite development server. The `dev` script is configured as `vite --host`, so it works through both npm and pnpm.

```bash
pnpm install
pnpm dev
```

Or use npm directly:

```bash
npm install
npm run dev
```

The development server will show its local URL in the terminal. To produce a production build, run:

```bash
pnpm build
```

## Configure Laravel API Access

Create a local environment file named `.env.local`:

```bash
touch .env.local
```

Set the Laravel API base URL and turn off mock mode when the backend is ready:

```ini
VITE_API_BASE_URL=https://api.example.org/api
VITE_USE_MOCK_API=false
```

Vite exposes variables prefixed with `VITE_` to client-side code and replaces them at build time; therefore, **do not put API keys, passwords, or other secrets in these variables**. Restart the Vite server after changing environment files. [1]

The same Base URL can be changed in **Admin → Settings → Laravel API connection**. This runtime setting is stored in the current browser only, which is suitable for testing or controlled administrator devices. For production, set the deploy-time environment values as the source of truth.

When live mode is enabled, the implemented student attempt requests use the configured base URL:

| Action | HTTP request |
|---|---|
| Save answer | `PUT /student/attempts/{attemptId}/answers/{questionId}` |
| Submit attempt | `POST /student/attempts/{attemptId}/submit` |
| Report restriction | `POST /student/attempts/{attemptId}/violations` |

## CSV Bulk Data Import

Only the **Students** section exposes a **CSV import** action beside its manual create action. Other administrative records are entered individually through their dedicated forms.

| CSV action | Purpose |
|---|---|
| **Template CSV** | Downloads a blank student CSV with the exact required column headers. |
| **Demo download** | Downloads a valid one-student example that can be edited before use. |
| **Load demo upload** | Loads the student example into the preview panel without requiring a local file. |
| **Choose CSV file** | Uploads an administrator-prepared student CSV and displays its header/first rows for validation. |
| **Validate and import** | Sends a student bulk-import payload to Laravel in live API mode, or confirms the mock validation in demonstration mode. |

The browser verifies that all required headers are present before the import action becomes available. Laravel must remain the authoritative validator for record relationships, duplicates, permissions, formats, and transaction safety. In live mode, implement the following generic import endpoint:

| Action | HTTP request |
|---|---|
| Student CSV import | `POST /admin/imports/students` as `multipart/form-data`, containing `file` and `data_type=students` |

The supported `{dataType}` value in this frontend is `students`.

Laravel API routes may be registered in `routes/api.php`; Laravel automatically applies the `/api` prefix to those routes. [2] Configure the frontend origin in Laravel’s CORS policy and implement authentication and authorization server-side. The browser UI does not replace backend permission checks.

## Laravel Deployment Checklist

The Laravel application should supply the required endpoints, validate every payload, enforce the exam deadline on the server, and authorize each request. Keep `.env` files out of source control; Laravel documents environment files as deployment-specific and sensitive. [3]

| Check | Requirement |
|---|---|
| API routes | Implement the three student-attempt endpoints listed above. |
| Authentication | Replace mock login tokens with Laravel Sanctum or the chosen server-side mechanism. |
| CORS | Allow only the deployed frontend origin and the required methods/headers. |
| Environment | Set `APP_ENV=production` and `APP_DEBUG=false`. |
| Configuration cache | Run `php artisan config:cache` as part of the production deployment after environment values are in place. [3] |

> **Security note:** The API base URL is public configuration. Credentials, private keys, and privileged authorization decisions must remain in Laravel, never in the React/Vite client. [1]

## Frontend Deployment

First run `pnpm build`. The static frontend output is generated in `dist/public`. In the Manus workspace, save a checkpoint and then use the **Publish** control in the management interface to deploy the project. For another static host, upload the contents of `dist/public` and configure a rewrite so client-side routes such as `/student/login` and `/admin/login` return `index.html`.

## References

[1]: https://vite.dev/guide/env-and-mode "Vite — Env Variables and Modes"
[2]: https://laravel.com/docs/13.x/routing "Laravel 13 — Routing"
[3]: https://laravel.com/docs/13.x/configuration "Laravel 13 — Configuration"
