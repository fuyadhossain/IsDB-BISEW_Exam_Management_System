<?php
namespace App\Http\Controllers\Api;
use App\Models\{Batch,Course,Tsp,Round,Element,Role,Permission,Exam,ExamResult,ExamSet,ExamViolation,Question,QuestionImport,QuestionOption,Student,StudentExamAttempt,User,UserCourse,ExamAttemptQuestion,BatchStudent,Module,CompetencyUnit,Subject};
use App\Services\{AuditLogger,AttemptService,CatalogUpdateService,CourseScopeService,ExamService,HierarchyService,ImportService,QuestionBankService,ResultAuthorizationService,ResultService,StudentAuthService,UserCourseAssignmentService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ExamSetAdminController {
    public function update(Request $r,$id) { $set=ExamSet::findOrFail($id); (new CourseScopeService)->assertExamSet($r->user(),$set); $set->update($r->validate(['name'=>'sometimes|string|max:255','code'=>'nullable|string|max:100','status'=>'sometimes|string|max:30'])); AuditLogger::record('exam_set.updated',$set); return ApiResponse::success($set->fresh()); }
}
