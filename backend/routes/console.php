<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use App\Models\{Course, Question, QuestionOption, QuestionImport, QuestionImportRow, ExamAttemptQuestion};

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/**
 * Dev/test utility: wipe the Question Bank for a course (and, optionally,
 * the CSV import history) so a CSV can be re-imported against a clean
 * slate while iterating on the import logic. Never run this against real
 * exam data — it refuses to touch questions already used in a live exam
 * attempt.
 *
 * Usage:
 *   php artisan questions:reset PWAD              # asks for confirmation
 *   php artisan questions:reset PWAD --force      # skips confirmation
 *   php artisan questions:reset PWAD --with-history --force
 */
Artisan::command('questions:reset {course} {--with-history} {--force}', function (string $course) {
    $courseModel = Course::query()->whereRaw('LOWER(code) = ?', [strtolower($course)])->first();
    if (!$courseModel) {
        $this->error("No course found with code \"{$course}\".");
        return 1;
    }

    $questionIds = Question::where('course_id', $courseModel->id)->pluck('id');
    $count = $questionIds->count();

    if ($count === 0) {
        $this->info("No questions found for course {$courseModel->code}. Nothing to do.");
    } else {
        // Never silently delete questions that already belong to a real
        // exam attempt snapshot — that would corrupt a student's history.
        $inUse = ExamAttemptQuestion::whereIn('question_id', $questionIds)->count();
        if ($inUse > 0) {
            $this->error("Refusing to delete: {$inUse} of these questions are already referenced by exam attempts. This command is for pre-launch test data only.");
            return 1;
        }

        $this->warn("This will permanently delete {$count} question(s) (and their options) for course {$courseModel->code}.");
        if (!$this->option('force') && !$this->confirm('Continue?')) {
            $this->comment('Aborted, nothing was deleted.');
            return 0;
        }

        DB::transaction(function () use ($questionIds) {
            QuestionOption::whereIn('question_id', $questionIds)->delete();
            Question::whereIn('id', $questionIds)->delete();
        });
        $this->info("Deleted {$count} question(s) and their options for course {$courseModel->code}.");
    }

    if ($this->option('with-history')) {
        $importIds = QuestionImport::pluck('id');
        DB::transaction(function () use ($importIds) {
            QuestionImportRow::whereIn('import_id', $importIds)->delete();
            QuestionImport::whereIn('id', $importIds)->delete();
        });
        $this->info("Cleared {$importIds->count()} question import history record(s).");
    }
})->purpose('Delete all Question Bank records for a course (dev/test reset before re-importing a CSV)');
