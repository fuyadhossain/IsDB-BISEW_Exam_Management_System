<?php
namespace App\Http\Controllers\Api;

use App\Models\Question;
use App\Services\{AuditLogger, CourseScopeService, QuestionBankService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class QuestionController
{
    public function index(Request $r)
    {
        $q = (new CourseScopeService)->catalog(Question::query(), 'questions', $r->user());
        foreach (['course_id','subject_id','module_id','competency_unit_id','element_id','question_type','difficulty','status'] as $f) if ($r->filled($f)) $q->where($f, $r->input($f));
        if ($r->filled('search')) $q->where(fn ($x) => $x->where('question_code', 'like', '%'.$r->search.'%')->orWhere('question_text', 'like', '%'.$r->search.'%'));
        // Questions belong to the course/subject/module/CU/element hierarchy,
        // not to a batch or round directly. A "round" filter here means:
        // only show questions for courses that have at least one batch in
        // the selected round.
        if ($r->filled('round_id')) {
            $q->whereIn('course_id', \App\Models\Batch::where('round_id', $r->input('round_id'))->pluck('course_id'));
        }
        return ApiResponse::success($q->with(['options' => fn ($x) => $x->orderBy('option_order'), 'course:id,code,name', 'subject:id,name', 'module:id,name', 'competencyUnit:id,name', 'element:id,name'])->paginate(min((int) $r->input('per_page', 20), config('isdb.pagination_max'))));
    }

    public function store(Request $r)
    {
        $data = $r->all();
        abort_unless($r->user()->isSuperAdmin() || $r->user()->activeCourses()->whereKey((int) ($data['course_id'] ?? 0))->exists(), 403, 'This course is outside your assigned scope.');
        // The admin "Add question" form has no question_code field (it is an
        // internal reference code, not something an author types), so
        // auto-generate a unique one when the client did not supply it.
        if (empty($data['question_code'])) {
            $data['question_code'] = 'Q-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
        }
        $q = QuestionBankService::create($data);
        AuditLogger::record('question.created', $q);
        return ApiResponse::success($q, 'Question created', 201);
    }

    public function show(Request $r, $id)
    {
        $q = Question::with('options','element.competencyUnit.module.subject.course')->findOrFail($id);
        (new CourseScopeService)->assertQuestion($r->user(), $q);
        return ApiResponse::success($q);
    }

    public function update(Request $r, $id)
    {
        $q = Question::findOrFail($id);
        (new CourseScopeService)->assertQuestion($r->user(), $q);
        $x = QuestionBankService::update($q, $r->all());
        AuditLogger::record('question.updated', $x);
        return ApiResponse::success($x);
    }

    public function student($id)
    {
        $q = Question::with(['options' => fn ($x) => $x->orderBy('option_order')])->findOrFail($id);
        return ApiResponse::success(['id'=>$q->id,'question_text'=>$q->question_text,'question_type'=>$q->question_type,'options'=>$q->options->map(fn($o)=>['option_key'=>$o->option_key,'option_text'=>$o->option_text,'option_order'=>$o->option_order])]);
    }
}