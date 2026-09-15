<?php
namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use App\Models\{Batch,CompetencyUnit,Course,Element,Exam,ExamResult,ExamSet,Module,Permission,Role,Round,Student,StudentExamAttempt,Subject,Tsp,User,UserCourse};
use App\Services\{DeveloperSuperAdminService,UserCourseAssignmentService};

class AuthorizationAndDeveloperTest extends TestCase
{
    use RefreshDatabase;

    private function userWithPermissions(string $roleName, array $permissions): User
    {
        $role = Role::create(['name' => $roleName]);
        $permissionIds = [];
        foreach ($permissions as $name) $permissionIds[] = Permission::firstOrCreate(['name' => $name])->id;
        $role->permissions()->sync($permissionIds);
        $user = User::factory()->create();
        $user->roles()->attach($role);
        return $user;
    }

    private function superAdmin(): User
    {
        $role = Role::firstOrCreate(['name' => 'SUPER_ADMIN']);
        $user = User::factory()->create();
        $user->roles()->attach($role);
        return $user;
    }

    private function course(string $suffix): Course
    {
        $course = Course::create(['code' => 'AUTH-'.$suffix, 'name' => 'Authorization '.$suffix, 'duration_months' => 6, 'status' => 'ACTIVE']);
        $tsp = Tsp::create(['code' => 'TSP-'.$suffix, 'name' => 'TSP '.$suffix, 'status' => 'ACTIVE']);
        $round = Round::create(['code' => 'ROUND-'.$suffix, 'name' => 'Round '.$suffix, 'status' => 'ACTIVE']);
        $batch = Batch::create(['course_id' => $course->id, 'tsp_id' => $tsp->id, 'round_id' => $round->id, 'shift' => 'M', 'batch_number' => 1, 'start_date' => now()->toDateString(), 'status' => 'RUNNING']);
        return $course->setRelation('testBatch', $batch);
    }

    private function resultFor(Course $course, string $suffix): ExamResult
    {
        $batch = $course->getRelation('testBatch');
        $set = ExamSet::create(['batch_id' => $batch->id, 'name' => 'Set '.$suffix, 'status' => 'ACTIVE']);
        $exam = Exam::create(['exam_set_id' => $set->id, 'exam_number' => 'EXAM-'.$suffix, 'exam_title' => 'Exam '.$suffix, 'exam_type' => 'MCQ', 'mode' => 'ONLINE', 'status' => 'COMPLETED', 'duration' => 30, 'max_marks' => 25, 'pass_marks' => 13]);
        $student = Student::create(['student_id' => 'STU-'.$suffix, 'name' => 'Student '.$suffix, 'date_of_birth' => '2000-01-01', 'status' => 'ACTIVE']);
        $attempt = StudentExamAttempt::create(['student_id' => $student->id, 'exam_id' => $exam->id, 'status' => 'SUBMITTED', 'started_at' => now()->subHour(), 'expires_at' => now()->subMinutes(30), 'submitted_at' => now()->subMinutes(30)]);
        return ExamResult::create(['attempt_id' => $attempt->id, 'student_id' => $student->id, 'exam_id' => $exam->id, 'correct_answers' => 20, 'wrong_answers' => 3, 'unanswered_questions' => 2, 'total_marks' => 20, 'percentage' => 80, 'status' => 'PASS', 'processed_at' => now()]);
    }

    public function test_assignment_lifecycle_and_scoped_result_access_are_enforced(): void
    {
        $operator = $this->superAdmin();
        $consultant = $this->userWithPermissions('CONSULTANT', ['results.view', 'results.create']);
        $courseA = $this->course('A');
        $courseB = $this->course('B');
        $resultA = $this->resultFor($courseA, 'A');
        $resultB = $this->resultFor($courseB, 'B');

        $first = $this->actingAs($operator, 'sanctum')->postJson('/api/v1/admin/user-courses', ['user_id' => $consultant->id, 'course_id' => $courseA->id]);
        $first->assertCreated();
        $this->actingAs($operator, 'sanctum')->postJson('/api/v1/admin/user-courses', ['user_id' => $consultant->id, 'course_id' => $courseA->id])->assertStatus(422);
        $this->assertSame(1, UserCourse::count());

        $this->actingAs($consultant, 'sanctum')->getJson('/api/v1/admin/results')->assertOk()->assertJsonCount(1, 'data.data')->assertJsonPath('data.data.0.id', $resultA->id);
        $this->actingAs($consultant, 'sanctum')->getJson('/api/v1/admin/results/'.$resultA->id)->assertOk();
        $this->actingAs($consultant, 'sanctum')->getJson('/api/v1/admin/results/'.$resultB->id)->assertStatus(403);
        $this->actingAs($consultant, 'sanctum')->postJson('/api/v1/admin/attempts/'.$resultB->attempt_id.'/process-result')->assertStatus(403);
        $this->actingAs($consultant, 'sanctum')->postJson('/api/v1/admin/attempts/'.$resultA->attempt_id.'/process-result')->assertCreated();

        $assignment = UserCourse::firstOrFail();
        $this->actingAs($operator, 'sanctum')->patchJson('/api/v1/admin/user-courses/'.$assignment->id, ['status' => 'INACTIVE'])->assertOk();
        $this->actingAs($consultant, 'sanctum')->getJson('/api/v1/admin/results')->assertOk()->assertJsonCount(0, 'data.data');
        $this->actingAs($consultant, 'sanctum')->getJson('/api/v1/admin/results/'.$resultA->id)->assertStatus(403);
        $this->actingAs($operator, 'sanctum')->patchJson('/api/v1/admin/user-courses/'.$assignment->id, ['status' => 'ACTIVE'])->assertOk();
        $this->actingAs($consultant, 'sanctum')->getJson('/api/v1/admin/results/'.$resultA->id)->assertOk();

        $this->actingAs($operator, 'sanctum')->getJson('/api/v1/admin/results')->assertOk()->assertJsonCount(2, 'data.data');
        $this->actingAs($consultant, 'sanctum')->getJson('/api/v1/admin/user-courses')->assertStatus(403);
    }

    public function test_assigned_admin_is_scoped_and_unassigned_admin_is_empty(): void { $admin=$this->userWithPermissions('ADMIN',['results.view','results.create']); $unassigned=$this->userWithPermissions('ADMIN-EMPTY',['results.view','results.create']); $courseA=$this->course('ADMIN-A'); $courseB=$this->course('ADMIN-B'); $resultA=$this->resultFor($courseA,'ADMIN-A'); $resultB=$this->resultFor($courseB,'ADMIN-B'); (new UserCourseAssignmentService)->assign($admin->id,$courseA->id); $this->actingAs($admin,'sanctum')->getJson('/api/v1/admin/results')->assertOk()->assertJsonCount(1,'data.data')->assertJsonPath('data.data.0.id',$resultA->id); $this->actingAs($admin,'sanctum')->getJson('/api/v1/admin/results/'.$resultB->id)->assertStatus(403); $this->actingAs($unassigned,'sanctum')->getJson('/api/v1/admin/results')->assertOk()->assertJsonCount(0,'data.data'); }

    public function test_curriculum_updates_cannot_cross_course_parents(): void
    {
        $admin = $this->userWithPermissions('CURRICULUM_ADMIN', ['curriculum.update']);
        $courseA = $this->course('HIER-A');
        $courseB = $this->course('HIER-B');
        $subjectA = Subject::create(['course_id' => $courseA->id, 'name' => 'Subject A', 'status' => 'ACTIVE']);
        $subjectB = Subject::create(['course_id' => $courseB->id, 'name' => 'Subject B', 'status' => 'ACTIVE']);
        $moduleA = Module::create(['subject_id' => $subjectA->id, 'name' => 'Module A', 'status' => 'ACTIVE']);
        $moduleB = Module::create(['subject_id' => $subjectB->id, 'name' => 'Module B', 'status' => 'ACTIVE']);
        $unitA = CompetencyUnit::create(['module_id' => $moduleA->id, 'course_id' => $courseA->id, 'name' => 'Unit A', 'status' => 'ACTIVE']);
        $unitB = CompetencyUnit::create(['module_id' => $moduleB->id, 'course_id' => $courseB->id, 'name' => 'Unit B', 'status' => 'ACTIVE']);
        $elementA = Element::create(['competency_unit_id' => $unitA->id, 'name' => 'Element A']);
        (new UserCourseAssignmentService)->assign($admin->id, $courseA->id);

        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/modules/'.$moduleA->id, ['subject_id' => $subjectB->id])->assertStatus(403);
        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/competency-units/'.$unitA->id, ['module_id' => $moduleB->id])->assertStatus(403);
        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/elements/'.$elementA->id, ['competency_unit_id' => $unitB->id])->assertStatus(403);
        $this->actingAs($admin, 'sanctum')->putJson('/api/v1/admin/modules/'.$moduleA->id, ['name' => 'Updated Module A'])->assertOk();
    }

    public function test_hidden_developer_accounts_are_environment_driven_idempotent_and_not_listed(): void
    {
        config()->set('isdb.developer_super_admin.accounts.1', ['enabled' => true, 'email' => 'developer-one@example.test', 'password' => 'OnlyInRuntime-1!']);
        config()->set('isdb.developer_super_admin.accounts.2', ['enabled' => true, 'email' => 'developer-two@example.test', 'password' => 'OnlyInRuntime-2!']);
        DeveloperSuperAdminService::provision();
        DeveloperSuperAdminService::provision();

        $one = User::where('email', 'developer-one@example.test')->firstOrFail();
        $two = User::where('email', 'developer-two@example.test')->firstOrFail();
        $this->assertSame(2, User::whereIn('email', [$one->email, $two->email])->count());
        $this->assertTrue(Hash::check('OnlyInRuntime-1!', $one->password));
        $this->assertTrue(Hash::check('OnlyInRuntime-2!', $two->password));
        $this->assertTrue($one->isSuperAdmin());
        $this->assertTrue($two->isSuperAdmin());

        $login = $this->postJson('/api/v1/auth/login', ['email' => $one->email, 'password' => 'OnlyInRuntime-1!'])->assertOk();
        $this->assertStringNotContainsString('OnlyInRuntime-1!', json_encode($login->json()));
        $this->actingAs($one, 'sanctum')->getJson('/api/v1/auth/me')->assertOk()->assertJsonMissing(['roles'])->assertJsonMissing(['permissions']);

        $normalAdmin = $this->superAdmin();
        $list = $this->actingAs($normalAdmin, 'sanctum')->getJson('/api/v1/admin/users')->assertOk();
        $this->assertStringNotContainsString($one->email, json_encode($list->json()));
        $this->assertStringNotContainsString($two->email, json_encode($list->json()));
        $search = $this->actingAs($normalAdmin, 'sanctum')->getJson('/api/v1/admin/users?search=developer')->assertOk();
        $this->assertCount(0, $search->json('data.data'));
    }
}
