<?php

namespace App\Console\Commands;

use App\Models\{Batch, CompetencyUnit, Course, Element, Exam, ExamResult, ExamSet, ExamViolation, Module, Question, QuestionOption, Student, StudentExamAttempt, Subject, User, UserCourse};
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-off cleanup for the "WD-101" demo course that DemoDataSeeder used to
 * create automatically (fake batches, students, questions, exams, and a
 * course-scoped "consultant@example.test" login) — none of that belongs in
 * this project (only PWAD is real). DatabaseSeeder no longer calls that
 * seeder, but anything it already wrote to the database before that change
 * is still sitting there; this deletes it, in dependency order, since every
 * foreign key here is RESTRICT (not CASCADE) and a plain `Course::delete()`
 * would just fail with a constraint violation.
 *
 * Usage: php artisan demo:remove-course --code=WD-101
 */
class RemoveDemoCourseData extends Command
{
    protected $signature = 'demo:remove-course {--code=WD-101 : The course code to remove, along with everything under it}';
    protected $description = 'Permanently deletes a demo course and every batch/student/question/exam/result under it';

    public function handle(): int
    {
        $code = $this->option('code');
        $course = Course::where('code', $code)->first();
        if (!$course) {
            $this->info("No course with code \"{$code}\" was found — nothing to remove.");
            return self::SUCCESS;
        }

        $this->warn("This will permanently delete course \"{$code}\" and every batch, student, question, exam, and result under it.");
        if (!$this->confirm('Continue?')) {
            $this->info('Cancelled — nothing was deleted.');
            return self::SUCCESS;
        }

        DB::transaction(function () use ($course) {
            $batchIds = Batch::where('course_id', $course->id)->pluck('id');
            $examSetIds = ExamSet::whereIn('batch_id', $batchIds)->pluck('id');
            $examIds = Exam::whereIn('exam_set_id', $examSetIds)->pluck('id');
            $studentIds = DB::table('batch_students')->whereIn('batch_id', $batchIds)->pluck('student_id')->unique();
            $attemptIds = StudentExamAttempt::whereIn('exam_id', $examIds)->pluck('id');

            // Deepest dependents first — every FK below is RESTRICT, so the
            // parent can't be removed while a child row still points to it.
            ExamViolation::whereIn('attempt_id', $attemptIds)->delete();
            ExamResult::whereIn('attempt_id', $attemptIds)->delete();
            // exam_answers / exam_attempt_questions / exam_evidences all
            // CASCADE off the attempt/exam, so deleting the attempt (and
            // later the exam) below already clears those automatically.
            StudentExamAttempt::whereIn('id', $attemptIds)->delete();
            Exam::whereIn('id', $examIds)->delete();
            ExamSet::whereIn('id', $examSetIds)->delete();

            $questionIds = Question::where('course_id', $course->id)->pluck('id');
            QuestionOption::whereIn('question_id', $questionIds)->delete();
            Question::whereIn('id', $questionIds)->delete();

            $moduleIds = Module::whereHas('subject', fn($q) => $q->where('course_id', $course->id))->pluck('id');
            $competencyUnitIds = CompetencyUnit::where('course_id', $course->id)->pluck('id');
            Element::whereIn('competency_unit_id', $competencyUnitIds)->delete();
            CompetencyUnit::whereIn('id', $competencyUnitIds)->delete();
            Module::whereIn('id', $moduleIds)->delete();
            Subject::where('course_id', $course->id)->delete();

            DB::table('batch_students')->whereIn('batch_id', $batchIds)->delete();
            // Only remove students who exist ONLY for this demo course — a
            // student enrolled in some other (real) batch too must stay.
            $exclusiveStudentIds = $studentIds->filter(fn($id) => !DB::table('batch_students')->where('student_id', $id)->exists());
            Student::whereIn('id', $exclusiveStudentIds)->delete();
            Batch::whereIn('id', $batchIds)->delete();

            $userCourseUserIds = UserCourse::where('course_id', $course->id)->pluck('user_id');
            UserCourse::where('course_id', $course->id)->delete();
            // The demo "consultant@example.test" account exists only for
            // this course — remove it too, but never touch a user who has
            // access to some other (real) course as well.
            foreach ($userCourseUserIds->unique() as $userId) {
                $user = User::find($userId);
                if ($user && !$user->activeCourses()->exists() && !$user->courses()->exists() && $user->email !== 'admin@example.test') {
                    $user->delete();
                }
            }

            $course->delete();
        });

        $this->info("Course \"{$code}\" and everything under it has been removed.");
        return self::SUCCESS;
    }
}
