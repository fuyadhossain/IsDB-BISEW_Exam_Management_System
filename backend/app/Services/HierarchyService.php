<?php
namespace App\Services;
use App\Models\{AuditLog,Batch,CompetencyUnit,Element,Exam,ExamAnswer,ExamAttemptQuestion,ExamResult,ExamSet,ExamViolation,Module,Question,QuestionImport,QuestionImportRow,QuestionOption,Student,StudentExamAttempt,Subject,User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

class HierarchyService { public static function fromElement(int $id): array { $e=Element::with('competencyUnit.module.subject.course')->findOrFail($id); $cu=$e->competencyUnit; $m=$cu->module; $s=$m->subject; return ['element_id'=>$e->id,'competency_unit_id'=>$cu->id,'module_id'=>$m->id,'subject_id'=>$s->id,'course_id'=>$s->course_id]; } public static function assertModuleForSubject(int $moduleId,int $subjectId): void { if(!Module::whereKey($moduleId)->where('subject_id',$subjectId)->exists()) throw ValidationException::withMessages(['module_id'=>'The module does not belong to the selected subject.']); } public static function assertCuForModule(int $cuId,int $moduleId): void { if(!CompetencyUnit::whereKey($cuId)->where('module_id',$moduleId)->exists()) throw ValidationException::withMessages(['competency_unit_id'=>'The competency unit does not belong to the selected module.']); } }
