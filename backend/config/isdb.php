<?php
return [
    'student_max_failed_logins' => (int) env('STUDENT_MAX_FAILED_LOGINS', 5),
    'student_lock_minutes' => (int) env('STUDENT_LOCK_MINUTES', 15),
    'batch_active_capacity' => 15,
    'exam_question_total' => 25,
    // Per exam_type rules: forces the exam mode and question composition.
    // exam_type values not listed here fall back to the legacy behaviour
    // (mode supplied by the caller, exam_question_total MCQs, no descriptive).
    'exam_type_rules' => [
        // The frontend's exam-set form only ever sends 'MID_MONTHLY' or
        // 'MONTHLY' as exam_type (see exam-workflow-pages.jsx) — no exam
        // in the actual database ever has the literal exam_type 'MID'.
        // The key here previously said 'MID', so every real Mid Monthly
        // exam fell through to the unlisted-type fallback instead of this
        // rule (same mcq_count by coincidence, but `mode` silently came
        // from whatever the caller supplied instead of being forced to
        // ONLINE).
        'MID_MONTHLY' => ['mode' => 'ONLINE', 'mcq_count' => 25, 'descriptive_count' => 0],
        'MONTHLY' => ['mode' => 'OFFLINE', 'mcq_count' => 23, 'descriptive_count' => 2],
    ],
    // The admin management pages (Courses/TSP/Rounds/Batches/Students/
    // Subjects/Modules/Competency Units/Elements) share one global
    // frontend cache that, on first load, fetches ALL NINE catalog types
    // up front (see academic-demo-store.js's fetchAllPages/fetchSlices) —
    // and any table with more rows than one page has to loop through
    // page after page sequentially to build that cache, since the
    // frontend's per_page request is capped here. Raising this from 100
    // to 500 cuts that to a single round trip for any table under 500
    // rows (most tables here realistically are), directly shortening how
    // long those pages sit empty/loading on a fresh visit.
    'pagination_max' => 500,
    'violation_duplicate_window_seconds' => 10,
    'student_token_expiration_minutes' => (int) env('STUDENT_TOKEN_EXPIRATION_MINUTES', 180),
    'developer_super_admin' => [
        'accounts' => [
            1 => ['enabled' => (bool) env('DEVELOPER_SUPER_ADMIN_1_ENABLED', false), 'email' => env('DEVELOPER_SUPER_ADMIN_1_USERNAME'), 'password' => env('DEVELOPER_SUPER_ADMIN_1_PASSWORD')],
            2 => ['enabled' => (bool) env('DEVELOPER_SUPER_ADMIN_2_ENABLED', false), 'email' => env('DEVELOPER_SUPER_ADMIN_2_USERNAME'), 'password' => env('DEVELOPER_SUPER_ADMIN_2_PASSWORD')],
        ],
    ],
];
