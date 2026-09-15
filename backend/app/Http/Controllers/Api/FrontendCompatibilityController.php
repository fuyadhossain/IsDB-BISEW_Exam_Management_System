<?php

namespace App\Http\Controllers\Api;

use App\Models\{Batch, Course, Exam, ExamAttemptQuestion, ExamEvidence, ExamResult, Module, Subject, CompetencyUnit, Element, Student, StudentExamAttempt, User};
use App\Services\{AttemptService, AuditLogger, CurriculumImportService, FinalResultService, ImportService, ResultAuthorizationService, StudentAuthService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Compatibility facade for the existing React client.
 *
 * The canonical API remains under /api/v1. These endpoints deliberately adapt
 * the legacy /api contract so the frontend does not need source changes.
 */
class FrontendCompatibilityController
{
    public function results(Request $request)
    {
        // The dropdowns require course + batch + exam number before showing
        // anything, so once all three (plus outcome/round, if given) are
        // present we have a single exact batch+exam — enumerate every
        // ACTIVE student assigned to that batch, not just the ones who
        // happen to have an ExamResult row. A student who never attempted
        // before the exam closed still needs to appear, with an MCQ score
        // of 0 and an editable Evidence cell, instead of being invisible.
        if ($request->filled('course') && $request->filled('batch') && $request->filled('exam_number')) {
            return $this->rosterResults($request);
        }

        // No exact batch+exam context has been chosen yet — this call is
        // only populating the Course/Batch/Round/Exam-number dropdowns on
        // the results screen. Building that catalog from ExamResult meant
        // an exam that nobody had submitted for yet (or that only one
        // student had submitted for) never appeared as a selectable option
        // at all — so the admin could never even reach rosterResults()
        // above to see the rest of the batch marked ABSENT. Build the
        // catalog from every exam the admin can access instead, regardless
        // of whether any student has a result for it yet.
        $query = Exam::with([
            'examSet:id,batch_id',
            'examSet.batch:id,course_id,round_id,tsp_id,shift,batch_number',
            'examSet.batch.course:id,code,name',
            'examSet.batch.round:id,code,name',
        ]);

        $query
            ->when($request->filled('course'), fn($q) => $q->whereHas('examSet.batch.course', fn($c) => $c->where('code', $request->string('course')->toString())->orWhere('id', $request->integer('course'))))
            ->when($request->filled('batch'), fn($q) => $q->whereHas('examSet.batch', fn($b) => $b->where('batch_number', $request->string('batch')->toString())->orWhere('id', $request->integer('batch'))))
            ->when($request->filled('round'), fn($q) => $q->whereHas('examSet.batch.round', fn($rr) => $rr->where('code', $request->string('round')->toString())->orWhere('id', $request->integer('round'))));

        if (!$request->user()->isSuperAdmin()) {
            $query->whereHas('examSet.batch', fn($b) => $b->whereIn('course_id', $request->user()->activeCourses()->select('courses.id')));
        }

        $exams = $query->get();

        return ApiResponse::success($exams->map(function (Exam $exam) {
            $batch = $exam->examSet?->batch;
            return [
                'id' => null,
                'studentDbId' => null,
                'examId' => $exam->id,
                'studentId' => null,
                'student' => null,
                'course' => $batch?->course?->code,
                'round' => $batch?->round?->code,
                'batch' => $batch?->batch_number,
                'batchCode' => $batch?->display_code,
                'exam' => $exam->exam_title,
                'examNumber' => $exam->exam_number,
                'examType' => $exam->exam_type,
                'status' => null,
            ];
        })->values());
    }

    private function rosterResults(Request $request)
    {
        $batchQuery = Batch::query()
            ->whereHas('course', fn($c) => $c->where('code', $request->string('course')->toString())->orWhere('id', $request->integer('course')))
            ->when($request->filled('round'), fn($q) => $q->whereHas('round', fn($rr) => $rr->where('code', $request->string('round')->toString())->orWhere('id', $request->integer('round'))))
            ->where(fn($q) => $q->where('batch_number', $request->string('batch')->toString())->orWhere('id', $request->integer('batch')));
        $batch = (new ResultAuthorizationService)->scopeBatch($batchQuery, $request->user())->with(['course:id,code,name', 'round:id,code,name', 'tsp:id,code'])->first();
        if (!$batch) return ApiResponse::success([]);

        $exam = Exam::whereHas('examSet', fn($q) => $q->where('batch_id', $batch->id))
            ->where('exam_number', $request->string('exam_number')->toString())
            // A batch's exam set can hold a MID exam and a MONTHLY exam
            // that share the same exam_number (the DB only enforces
            // uniqueness on exam_set_id + exam_number, not exam_type — see
            // the exams table migration). Without this exam_type filter,
            // picking "Mid Monthly · No. 05" from the dropdown could
            // silently load the Monthly exam's roster instead, whichever
            // row Eloquent happened to return first for that batch+number.
            ->when($request->filled('exam_type'), fn($q) => $q->where('exam_type', $request->string('exam_type')->toString()))
            // A result sheet with no subject/module context couldn't tell
            // anyone which subject the exam actually covered once printed
            // or separated from the filters used to find it — load the
            // exam's assigned subjects/modules so that can be shown on
            // every row/PDF alongside the course, batch, and exam number.
            ->with(['subjects:id,name', 'modules:id,name'])
            ->first();
        if (!$exam) return ApiResponse::success([]);

        $subjectNames = $exam->subjects->pluck('name')->implode(', ');
        $moduleNames = $exam->modules->pluck('name')->implode(', ');

        $students = $batch->students()->wherePivot('status', 'ACTIVE')->orderBy('name')->get(['students.id', 'students.student_id', 'students.name']);
        $resultsByStudent = ExamResult::where('exam_id', $exam->id)->whereIn('student_id', $students->pluck('id'))->get()->keyBy('student_id');
        $evidenceByStudent = ExamEvidence::where('exam_id', $exam->id)->whereIn('student_id', $students->pluck('id'))->get()->keyBy('student_id');
        $outcome = $request->filled('outcome') ? $request->string('outcome')->toString() : null;
        // Resolved once per request (not per student) — same sibling exam
        // for every row in this roster, since the roster is always scoped
        // to one exam. See FinalResultService for the pairing rule (same
        // batch + same exam_number, the other exam_type bucket).
        $siblingExam = FinalResultService::siblingExam($exam);

        $rows = $students->map(function ($student) use ($resultsByStudent, $evidenceByStudent, $exam, $batch, $subjectNames, $moduleNames, $siblingExam) {
            $result = $resultsByStudent->get($student->id);
            $evidence = $evidenceByStudent->get($student->id);
            $isMonthly = FinalResultService::isMonthly($exam->exam_type);
            $midExam = $isMonthly ? $siblingExam : $exam;
            $monthlyExam = $isMonthly ? $exam : $siblingExam;
            return [
                'id' => $result?->id,
                'studentDbId' => $student->id,
                'examId' => $exam->id,
                'studentId' => $student->student_id,
                'student' => $student->name,
                'course' => $batch->course?->code,
                'round' => $batch->round?->code,
                'batch' => $batch->batch_number,
                'batchCode' => $batch->display_code,
                'exam' => $exam->exam_title,
                'examNumber' => $exam->exam_number,
                'examType' => $exam->exam_type,
                // Same 'exam_date' the on-screen result sheet's PDF letterhead
                // needs — mirrors the format AttemptController already uses
                // for `examDate` elsewhere in the app, so both stay consistent.
                'examDate' => $exam->start_at?->format('d-m-Y'),
                'subject' => $subjectNames ?: null,
                'module' => $moduleNames ?: null,
                // Needed by the frontend's single-exam MCQ+Evidence total/
                // pass-fail column — this exam's own full-marks and
                // pass-cutoff, unrelated to the cross-exam Mid Monthly +
                // Monthly Final Result FinalResultService computes below.
                'maxMarks' => (float) $exam->max_marks,
                'passMarks' => (float) $exam->pass_marks,
                'totalQuestions' => $result ? $result->correct_answers + $result->wrong_answers + $result->unanswered_questions : 0,
                'correct' => $result->correct_answers ?? 0,
                'wrong' => $result->wrong_answers ?? 0,
                'unanswered' => $result->unanswered_questions ?? 0,
                'obtainedMarks' => (float) ($result->total_marks ?? 0),
                'percentage' => (float) ($result->percentage ?? 0),
                // A student with no ExamResult row never attempted (or the
                // exam closed before they submitted) — surface that plainly
                // as ABSENT rather than leaving status blank.
                'status' => $result->status ?? 'ABSENT',
                'evidenceMarks' => $evidence?->marks !== null ? (float) $evidence->marks : null,
                'evidenceMcqMarks' => $evidence?->mcq_marks !== null ? (float) $evidence->mcq_marks : null,
                'attended' => (bool) ($evidence?->attended ?? false),
                'attendedAt' => $evidence?->attended_at,
                // Mid Monthly's own External/Evidence pass mark is
                // admin-configurable (Settings -> Grading, default 32) --
                // deliberately independent of the exam's own `pass_marks`
                // column and only ever computed for a Mid Monthly exam
                // (never applied to a Monthly exam's own raw External/
                // Evidence, which have no standalone pass mark of their
                // own — only the combined Final Result below does).
                'externalStatus' => $isMonthly ? null : FinalResultService::componentStatus($result !== null ? (float) $result->total_marks : null),
                'evidenceStatus' => $isMonthly ? null : FinalResultService::componentStatus($evidence?->marks !== null ? (float) $evidence->marks : null),
                'midPassMark' => FinalResultService::midPassMark(),
                // Only ever populated when this row's exam is Monthly and
                // its sibling Mid Monthly exam (same batch + exam number)
                // exists — Mid Monthly's own roster never shows a Final
                // Result section per the spec.
                'finalResult' => !$isMonthly ? null : ($midExam
                    ? FinalResultService::buildForPair($midExam, $monthlyExam, $student->id)
                    : ['complete' => false, 'message' => "No Mid Monthly exam numbered {$exam->exam_number} was found for this batch yet."]),
            ];
        })->filter(fn($row) => !$outcome || $outcome === 'all' || $row['status'] === $outcome)->values();

        return ApiResponse::success($rows);
    }

    public function updateEvidence(Request $request)
    {
        $data = $request->validate([
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'exam_id' => ['required', 'integer', 'exists:exams,id'],
            // `sometimes` (not just `nullable`) — the key must be genuinely
            // absent from the request to leave that column untouched. The
            // Evidence tab now only ever sends `marks`; the MCQ tab only
            // ever sends `mcq_marks`; only explicitly clearing a field in
            // the UI sends it as null, which still legitimately clears it.
            'marks' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            // The Monthly exam is offline, so its MCQ portion is never
            // auto-graded like the Mid exam's — an admin keys it in here
            // too, tracked separately from the overall `marks` so the two
            // don't have to be mentally combined before typing one number.
            'mcq_marks' => ['sometimes', 'nullable', 'numeric', 'min:0'],
        ]);

        $exam = Exam::with('examSet.batch')->findOrFail($data['exam_id']);
        (new ResultAuthorizationService)->assertBatch($request->user(), $exam->examSet?->batch);

        // Only write the fields the caller actually sent — the MCQ tab now
        // saves mcq_marks on its own (without touching marks), and the
        // Evidence tab saves marks on its own (without touching
        // mcq_marks). Previously this always wrote both fields together
        // (defaulting an omitted one to null), so saving from either tab
        // silently erased whatever the other tab had already saved.
        //
        // Attendance is deliberately NOT settable from this endpoint at
        // all (not even opt-in) — entering or saving marks, for either
        // MCQ or Evidence, on either a Mid or a Monthly exam, must never
        // change whether a student is marked present/absent. The only way
        // to change `attended` is the dedicated markAttendance() endpoint
        // below, via the explicit "Mark attended"/"Mark absent" button.
        $attributes = ['updated_by' => $request->user()->id];
        if (array_key_exists('marks', $data)) $attributes['marks'] = $data['marks'];
        if (array_key_exists('mcq_marks', $data)) $attributes['mcq_marks'] = $data['mcq_marks'];

        $evidence = ExamEvidence::updateOrCreate(
            ['exam_id' => $data['exam_id'], 'student_id' => $data['student_id']],
            $attributes
        );
        AuditLogger::record('result.evidence_updated', $evidence);

        return ApiResponse::success(['studentDbId' => $evidence->student_id, 'examId' => $evidence->exam_id, 'evidenceMarks' => $evidence->marks !== null ? (float) $evidence->marks : null, 'evidenceMcqMarks' => $evidence->mcq_marks !== null ? (float) $evidence->mcq_marks : null, 'attended' => (bool) $evidence->attended, 'attendedAt' => $evidence->attended_at], 'Evidence saved');
    }

    /**
     * Manually mark a student as attended for an exam, without touching
     * marks. Reuses the exam_evidences row/unique-constraint (exam_id,
     * student_id) that manual marks already use, so a student can only
     * ever have one attendance state per exam — no duplicate records.
     */
    public function markAttendance(Request $request)
    {
        $data = $request->validate([
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'exam_id' => ['required', 'integer', 'exists:exams,id'],
            'attended' => ['sometimes', 'boolean'],
        ]);
        $attended = array_key_exists('attended', $data) ? (bool) $data['attended'] : true;

        $exam = Exam::with('examSet.batch')->findOrFail($data['exam_id']);
        (new ResultAuthorizationService)->assertBatch($request->user(), $exam->examSet?->batch);

        // Student must actually belong to this exam's batch — never trust
        // student_id alone from the frontend for who gets marked present.
        $belongs = \App\Models\BatchStudent::where('batch_id', $exam->examSet?->batch_id)->where('student_id', $data['student_id'])->exists();
        if (!$belongs) return ApiResponse::error('This student is not enrolled in the exam\'s batch.', 422);

        $evidence = ExamEvidence::updateOrCreate(
            ['exam_id' => $data['exam_id'], 'student_id' => $data['student_id']],
            ['attended' => $attended, 'attended_at' => $attended ? now() : null, 'updated_by' => $request->user()->id]
        );
        AuditLogger::record('result.attendance_marked', $evidence, ['attended' => $attended]);

        return ApiResponse::success(['studentDbId' => $evidence->student_id, 'examId' => $evidence->exam_id, 'attended' => (bool) $evidence->attended, 'attendedAt' => $evidence->attended_at], 'Attendance saved');
    }

    public function resultFilterOptions(Request $request)
    {
        $query = ExamResult::with(['exam.examSet.batch.course', 'exam.examSet.batch.round']);
        $results = (new ResultAuthorizationService)->scope($query, $request->user())->get();

        return ApiResponse::success([
            'courses' => $results->pluck('exam.examSet.batch.course.code')->filter()->unique()->values(),
            'batches' => $results->pluck('exam.examSet.batch.batch_number')->filter()->unique()->values(),
            'rounds' => $results->pluck('exam.examSet.batch.round.code')->filter()->unique()->values(),
            'exam_numbers' => $results->pluck('exam.exam_number')->filter()->unique()->values(),
            'outcomes' => $results->pluck('status')->filter()->unique()->values(),
        ]);
    }

    public function studentLogin(Request $request)
    {
        $data = $request->validate([
            'student_id' => ['required', 'string'],
            'date_of_birth' => ['required', 'date_format:Y-m-d'],
        ]);

        try {
            $auth = (new StudentAuthService)->authenticate($data['student_id'], $data['date_of_birth']);
            $student = Student::where('student_id', $data['student_id'])->firstOrFail();
            $exam = Exam::with('examSet.batch')
                ->where('mode', 'ONLINE')
                ->whereIn('status', ['READY', 'STARTED'])
                ->whereHas('examSet.batch.students', fn($q) => $q->whereKey($student->id)->where('batch_students.status', 'ACTIVE'))
                // An exam that is actually STARTED (running right now) must
                // always win over one that is merely READY (not opened
                // yet), regardless of which one's scheduled start_at is
                // earlier — otherwise a currently-running exam can be
                // hidden behind a not-yet-started one whose scheduled time
                // happens to sort first.
                ->orderByRaw("CASE WHEN status = 'STARTED' THEN 0 ELSE 1 END")
                ->orderBy('start_at')
                ->first();

            if (!$exam) {
                return ApiResponse::success(['ok' => false, 'availability' => 'NO_ACTIVE_EXAM', ...$auth], 'No examination is currently available.');
            }

            $now = now();
            $availability = $exam->status === 'STARTED' && (!$exam->start_at || $now->gte($exam->start_at)) && (!$exam->end_at || $now->lte($exam->end_at))
                ? 'AVAILABLE'
                : ($exam->start_at && $now->lt($exam->start_at) ? 'NOT_YET_AVAILABLE' : 'EXAM_ENDED');

            return ApiResponse::success([
                'ok' => $availability === 'AVAILABLE',
                'availability' => $availability,
                'exam' => ['id' => $exam->id, 'title' => $exam->exam_title, 'examNumber' => $exam->exam_number],
                'expiresAt' => $exam->end_at?->toISOString(),
                'attemptSeconds' => $exam->duration * 60,
                'lateEntry' => false,
                'secondsUntilOpen' => $exam->start_at && $now->lt($exam->start_at) ? $now->diffInSeconds($exam->start_at) : 0,
                'schedule' => ['opensAt' => $exam->start_at?->toISOString(), 'closesAt' => $exam->end_at?->toISOString()],
                ...$auth,
            ], 'Student login successful');
        } catch (ValidationException $exception) {
            return ApiResponse::validation($exception->errors());
        }
    }

    public function curriculumOptions(Request $request)
    {
        $courseId = $request->integer('course');
        abort_unless($courseId, 422, 'course is required.');
        if (!$request->user()->isSuperAdmin()) {
            abort_unless($request->user()->activeCourses()->whereKey($courseId)->exists(), 403, 'This course is outside your assigned scope.');
        }

        return ApiResponse::success([
            'courses' => Course::whereKey($courseId)->get(['id', 'code', 'name']),
            'subjects' => Subject::where('course_id', $courseId)->when($request->filled('subject'), fn($q) => $q->whereKey($request->integer('subject')))->orderBy('name')->get(['id', 'course_id', 'name']),
            'modules' => Module::whereHas('subject', fn($q) => $q->where('course_id', $courseId))->when($request->filled('module'), fn($q) => $q->whereKey($request->integer('module')))->orderBy('name')->get(['id', 'subject_id', 'name']),
            'competency_units' => CompetencyUnit::where('course_id', $courseId)->when($request->filled('competency_unit'), fn($q) => $q->whereKey($request->integer('competency_unit')))->orderBy('name')->get(['id', 'module_id', 'course_id', 'name']),
            'elements' => Element::whereHas('competencyUnit', fn($q) => $q->where('course_id', $courseId))->orderBy('name')->get(['id', 'competency_unit_id', 'name']),
        ]);
    }

    public function updatePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);
        $user = $request->user();
        if (!Hash::check($data['current_password'], $user->password)) {
            return ApiResponse::error('The current password is incorrect.', 422);
        }
        $user->update(['password' => Hash::make($data['password'])]);
        AuditLogger::record('user.password_changed', $user);
        return ApiResponse::success(null, 'Password updated successfully.');
    }

    public function answerByQuestion(Request $request, int $attemptId, int $questionId)
    {
        $attempt = StudentExamAttempt::whereKey($attemptId)
            ->where('student_id', $request->user()->id)
            ->firstOrFail();
        $attemptQuestion = ExamAttemptQuestion::where('attempt_id', $attempt->id)
            ->where('question_id', $questionId)
            ->firstOrFail();
        $data = $request->validate([
            'selected_options' => ['array'],
            'selected_options.*' => ['string'],
        ]);

        try {
            $answer = (new AttemptService)->saveAnswer($attempt, $attemptQuestion, $data['selected_options'] ?? []);
            return ApiResponse::success(['saved' => true, 'answered_at' => $answer->answered_at]);
        } catch (ValidationException $exception) {
            return ApiResponse::validation($exception->errors());
        }
    }

    public function import(Request $request, string $dataType)
    {
        $request->validate(['file' => ['required', 'file', 'mimes:csv,txt']]);

        if ($dataType === 'questions') {
            try {
                $import = (new ImportService)->import($request->user(), $request->file('file'));
                return ApiResponse::success($import, 'Question import completed', 201);
            } catch (ValidationException $exception) {
                return ApiResponse::validation($exception->errors());
            }
        }

        if (in_array($dataType, ['subjects', 'modules', 'competency-units', 'elements', 'curriculum'], true)) {
            try {
                $result = (new CurriculumImportService)->import($request->user(), $dataType, $request->file('file'));
                return ApiResponse::success($result, ucfirst(str_replace('-', ' ', $dataType)) . ' import completed', 201);
            } catch (ValidationException $exception) {
                return ApiResponse::validation($exception->errors());
            }
        }

        if ($dataType !== 'students') {
            return ApiResponse::error('Unsupported CSV import type.', 422);
        }

        $expected = ['student_id', 'full_name', 'date_of_birth', 'email', 'batch_identifier', 'status'];
        // Accept a few common real-world variants of the template headers
        // (different wording and/or column order) instead of hard-failing
        // the whole file just because e.g. "name" was used instead of
        // "full_name", or "batch_code" instead of "batch_identifier".
        $headerAliases = [
            'student_id' => ['student_id', 'studentid', 'id'],
            'full_name' => ['full_name', 'fullname', 'name', 'student_name'],
            'date_of_birth' => ['date_of_birth', 'dob', 'birth_date'],
            'email' => ['email', 'email_address'],
            'batch_identifier' => ['batch_identifier', 'batch_code', 'batchcode', 'batch'],
            'status' => ['status'],
        ];
        $handle = fopen($request->file('file')->getRealPath(), 'rb');
        $rawHeaders = array_map(fn($value) => strtolower(trim(str_replace("\xEF\xBB\xBF", '', (string) $value))), fgetcsv($handle) ?: []);
        $errors = [];

        // Map each expected field to whichever column index actually holds
        // it in this file, regardless of order or exact wording.
        $columnIndex = [];
        foreach ($headerAliases as $field => $aliases) {
            $index = null;
            foreach ($aliases as $alias) {
                $found = array_search($alias, $rawHeaders, true);
                if ($found !== false) {
                    $index = $found;
                    break;
                }
            }
            if ($index === null) {
                $errors[] = ['line' => 1, 'column' => 'Header', 'message' => "The CSV is missing a column for \"{$field}\" (expected one of: " . implode(', ', $aliases) . ').'];
            } else {
                $columnIndex[$field] = $index;
            }
        }

        $rows = [];
        $line = 1;
        while (($cells = fgetcsv($handle)) !== false) {
            $line++;
            if (count($cells) === 1 && trim((string) $cells[0]) === '') continue;
            if ($errors) continue; // header mapping failed, no point reading data rows
            if (count($cells) !== count($rawHeaders)) {
                $errors[] = ['line' => $line, 'column' => 'CSV format', 'message' => 'The number of columns does not match the student template.'];
                continue;
            }
            $row = [];
            foreach ($expected as $field) {
                $row[$field] = trim((string) ($cells[$columnIndex[$field]] ?? ''));
            }
            foreach (['student_id', 'full_name', 'date_of_birth', 'email', 'batch_identifier', 'status'] as $field) {
                if ($row[$field] === '') $errors[] = ['line' => $line, 'column' => $field, 'message' => 'This value is required.'];
            }
            // Accept common casing/synonym variants ("ACTIVE", "enabled",
            // "yes") for status instead of hard-rejecting a row over
            // casing alone -- normalize to the exact "Active"/"Inactive"
            // the rest of the system expects.
            $statusKey = strtolower($row['status']);
            $statusMap = ['active' => 'Active', 'enabled' => 'Active', 'yes' => 'Active', 'y' => 'Active', '1' => 'Active', 'inactive' => 'Inactive', 'disabled' => 'Inactive', 'no' => 'Inactive', 'n' => 'Inactive', '0' => 'Inactive'];
            if (isset($statusMap[$statusKey])) $row['status'] = $statusMap[$statusKey];
            if ($row['status'] !== '' && !in_array($row['status'], ['Active', 'Inactive'], true)) $errors[] = ['line' => $line, 'column' => 'status', 'message' => 'Use Active or Inactive.'];
            if ($row['email'] !== '' && !filter_var($row['email'], FILTER_VALIDATE_EMAIL)) $errors[] = ['line' => $line, 'column' => 'email', 'message' => 'Enter a valid email address.'];
            // Opening this CSV in Excel/Google Sheets and re-saving it
            // auto-reformats any YYYY-MM-DD cell it recognizes as a date
            // into the locale's date style (commonly M/D/YYYY, D/M/YYYY,
            // D-M-YYYY, or D.M.YYYY), which used to hard-fail every row on
            // re-upload. Accept those common re-saved shapes here and
            // normalize back to YYYY-MM-DD before validating, instead of
            // only accepting the one exact string format.
            if ($row['date_of_birth'] !== '' && !preg_match('/^\\d{4}-\\d{1,2}-\\d{1,2}$/', $row['date_of_birth'])) {
                $normalizedDob = null;
                if (preg_match('#^(\\d{1,2})[/.\\-](\\d{1,2})[/.\\-](\\d{4})$#', $row['date_of_birth'], $m)) {
                    [, $a, $b, $year] = $m;
                    // Ambiguous M/D vs D/M: if the first number can't be a
                    // month (>12), it must be D/M/YYYY; otherwise assume
                    // M/D/YYYY, which is what Excel/Sheets produce by
                    // default in most locales.
                    [$month, $day] = ((int) $a > 12) ? [(int) $b, (int) $a] : [(int) $a, (int) $b];
                    if ($month >= 1 && $month <= 12 && $day >= 1 && $day <= 31) {
                        $normalizedDob = sprintf('%04d-%02d-%02d', (int) $year, $month, $day);
                    }
                }
                if ($normalizedDob) {
                    $row['date_of_birth'] = $normalizedDob;
                } else {
                    $errors[] = ['line' => $line, 'column' => 'date_of_birth', 'message' => 'Use YYYY-MM-DD format.'];
                }
            }
            $rows[] = ['line' => $line, 'data' => $row];
        }
        fclose($handle);
        $ids = collect($rows)->pluck('data.student_id');
        if ($ids->duplicates()->isNotEmpty()) $errors[] = ['line' => 1, 'column' => 'student_id', 'message' => 'Student IDs must be unique within the file.'];
        if (Student::whereIn('student_id', $ids)->exists()) $errors[] = ['line' => 1, 'column' => 'student_id', 'message' => 'One or more Student IDs already exist.'];
        if ($errors) return ApiResponse::validation(['file' => $errors]);

        try {
            $created = DB::transaction(function () use ($rows, $request) {
                $batches = \App\Models\Batch::with(['course', 'tsp', 'round'])->get();
                $count = 0;
                foreach ($rows as $entry) {
                    $row = $entry['data'];
                    $batch = $batches->first(fn($batch) => $batch->displayCode() === $row['batch_identifier']);
                    if (!$batch) throw ValidationException::withMessages(['batch_identifier' => ["No batch matches {$row['batch_identifier']}."]]);
                    if (!$request->user()->isSuperAdmin() && !$request->user()->activeCourses()->whereKey($batch->course_id)->exists()) {
                        throw ValidationException::withMessages(['batch_identifier' => ["Batch {$row['batch_identifier']} is outside your assigned course scope."]]);
                    }
                    $student = Student::create(['student_id' => $row['student_id'], 'name' => $row['full_name'], 'date_of_birth' => $row['date_of_birth'], 'email' => $row['email'], 'status' => strtoupper($row['status']) === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE']);
                    \App\Models\BatchStudent::create(['batch_id' => $batch->id, 'student_id' => $student->id, 'assigned_at' => now(), 'status' => $student->status]);
                    $count++;
                }
                return $count;
            });
            AuditLogger::record('student_import.completed', $request->user(), ['successful' => $created]);
            return ApiResponse::success(['imported' => $created, 'status' => 'COMPLETED'], 'Student import completed', 201);
        } catch (ValidationException $exception) {
            return ApiResponse::validation($exception->errors());
        }
    }

    private function resultRecord(ExamResult $result): array
    {
        $exam = $result->exam;
        $batch = $exam?->examSet?->batch;
        $course = $batch?->course;
        $round = $batch?->round;

        return [
            'id' => $result->id,
            'studentId' => $result->student?->student_id,
            'student' => $result->student?->name,
            'course' => $course?->code,
            'batch' => $batch?->batch_number,
            // Full human-readable batch code (e.g. "PWAD/CCSL-M/71/01"),
            // built the same way the rest of the admin panel already shows
            // it — used as the Batch dropdown's label so admins recognize
            // the batch instead of just seeing a bare number.
            'batchCode' => $batch?->display_code,
            'round' => $round?->code,
            'exam' => $exam?->exam_title,
            'examNumber' => $exam?->exam_number,
            'examType' => $exam?->exam_type,
            'totalQuestions' => $result->correct_answers + $result->wrong_answers + $result->unanswered_questions,
            'correct' => $result->correct_answers,
            'wrong' => $result->wrong_answers,
            'unanswered' => $result->unanswered_questions,
            'obtainedMarks' => (float) $result->total_marks,
            'percentage' => (float) $result->percentage,
            'status' => $result->status,
        ];
    }
}
