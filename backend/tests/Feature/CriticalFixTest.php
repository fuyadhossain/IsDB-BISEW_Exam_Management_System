<?php
namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use App\Models\{User,Role,Permission,Course,Tsp,Round,Batch,ExamSet,Exam,Student,StudentExamAttempt,ExamResult,Subject,Module,CompetencyUnit,Element,Question,QuestionImport};

class CriticalFixTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        /** @var User $user */
        $user = User::factory()->create();
        $user->roles()->attach(Role::create(['name' => 'SUPER_ADMIN']));
        return $user;
    }

    private function resultFixture(): ExamResult { $course=Course::create(['code'=>'RC-'.uniqid(),'name'=>'Result Course','duration_months'=>6,'status'=>'ACTIVE']); $t=Tsp::create(['code'=>'RT-'.uniqid(),'name'=>'TSP','status'=>'ACTIVE']); $round=Round::create(['code'=>'RR-'.uniqid(),'name'=>'Round','status'=>'ACTIVE']); $batch=Batch::create(['course_id'=>$course->id,'tsp_id'=>$t->id,'round_id'=>$round->id,'shift'=>'M','batch_number'=>1,'start_date'=>now()->toDateString(),'status'=>'RUNNING']); $student=Student::create(['student_id'=>'RESULT-STU','name'=>'Result Student','date_of_birth'=>'2000-01-01','status'=>'ACTIVE']); $set=ExamSet::create(['batch_id'=>$batch->id,'name'=>'Result Set','status'=>'ACTIVE']); $exam=Exam::create(['exam_set_id'=>$set->id,'exam_number'=>'RESULT-EXAM','exam_title'=>'Result Exam','exam_type'=>'MCQ','mode'=>'ONLINE','status'=>'COMPLETED','duration'=>30,'max_marks'=>25,'pass_marks'=>13]); $attempt=StudentExamAttempt::create(['student_id'=>$student->id,'exam_id'=>$exam->id,'status'=>'SUBMITTED','started_at'=>now()->subHour(),'expires_at'=>now()->subMinutes(30),'submitted_at'=>now()->subMinutes(30)]); return ExamResult::create(['attempt_id'=>$attempt->id,'student_id'=>$student->id,'exam_id'=>$exam->id,'correct_answers'=>20,'wrong_answers'=>3,'unanswered_questions'=>2,'total_marks'=>20,'percentage'=>80,'status'=>'PASS','processed_at'=>now()]); }

    private function hierarchy(): array
    {
        $course = Course::create(['code' => 'C-'.uniqid(), 'name' => 'Course', 'duration_months' => 6, 'status' => 'ACTIVE']);
        $subject = Subject::create(['course_id' => $course->id, 'name' => 'Subject', 'status' => 'ACTIVE']);
        $module = Module::create(['subject_id' => $subject->id, 'name' => 'Module', 'status' => 'ACTIVE']);
        $cu = CompetencyUnit::create(['module_id' => $module->id, 'course_id' => $course->id, 'name' => 'CU', 'status' => 'ACTIVE']);
        $element = Element::create(['competency_unit_id' => $cu->id, 'name' => 'Element']);
        return compact('course', 'subject', 'module', 'cu', 'element');
    }

    public function test_unauthenticated_admin_and_student_api_requests_return_json_401(): void
    {
        $this->getJson('/api/v1/admin/questions')->assertStatus(401)->assertJsonPath('success', false)->assertJsonMissing(['exception']);
        $this->getJson('/api/v1/student/me')->assertStatus(401)->assertJsonPath('success', false)->assertJsonMissing(['trace']);
    }

    public function test_student_cannot_access_admin_question_api(): void { $student=Student::create(['student_id'=>'AUD-STU','name'=>'Student','date_of_birth'=>'2000-01-01','status'=>'ACTIVE']); $this->actingAs($student,'sanctum')->getJson('/api/v1/admin/questions')->assertStatus(403); }

    public function test_user_without_permission_is_rejected(): void { /** @var User $user */ $user=User::factory()->create(); $role=Role::create(['name'=>'CONSULTANT']); $user->roles()->attach($role); $this->actingAs($user,'sanctum')->getJson('/api/v1/admin/questions')->assertStatus(403); }

    public function test_permission_resolution_and_super_admin_bypass_work(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('success', true);
        /** @var User $user */
        $user = User::factory()->create();
        $role = Role::create(['name' => 'CONTENT_EDITOR']);
        $permission = Permission::create(['name' => 'questions.view', 'description' => 'View questions']);
        $role->permissions()->attach($permission);
        $user->roles()->attach($role);
        $this->assertTrue($user->hasPermission('questions.view'));
        $this->assertContains('questions.view', $user->permissionNames()->all());
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/admin/questions')->assertOk();
    }

    public function test_catalog_update_ignores_unexpected_attributes_but_updates_allowed_fields(): void
    {
        $admin = $this->admin();
        $course = $this->hierarchy()['course'];
        $originalCreated = $course->created_at;
        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/courses/'.$course->id, [
            'name' => 'Updated Course',
            'created_at' => '2000-01-01 00:00:00',
            'password' => 'unexpected',
        ])->assertOk()->assertJsonPath('data.name', 'Updated Course');
        $course->refresh();
        $this->assertSame('Updated Course', $course->name);
        $this->assertEquals($originalCreated?->format('Y-m-d H:i:s'), $course->created_at?->format('Y-m-d H:i:s'));
    }

    public function test_question_bank_rejects_duplicate_options_and_derives_hierarchy(): void
    {
        $admin = $this->admin();
        $h = $this->hierarchy();
        $payload = ['element_id' => $h['element']->id, 'question_code' => 'Q-'.uniqid(), 'question_text' => 'Question', 'question_type' => 'SINGLE_CORRECT', 'difficulty' => 'MEDIUM', 'marks' => 1, 'status' => 'ACTIVE', 'options' => [
            ['option_key' => 'A', 'option_text' => 'One', 'is_correct' => true],
            ['option_key' => 'A', 'option_text' => 'Duplicate', 'is_correct' => false],
        ]];
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/questions', $payload)->assertStatus(422);
        $this->assertSame(0, Question::count());
        $payload['options'][1] = ['option_key' => 'B', 'option_text' => 'Two', 'is_correct' => false];
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/questions', $payload)->assertCreated();
        $this->assertSame($h['course']->id, $response->json('data.course_id'));
        $this->assertSame($h['subject']->id, $response->json('data.subject_id'));
        $this->assertSame($h['module']->id, $response->json('data.module_id'));
        $this->assertSame($h['cu']->id, $response->json('data.competency_unit_id'));
    }

    public function test_invalid_csv_file_type_is_rejected(): void { $admin=$this->admin(); $this->actingAs($admin,'sanctum')->post('/api/v1/admin/question-imports',['file'=>UploadedFile::fake()->create('questions.pdf',100,'application/pdf')])->assertStatus(422)->assertJsonPath('success',false); }

    public function test_manual_duplicate_question_is_rejected_by_shared_core(): void { $admin=$this->admin(); $h=$this->hierarchy(); $payload=['element_id'=>$h['element']->id,'question_code'=>'DUP-1','question_text'=>'Duplicate text','question_type'=>'SINGLE_CORRECT','difficulty'=>'MEDIUM','marks'=>1,'status'=>'ACTIVE','options'=>[['option_key'=>'A','option_text'=>'Yes','is_correct'=>true],['option_key'=>'B','option_text'=>'No','is_correct'=>false]]]; $this->actingAs($admin,'sanctum')->postJson('/api/v1/admin/questions',$payload)->assertCreated(); $payload['question_code']='DUP-2'; $this->actingAs($admin,'sanctum')->postJson('/api/v1/admin/questions',$payload)->assertStatus(422); $this->assertSame(1,Question::count()); }

    public function test_invalid_csv_headers_are_rejected_without_creating_questions(): void { $admin=$this->admin(); Storage::fake('local'); $response=$this->actingAs($admin,'sanctum')->post('/api/v1/admin/question-imports',['file'=>UploadedFile::fake()->createWithContent('invalid.csv', "wrong,headers\n1,2\n")]); $response->assertStatus(422)->assertJsonPath('success',false); $this->assertSame(0,Question::count()); $this->assertSame('FAILED',QuestionImport::firstOrFail()->status); }

    public function test_csv_import_validates_headers_rows_and_private_storage(): void
    {
        Storage::fake('local');
        $admin = $this->admin();
        $h = $this->hierarchy();
        $csv = "element_id,question_code,question_text,question_type,difficulty,marks,options,correct_options\n".
            "{$h['element']->id},CSV-1,Imported question,SINGLE_CORRECT,MEDIUM,1,\"A:Yes|B:No\",A\n".
            "{$h['element']->id},CSV-2,Bad imported question,SINGLE_CORRECT,MEDIUM,1,\"A:Yes|A:Duplicate\",A\n";
        $response = $this->actingAs($admin, 'sanctum')->post('/api/v1/admin/question-imports', ['file' => UploadedFile::fake()->createWithContent('questions.csv', $csv)])->assertCreated();
        $import = QuestionImport::firstOrFail();
        $this->assertSame(2, $import->total_rows);
        $this->assertSame(1, $import->successful_rows);
        $this->assertSame(1, $import->failed_rows);
        $this->assertSame('COMPLETED_WITH_ERRORS', $import->status);
        $this->assertTrue(Storage::disk('local')->exists($import->file_path));
        $this->assertStringNotContainsString('file_path', json_encode($response->json('data')));
        $this->assertCount(1, $import->rows()->where('status', 'FAILED')->get());
    }

    public function test_non_super_admin_result_access_is_denied_until_course_assignment_is_approved(): void
    {
        $permission = Permission::create(['name' => 'results.view', 'description' => 'View results']);
        $role = Role::create(['name' => 'CONSULTANT']);
        $role->permissions()->attach($permission);
        /** @var User $user */
        $user = User::factory()->create();
        $user->roles()->attach($role);
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/admin/results')->assertOk()->assertJsonCount(0, 'data.data');
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/admin/results/1')->assertStatus(403);
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/admin/attempts/1/process-result')->assertStatus(403);
        $superAdmin=$this->admin(); $result=$this->resultFixture(); $this->actingAs($superAdmin, 'sanctum')->getJson('/api/v1/admin/results')->assertOk(); $this->actingAs($superAdmin, 'sanctum')->getJson('/api/v1/admin/results/'.$result->id)->assertOk();
    }
}
