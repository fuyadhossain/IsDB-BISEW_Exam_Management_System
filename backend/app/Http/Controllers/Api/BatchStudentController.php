<?php
namespace App\Http\Controllers\Api;
use App\Models\{Batch,Course,Tsp,Round,Element,Role,Permission,Exam,ExamResult,ExamSet,ExamViolation,Question,QuestionImport,QuestionOption,Setting,Student,StudentExamAttempt,User,UserCourse,ExamAttemptQuestion,BatchStudent,Module,CompetencyUnit,Subject};
use App\Services\{AuditLogger,AttemptService,CatalogUpdateService,CourseScopeService,ExamService,HierarchyService,ImportService,QuestionBankService,ResultAuthorizationService,ResultService,StudentAuthService,UserCourseAssignmentService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BatchStudentController { public function store(Request $r,$batchId){(new CourseScopeService)->assertCatalog($r->user(),'batches',$batchId);$d=$r->validate(['student_id'=>'required|exists:students,id','status'=>'required|in:ACTIVE,INACTIVE,TRANSFERRED']);$a=DB::transaction(function()use($batchId,$d){$batch=Batch::whereKey($batchId)->lockForUpdate()->firstOrFail();$capacity=Setting::get('security.batch_active_capacity',config('isdb.batch_active_capacity'));if($d['status']==='ACTIVE'&&$batch->assignments()->where('status','ACTIVE')->count()>=$capacity)throw ValidationException::withMessages(['student_id'=>"The batch already has the maximum of {$capacity} active students."]);return BatchStudent::create(['batch_id'=>$batch->id,'student_id'=>$d['student_id'],'assigned_at'=>now(),'status'=>$d['status']]);});return ApiResponse::success($a,'Student assigned',201);} public function index(Request $r,$batchId){(new CourseScopeService)->assertCatalog($r->user(),'batches',$batchId);return ApiResponse::success(BatchStudent::with('student:id,student_id,name')->where('batch_id',$batchId)->paginate(20));} public function update(Request $r,$id){$a=BatchStudent::with('batch')->findOrFail($id);(new CourseScopeService)->assertCatalog($r->user(),'batches',$a->batch_id);$a->update($r->validate(['status'=>'required|in:ACTIVE,INACTIVE,TRANSFERRED']));return ApiResponse::success($a->fresh());} }
