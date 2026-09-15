<?php
namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Models\{User,Role,Course,Tsp,Round,Batch,Student,BatchStudent,Subject,Module,CompetencyUnit,Element,Question,QuestionOption,ExamSet,Exam,ExamPaper};

class ExamTypeCompositionTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $u = User::factory()->create();
        $r = Role::create(['name' => 'SUPER_ADMIN']);
        $u->roles()->attach($r);
        return $u;
    }

    private function context(): array
    {
        $course = Course::create(['code' => 'C-'.uniqid(), 'name' => 'Course', 'duration_months' => 6, 'status' => 'ACTIVE']);
        $t = Tsp::create(['code' => 'T-'.uniqid(), 'name' => 'TSP', 'status' => 'ACTIVE']);
        $r = Round::create(['code' => 'R-'.uniqid(), 'name' => 'Round', 'status' => 'ACTIVE']);
        $b = Batch::create(['course_id' => $course->id, 'tsp_id' => $t->id, 'round_id' => $r->id, 'shift' => 'M', 'batch_number' => 1, 'start_date' => now()->toDateString(), 'status' => 'RUNNING']);
        $s = Subject::create(['course_id' => $course->id, 'name' => 'Subject', 'status' => 'ACTIVE']);
        $m = Module::create(['subject_id' => $s->id, 'name' => 'Module', 'status' => 'ACTIVE']);
        $cu = CompetencyUnit::create(['module_id' => $m->id, 'course_id' => $course->id, 'name' => 'CU', 'status' => 'ACTIVE']);
        $e = Element::create(['competency_unit_id' => $cu->id, 'name' => 'Element']);
        return compact('course', 'b', 's', 'm', 'cu', 'e');
    }

    private function seedMcq(array $c, int $count): void
    {
        for ($i = 1; $i <= $count; $i++) {
            $q = Question::create(['course_id' => $c['course']->id, 'subject_id' => $c['s']->id, 'module_id' => $c['m']->id, 'competency_unit_id' => $c['cu']->id, 'element_id' => $c['e']->id, 'question_code' => 'MCQ-'.$i.'-'.uniqid(), 'question_text' => 'MCQ '.$i, 'question_type' => 'SINGLE_CORRECT', 'difficulty' => 'MEDIUM', 'marks' => 1, 'status' => 'ACTIVE']);
            QuestionOption::create(['question_id' => $q->id, 'option_key' => 'A', 'option_text' => 'Yes', 'is_correct' => true, 'option_order' => 1]);
            QuestionOption::create(['question_id' => $q->id, 'option_key' => 'B', 'option_text' => 'No', 'is_correct' => false, 'option_order' => 2]);
        }
    }

    private function seedDescriptive(array $c, int $count): void
    {
        for ($i = 1; $i <= $count; $i++) {
            Question::create(['course_id' => $c['course']->id, 'subject_id' => $c['s']->id, 'module_id' => $c['m']->id, 'competency_unit_id' => $c['cu']->id, 'element_id' => $c['e']->id, 'question_code' => 'DESC-'.$i.'-'.uniqid(), 'question_text' => 'Explain topic '.$i, 'question_type' => 'DESCRIPTIVE', 'difficulty' => 'MEDIUM', 'marks' => 5, 'status' => 'ACTIVE']);
        }
    }

    public function test_creating_a_mid_exam_forces_online_mode(): void
    {
        $admin = $this->admin();
        $c = $this->context();
        $set = ExamSet::create(['batch_id' => $c['b']->id, 'name' => 'Set', 'status' => 'ACTIVE']);
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/exams', [
            'exam_set_id' => $set->id, 'exam_number' => 'M1', 'exam_title' => 'Mid Exam', 'exam_type' => 'MID',
            'mode' => 'OFFLINE', // client tries to force offline, server must override
            'status' => 'DRAFT', 'duration' => 60, 'max_marks' => 25, 'pass_marks' => 13,
        ])->assertCreated();
        $this->assertSame('ONLINE', $response->json('data.mode'));
    }

    public function test_creating_a_monthly_exam_forces_offline_mode(): void
    {
        $admin = $this->admin();
        $c = $this->context();
        $set = ExamSet::create(['batch_id' => $c['b']->id, 'name' => 'Set', 'status' => 'ACTIVE']);
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/exams', [
            'exam_set_id' => $set->id, 'exam_number' => 'MO1', 'exam_title' => 'Monthly Exam', 'exam_type' => 'monthly',
            'status' => 'DRAFT', 'duration' => 90, 'max_marks' => 25, 'pass_marks' => 13,
        ])->assertCreated();
        $this->assertSame('OFFLINE', $response->json('data.mode'));
    }

    public function test_mid_exam_online_attempt_generates_25_mcq_only(): void
    {
        $c = $this->context();
        $this->seedMcq($c, 25);
        $student = Student::create(['student_id' => 'STU-MID', 'name' => 'Student', 'date_of_birth' => '2000-01-01', 'status' => 'ACTIVE']);
        BatchStudent::create(['batch_id' => $c['b']->id, 'student_id' => $student->id, 'assigned_at' => now(), 'status' => 'ACTIVE']);
        $set = ExamSet::create(['batch_id' => $c['b']->id, 'name' => 'Set', 'status' => 'ACTIVE']);
        $exam = Exam::create(['exam_set_id' => $set->id, 'exam_number' => 'MID-1', 'exam_title' => 'Mid', 'exam_type' => 'MID', 'mode' => 'ONLINE', 'status' => 'STARTED', 'duration' => 30, 'max_marks' => 25, 'pass_marks' => 13]);
        $exam->subjects()->attach($c['s']->id);
        $exam->modules()->attach($c['m']->id);
        $exam->competencyUnits()->attach($c['cu']->id);
        $token = $this->postJson('/api/v1/student/login', ['student_id' => 'STU-MID', 'date_of_birth' => '2000-01-01'])->json('data.token');
        $response = $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/v1/student/exams/'.$exam->id.'/start')->assertCreated();
        $this->assertCount(25, $response->json('data.questions'));
    }

    public function test_monthly_offline_exam_cannot_be_started_online(): void
    {
        $c = $this->context();
        $this->seedMcq($c, 23);
        $this->seedDescriptive($c, 2);
        $student = Student::create(['student_id' => 'STU-MO', 'name' => 'Student', 'date_of_birth' => '2000-01-01', 'status' => 'ACTIVE']);
        BatchStudent::create(['batch_id' => $c['b']->id, 'student_id' => $student->id, 'assigned_at' => now(), 'status' => 'ACTIVE']);
        $set = ExamSet::create(['batch_id' => $c['b']->id, 'name' => 'Set', 'status' => 'ACTIVE']);
        $exam = Exam::create(['exam_set_id' => $set->id, 'exam_number' => 'MON-1', 'exam_title' => 'Monthly', 'exam_type' => 'MONTHLY', 'mode' => 'OFFLINE', 'status' => 'STARTED', 'duration' => 90, 'max_marks' => 25, 'pass_marks' => 13]);
        $exam->subjects()->attach($c['s']->id);
        $exam->modules()->attach($c['m']->id);
        $exam->competencyUnits()->attach($c['cu']->id);
        $token = $this->postJson('/api/v1/student/login', ['student_id' => 'STU-MO', 'date_of_birth' => '2000-01-01'])->json('data.token');
        $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/v1/student/exams/'.$exam->id.'/start')
            ->assertStatus(422)->assertJsonPath('success', false);
    }

    public function test_student_portal_only_lists_online_exams(): void
    {
        $c = $this->context();
        $student = Student::create(['student_id' => 'STU-LIST', 'name' => 'Student', 'date_of_birth' => '2000-01-01', 'status' => 'ACTIVE']);
        BatchStudent::create(['batch_id' => $c['b']->id, 'student_id' => $student->id, 'assigned_at' => now(), 'status' => 'ACTIVE']);
        $set = ExamSet::create(['batch_id' => $c['b']->id, 'name' => 'Set', 'status' => 'ACTIVE']);
        $online = Exam::create(['exam_set_id' => $set->id, 'exam_number' => 'ON-1', 'exam_title' => 'Mid', 'exam_type' => 'MID', 'mode' => 'ONLINE', 'status' => 'READY', 'duration' => 30, 'max_marks' => 25, 'pass_marks' => 13]);
        Exam::create(['exam_set_id' => $set->id, 'exam_number' => 'OFF-1', 'exam_title' => 'Monthly', 'exam_type' => 'MONTHLY', 'mode' => 'OFFLINE', 'status' => 'READY', 'duration' => 90, 'max_marks' => 25, 'pass_marks' => 13]);
        $token = $this->postJson('/api/v1/student/login', ['student_id' => 'STU-LIST', 'date_of_birth' => '2000-01-01'])->json('data.token');
        $response = $this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/v1/student/exams')->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($online->id, $ids);
        $this->assertCount(1, $ids);
    }

    public function test_offline_exam_paper_has_23_mcq_and_2_descriptive_without_answer_key(): void
    {
        $admin = $this->admin();
        $c = $this->context();
        $this->seedMcq($c, 23);
        $this->seedDescriptive($c, 2);
        $set = ExamSet::create(['batch_id' => $c['b']->id, 'name' => 'Set', 'status' => 'ACTIVE']);
        $exam = Exam::create(['exam_set_id' => $set->id, 'exam_number' => 'PAPER-1', 'exam_title' => 'Monthly', 'exam_type' => 'MONTHLY', 'mode' => 'OFFLINE', 'status' => 'DRAFT', 'duration' => 90, 'max_marks' => 25, 'pass_marks' => 13]);
        $exam->subjects()->attach($c['s']->id);
        $exam->modules()->attach($c['m']->id);
        $exam->competencyUnits()->attach($c['cu']->id);
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/exams/'.$exam->id.'/paper')->assertCreated();
        $questions = collect($response->json('data.questions_snapshot'));
        $this->assertCount(25, $questions);
        $this->assertCount(23, $questions->where('question_type', '!=', 'DESCRIPTIVE'));
        $this->assertCount(2, $questions->where('question_type', 'DESCRIPTIVE'));
        $this->assertEmpty($questions->firstWhere('question_type', 'DESCRIPTIVE')['options']);
        $this->assertArrayNotHasKey('is_correct', $questions->firstWhere('question_type', '!=', 'DESCRIPTIVE')['options'][0]);
        $this->assertDatabaseCount('exam_papers', 1);
    }

    public function test_user_course_assignment_records_assigned_by(): void
    {
        $admin = $this->admin();
        $consultant = User::factory()->create();
        $course = Course::create(['code' => 'AC-'.uniqid(), 'name' => 'Assign Course', 'duration_months' => 6, 'status' => 'ACTIVE']);
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/user-courses', [
            'user_id' => $consultant->id, 'course_id' => $course->id,
        ])->assertCreated();
        $this->assertSame($admin->id, $response->json('data.assigned_by'));
        $this->assertSame($admin->id, $response->json('data.assigned_by_user.id'));
    }
}
