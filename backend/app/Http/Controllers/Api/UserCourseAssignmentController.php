<?php
namespace App\Http\Controllers\Api;
use App\Models\{Batch,Course,Tsp,Round,Element,Role,Permission,Exam,ExamResult,ExamSet,ExamViolation,Question,QuestionImport,QuestionOption,Student,StudentExamAttempt,User,UserCourse,ExamAttemptQuestion,BatchStudent,Module,CompetencyUnit,Subject};
use App\Services\{AuditLogger,AttemptService,CatalogUpdateService,ExamService,HierarchyService,ImportService,QuestionBankService,ResultAuthorizationService,ResultService,StudentAuthService,UserCourseAssignmentService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class UserCourseAssignmentController {
    private function visible(int|string $id): UserCourse { return UserCourse::whereHas('user', fn($q) => $q->excludeDeveloperAccounts())->with(['user:id,name,email','course:id,code,name','assignedByUser:id,name,email'])->findOrFail($id); }
    public function index() { return ApiResponse::success(UserCourse::whereHas('user', fn($q) => $q->excludeDeveloperAccounts())->with(['user:id,name,email','course:id,code,name','assignedByUser:id,name,email'])->latest()->paginate(20)); }
    public function show($id) { return ApiResponse::success($this->visible($id)); }
    public function store(Request $r) { $d=$r->validate(['user_id'=>'required|integer|exists:users,id','course_id'=>'required|integer|exists:courses,id']); return ApiResponse::success((new UserCourseAssignmentService)->assign($d['user_id'],$d['course_id'],$r->user()?->id),'Course assignment saved',201); }
    public function update(Request $r,$id) { $d=$r->validate(['status'=>'required|in:ACTIVE,INACTIVE']); return ApiResponse::success((new UserCourseAssignmentService)->changeStatus($this->visible($id),$d['status'],$r->user()?->id),'Course assignment status updated'); }
}
