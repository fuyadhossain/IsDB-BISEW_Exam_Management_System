<?php

namespace App\Services;

use App\Models\{AuditLog, Batch, CompetencyUnit, Element, Exam, ExamAnswer, ExamAttemptQuestion, ExamResult, ExamSet, ExamViolation, Module, Question, QuestionImport, QuestionImportRow, QuestionOption, Student, StudentExamAttempt, Subject, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

class AttemptService
{
    public function start(Student $student, Exam $exam): StudentExamAttempt
    {
        $batch = $exam->examSet->batch;
        if (!$student->assignments()->where('batch_id', $batch->id)->where('status', 'ACTIVE')->exists()) throw ValidationException::withMessages(['exam' => 'Student is not eligible for this exam.']);
        if ($exam->mode === 'OFFLINE') throw ValidationException::withMessages(['exam' => 'This exam is conducted offline on paper and has no online attempt.']);
        if ($exam->status !== 'STARTED' || ($exam->start_at && now()->lt($exam->start_at)) || ($exam->end_at && now()->gt($exam->end_at))) throw ValidationException::withMessages(['exam' => 'Exam is not currently available.']);
        $existing = StudentExamAttempt::where('student_id', $student->id)->where('exam_id', $exam->id)->first();
        if ($existing) {
            // The controller's payload() only ever reads question_snapshot
            // (a JSON column already stored on each ExamAttemptQuestion) —
            // it never touches question.options. Eager-loading
            // 'questions.question.options' here ran a full extra
            // join/query pulling every question and its options back out
            // of the bank on every "resume this attempt" call, which is
            // wasted work that visibly slowed down loading the exam
            // screen. 'questions.answers' is all payload() actually needs.
            if ($existing->status === 'ACTIVE' && !$existing->expired()) return $existing->load('questions', 'answers');
            throw ValidationException::withMessages(['exam' => 'This exam attempt has already been finalized.']);
        }
        return DB::transaction(function () use ($student, $exam) {
            $attempt = StudentExamAttempt::create(['student_id' => $student->id, 'exam_id' => $exam->id, 'status' => 'ACTIVE', 'started_at' => now(), 'expires_at' => now()->addMinutes($exam->duration)]);
            $dist = (new DistributionService)->assertAvailable($exam);
            $questions = [];
            $expectedMcq = 0;
            foreach ($dist as $bucket) {
                if ($bucket['question_type'] !== 'MCQ') continue;
                $expectedMcq += $bucket['required'];
                $qs = Question::with('options')->where('competency_unit_id', $bucket['competency_unit_id'])->where('status', 'ACTIVE')->whereIn('question_type', DistributionService::MCQ_TYPES)->inRandomOrder()->limit($bucket['required'])->get();
                foreach ($qs as $q) $questions[] = $q;
            }
            if (count($questions) !== $expectedMcq) throw ValidationException::withMessages(['exam' => 'The exam could not generate the required question count.']);
            shuffle($questions);
            foreach ($questions as $i => $q) {
                // Randomize each student's copy of the option order (A/B/C/D
                // positions) independently, so sitting near another student
                // and comparing "the answer is position 1" is useless —
                // everyone sees the same options in a different order. This
                // only shuffles the per-attempt snapshot; the master
                // question_options rows and their option_order are untouched.
                $shuffledOptions = $q->options->shuffle()->values();
                ExamAttemptQuestion::create(['attempt_id' => $attempt->id, 'question_id' => $q->id, 'question_order' => $i + 1, 'question_snapshot' => ['question_code' => $q->question_code, 'question_text' => $q->question_text, 'question_type' => $q->question_type, 'marks' => (float)$q->marks, 'options' => $shuffledOptions->map(fn($o, $pos) => ['option_key' => $o->option_key, 'option_text' => $o->option_text, 'is_correct' => (bool)$o->is_correct, 'option_order' => $pos + 1])->values()->all()]]);
            }
            AuditLogger::record('attempt.created', $attempt, ['question_count' => count($questions)]);
            // Same reasoning as above: the returned attempt is only ever
            // read through payload(), which uses question_snapshot, so
            // there's no need to eager-load the question/options relation
            // (that would re-fetch every option row for every question
            // that was just snapshotted, for nothing).
            return $attempt->load('questions', 'answers');
        });
    }
    public function saveAnswer(StudentExamAttempt $a, ExamAttemptQuestion $aq, array $selected): ExamAnswer
    {
        if ($a->status !== 'ACTIVE' || $a->expired()) throw ValidationException::withMessages(['attempt' => 'This attempt is no longer accepting answers.']);
        $allowed = $aq->question->options()->pluck('option_key')->all();
        if (array_diff($selected, $allowed)) throw ValidationException::withMessages(['selected_options' => 'One or more selected options are invalid.']);
        return ExamAnswer::updateOrCreate(['attempt_id' => $a->id, 'exam_attempt_question_id' => $aq->id], ['selected_options' => array_values(array_unique($selected)), 'answered_at' => now()]);
    }
    public function submit(StudentExamAttempt $a, array $answers = []): StudentExamAttempt
    {
        return DB::transaction(function () use ($a, $answers) {
            if ($a->status === 'SUBMITTED') return $a;
            if ($a->status !== 'ACTIVE') throw ValidationException::withMessages(['attempt' => 'Attempt cannot be submitted in its current state.']);

            // Persist every question's final selected option(s) here, in the
            // same request/transaction as the submission itself — instead of
            // relying on a separate "save as you go" call per option click
            // (which used to show a per-question "Saving…" indicator and
            // could silently fail on a flaky connection long before the
            // student ever pressed Submit, leaving that question ungraded).
            $questions = $a->questions()->get()->keyBy('id');
            foreach ($answers as $answer) {
                $aq = $questions->get($answer['exam_attempt_question_id'] ?? null);
                if (!$aq) continue;
                $allowed = collect($aq->question_snapshot['options'] ?? [])->pluck('option_key')->all();
                $selected = array_values(array_unique(array_intersect($answer['selected_options'] ?? [], $allowed)));
                ExamAnswer::updateOrCreate(
                    ['attempt_id' => $a->id, 'exam_attempt_question_id' => $aq->id],
                    ['selected_options' => $selected, 'answered_at' => now()]
                );
            }

            $a->update(['status' => $a->expired() ? 'EXPIRED' : 'SUBMITTED', 'submitted_at' => now()]);
            AuditLogger::record('attempt.submitted', $a);
            // Grade and store the result the moment the student submits,
            // instead of waiting for a separate admin "process result" step
            // per attempt — the student (and admin) should see the result
            // appear immediately, not after a manual follow-up action.
            (new ResultService)->process($a);
            return $a->fresh();
        });
    }
}