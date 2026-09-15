<?php
namespace Database\Seeders;

use App\Models\{Batch, BatchStudent, CompetencyUnit, Course, Element, Exam, ExamSet, ExamViolation, Module, Permission, Question, QuestionOption, Role, Round, Student, Subject, Tsp, User};
use App\Services\{AttemptService, ExamPaperService, ExamService, ResultService, UserCourseAssignmentService};
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Seeds a full, click-through demo dataset: catalog hierarchy, MCQ +
 * Descriptive questions, a READY online (MID) exam, an OFFLINE (MONTHLY)
 * exam with a generated printable paper, a real completed student
 * attempt processed into a result, a sample violation, and a
 * course-scoped consultant admin. Only runs outside production.
 */
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->warn('Skipping DemoDataSeeder in production.');
            return;
        }

        // ---- Catalog hierarchy -------------------------------------------------
        $course = Course::firstOrCreate(['code' => 'WD-101'], ['name' => 'Web Development Fundamentals', 'duration_months' => 6, 'status' => 'ACTIVE']);
        $tsp = Tsp::firstOrCreate(['code' => 'TSP-STD'], ['name' => 'Standard TSP', 'status' => 'ACTIVE']);
        $round = Round::firstOrCreate(['code' => 'R-2026-1'], ['name' => 'Round 1 - 2026', 'status' => 'ACTIVE']);
        $batch = Batch::firstOrCreate(
            ['course_id' => $course->id, 'tsp_id' => $tsp->id, 'round_id' => $round->id, 'shift' => 'MORNING', 'batch_number' => 1],
            ['start_date' => now()->subMonth()->toDateString(), 'status' => 'RUNNING']
        );

        $subject = Subject::firstOrCreate(['course_id' => $course->id, 'name' => 'Web Fundamentals'], ['status' => 'ACTIVE']);
        $module = Module::firstOrCreate(['subject_id' => $subject->id, 'name' => 'Frontend Basics'], ['status' => 'ACTIVE']);

        $cuNames = ['HTML Basics', 'CSS Basics', 'JavaScript Basics', 'DOM Manipulation', 'Responsive Design'];
        $cus = collect($cuNames)->map(fn ($name) => CompetencyUnit::firstOrCreate(
            ['module_id' => $module->id, 'name' => $name],
            ['course_id' => $course->id, 'status' => 'ACTIVE']
        ));
        $elements = $cus->map(fn ($cu) => Element::firstOrCreate(['competency_unit_id' => $cu->id, 'name' => $cu->name.' - Core Concepts']));

        // ---- Questions: 6 MCQ per competency unit + 1 Descriptive on 2 of them --
        $cus->values()->each(function (CompetencyUnit $cu, int $i) use ($course, $subject, $module, $elements) {
            $element = $elements[$i];
            for ($n = 1; $n <= 6; $n++) {
                $code = 'DEMO-MCQ-'.$cu->id.'-'.$n;
                if (Question::where('question_code', $code)->exists()) continue;
                $q = Question::create([
                    'course_id' => $course->id, 'subject_id' => $subject->id, 'module_id' => $module->id,
                    'competency_unit_id' => $cu->id, 'element_id' => $element->id,
                    'question_code' => $code, 'question_text' => "[{$cu->name}] Sample MCQ question #{$n}",
                    'question_type' => 'SINGLE_CORRECT', 'difficulty' => 'MEDIUM', 'marks' => 1, 'status' => 'ACTIVE',
                ]);
                QuestionOption::create(['question_id' => $q->id, 'option_key' => 'A', 'option_text' => 'Correct answer', 'is_correct' => true, 'option_order' => 1]);
                QuestionOption::create(['question_id' => $q->id, 'option_key' => 'B', 'option_text' => 'Distractor 1', 'is_correct' => false, 'option_order' => 2]);
                QuestionOption::create(['question_id' => $q->id, 'option_key' => 'C', 'option_text' => 'Distractor 2', 'is_correct' => false, 'option_order' => 3]);
            }
            if ($i < 2) {
                $descCode = 'DEMO-DESC-'.$cu->id;
                if (!Question::where('question_code', $descCode)->exists()) {
                    Question::create([
                        'course_id' => $course->id, 'subject_id' => $subject->id, 'module_id' => $module->id,
                        'competency_unit_id' => $cu->id, 'element_id' => $element->id,
                        'question_code' => $descCode, 'question_text' => "[{$cu->name}] Explain the concept in your own words with an example.",
                        'question_type' => 'DESCRIPTIVE', 'difficulty' => 'MEDIUM', 'marks' => 5, 'status' => 'ACTIVE',
                    ]);
                }
            }
        });

        // ---- Students, enrolled in the batch ------------------------------------
        $students = collect(range(1, 5))->map(fn ($i) => Student::firstOrCreate(
            ['student_id' => 'DEMO-STU-'.$i],
            ['name' => 'Demo Student '.$i, 'date_of_birth' => '2001-0'.min($i, 9).'-15', 'status' => 'ACTIVE']
        ));
        $students->each(fn ($s) => BatchStudent::firstOrCreate(
            ['batch_id' => $batch->id, 'student_id' => $s->id],
            ['assigned_at' => now(), 'status' => 'ACTIVE']
        ));

        // ---- Admin + course-scoped consultant -----------------------------------
        $admin = User::where('email', 'admin@example.test')->first();
        $consultant = User::firstOrCreate(['email' => 'consultant@example.test'], ['name' => 'Demo Consultant', 'password' => Hash::make('Consultant@123')]);
        $consultantRole = Role::firstOrCreate(['name' => 'Consultant'], ['description' => 'Scoped course consultant']);
        $consultantRole->permissions()->syncWithoutDetaching(Permission::whereIn('name', [
            'courses.view', 'tsps.view', 'rounds.view', 'curriculum.view', 'violations.view',
            'batches.view', 'batches.create', 'batches.update',
            'students.view', 'students.create', 'students.update',
            'questions.view', 'questions.create', 'questions.update',
            'exam_sets.view', 'exam_sets.create', 'exam_sets.update',
            'exams.view', 'exams.create', 'exams.update', 'exams.configure', 'exams.status',
            'results.view',
        ])->pluck('id'));
        $consultant->roles()->syncWithoutDetaching([$consultantRole->id]);
        if ($admin && !\App\Models\UserCourse::where('user_id', $consultant->id)->where('course_id', $course->id)->where('status', 'ACTIVE')->exists()) {
            (new UserCourseAssignmentService)->assign($consultant->id, $course->id, $admin->id);
        }

        $examSet = ExamSet::firstOrCreate(['batch_id' => $batch->id, 'name' => 'Demo Exam Set'], ['status' => 'ACTIVE']);
        $examService = new ExamService;

        // ---- Exam A: MID / ONLINE, upcoming, visible in the student portal ------
        $upcoming = Exam::firstOrCreate(
            ['exam_set_id' => $examSet->id, 'exam_number' => 'MID-DEMO-1'],
            ['exam_title' => 'Mid Exam (Upcoming)', 'exam_type' => 'MID_MONTHLY', 'mode' => 'ONLINE', 'status' => 'DRAFT', 'duration' => 30, 'max_marks' => 25, 'pass_marks' => 13, 'start_at' => now()->addDay(), 'end_at' => now()->addDays(8)]
        );
        if ($upcoming->status === 'DRAFT') {
            $examService->configure($upcoming, ['subject_ids' => [$subject->id], 'module_ids' => [$module->id], 'competency_unit_ids' => $cus->pluck('id')->all()]);
            $examService->transition($upcoming, 'SCHEDULED');
            $examService->transition($upcoming, 'READY');
        }

        // ---- Exam B: MID / ONLINE, completed with a real attempt + result -------
        $completed = Exam::firstOrCreate(
            ['exam_set_id' => $examSet->id, 'exam_number' => 'MID-DEMO-2'],
            ['exam_title' => 'Mid Exam (Completed Sample)', 'exam_type' => 'MID_MONTHLY', 'mode' => 'ONLINE', 'status' => 'DRAFT', 'duration' => 30, 'max_marks' => 25, 'pass_marks' => 13, 'start_at' => now()->subHours(2), 'end_at' => now()->addHours(2)]
        );
        if ($completed->status === 'DRAFT') {
            $examService->configure($completed, ['subject_ids' => [$subject->id], 'module_ids' => [$module->id], 'competency_unit_ids' => $cus->pluck('id')->all()]);
            $examService->transition($completed, 'SCHEDULED');
            $examService->transition($completed, 'READY');
            $examService->transition($completed, 'STARTED');

            $demoStudent = $students->first();
            $attempt = (new AttemptService)->start($demoStudent, $completed->fresh());
            $attempt->loadMissing('questions.question.options');
            foreach ($attempt->questions as $i => $aq) {
                $correctKey = collect($aq->question_snapshot['options'])->firstWhere('is_correct', true)['option_key'];
                $wrongKey = collect($aq->question_snapshot['options'])->firstWhere('is_correct', false)['option_key'];
                if ($i < 18) {
                    (new AttemptService)->saveAnswer($attempt, $aq, [$correctKey]); // 18 correct
                } elseif ($i < 23) {
                    (new AttemptService)->saveAnswer($attempt, $aq, [$wrongKey]); // 5 wrong
                } // remaining 2 left unanswered
            }
            (new AttemptService)->submit($attempt->fresh());
            $examService->transition($completed->fresh(), 'ENDED');
            $examService->transition($completed->fresh(), 'PROCESSING');
            (new ResultService)->process($attempt->fresh());
            $examService->transition($completed->fresh(), 'COMPLETED');

            ExamViolation::firstOrCreate(
                ['attempt_id' => $attempt->id, 'type' => 'TAB_SWITCH'],
                ['metadata' => ['note' => 'Demo violation for UI testing'], 'occurred_at' => now()->subDays(2)]
            );
        }

        // ---- Exam C: MONTHLY / OFFLINE, with a generated printable paper --------
        $offline = Exam::firstOrCreate(
            ['exam_set_id' => $examSet->id, 'exam_number' => 'MONTHLY-DEMO-1'],
            ['exam_title' => 'Monthly Exam (Offline, Printable)', 'exam_type' => 'MONTHLY', 'mode' => 'OFFLINE', 'status' => 'DRAFT', 'duration' => 90, 'max_marks' => 25, 'pass_marks' => 13, 'start_at' => now()->addWeek(), 'end_at' => now()->addWeek()->addHours(2)]
        );
        if ($offline->status === 'DRAFT') {
            $examService->configure($offline, ['subject_ids' => [$subject->id], 'module_ids' => [$module->id], 'competency_unit_ids' => $cus->pluck('id')->all()]);
            $examService->transition($offline, 'SCHEDULED');
            $examService->transition($offline, 'READY');
            if ($admin) (new ExamPaperService)->generate($offline->fresh(), $admin);
        }

        $this->command?->info('Demo data seeded: course WD-101, batch WD-M-1, 5 students, 32 questions (30 MCQ + 2 Descriptive), 3 exams (1 upcoming online, 1 completed online with result+violation, 1 offline with a printed paper).');
        $this->command?->info('Demo logins: admin@example.test / ChangeMe!123 | consultant@example.test / Consultant@123 | student DEMO-STU-1..5 / DOB 2001-0X-15');
    }
}
