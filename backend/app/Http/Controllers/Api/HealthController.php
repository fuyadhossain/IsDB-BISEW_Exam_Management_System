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

class HealthController { public function __invoke(){return ApiResponse::success(['status'=>'ok'],'API is running');} }
