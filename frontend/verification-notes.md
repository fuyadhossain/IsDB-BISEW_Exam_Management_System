# Verification notes

- The Vite application starts at `http://localhost:3000/`.
- Admin login succeeds with the repository-provided demonstration account.
- The Question Bank route loads at `/admin/questions` and displays 26 records.
- On `/admin/questions`, the sidebar visually highlights Question bank; CSV Import Question is not highlighted.
- The online attempt implementation was updated to use 25 questions for Mid Monthly online exams and to reject an attempt if fewer than 25 eligible active questions exist.
- The sidebar active-link implementation was updated so an exact child route is not simultaneously treated as active by its parent route.

The CSV Import Question route loads at `/admin/questions/import` and visually highlights CSV Import Question while Question Bank is not highlighted. Returning to `/` correctly resolves to the student login route with the demonstration student prefilled.

The demonstration student successfully reaches the assigned `Mid Monthly Examination 01` instructions page. The page identifies it as an online dynamic exam with a 30-minute duration and allows the verified student to start after confirming the requirements.

Opening the demonstration exam exposed a data issue: the exact-count guard correctly reports that only 23 eligible active non-descriptive questions are available, so it cannot produce the required 25-question Mid Monthly attempt. The seed data therefore needs two additional eligible active MCQ records (or equivalent valid Question Bank records) before the browser verification can pass.

After the seed update, the student exam reloads successfully and the page reports `0 / 25 answered`, with visible question labels from `Question 1 of 25` through `Question 25 of 25`. The attempt therefore now contains exactly 25 questions. The browser also displayed the application’s existing fullscreen security warning during verification; no examination was submitted.
