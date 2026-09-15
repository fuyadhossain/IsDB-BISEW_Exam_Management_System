<?php
namespace App\Services;
use App\Models\{AuditLog,Batch,CompetencyUnit,Element,Exam,ExamAnswer,ExamAttemptQuestion,ExamResult,ExamSet,ExamViolation,Module,Question,QuestionImport,QuestionImportRow,QuestionOption,Student,StudentExamAttempt,Subject,User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

class AuditLogger { public static function record(string $event, $subject=null, array $payload=[]): void { $actor=request()->user(); AuditLog::create(['actor_type'=>$actor?get_class($actor):null,'actor_id'=>$actor?->getKey(),'event'=>$event,'auditable_type'=>$subject?get_class($subject):null,'auditable_id'=>$subject?->getKey(),'payload'=>$payload,'ip_address'=>request()->ip(),'user_agent'=>Str::limit((string)request()->userAgent(),500)]); } }
