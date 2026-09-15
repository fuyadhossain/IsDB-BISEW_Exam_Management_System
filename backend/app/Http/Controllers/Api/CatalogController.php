<?php

namespace App\Http\Controllers\Api;

use App\Models\{Batch, Course, Tsp, Round, Element, Role, Permission, Exam, ExamResult, ExamSet, ExamViolation, Question, QuestionImport, QuestionOption, Setting, Student, StudentExamAttempt, User, UserCourse, ExamAttemptQuestion, BatchStudent, Module, CompetencyUnit, Subject};
use App\Services\{AuditLogger, AttemptService, CatalogUpdateService, CourseScopeService, ExamService, HierarchyService, ImportService, QuestionBankService, ResultAuthorizationService, ResultService, StudentAuthService, UserCourseAssignmentService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CatalogController
{
    private array $map = [
        'courses' => Course::class,
        'tsps' => Tsp::class,
        'rounds' => Round::class,
        'batches' => Batch::class,
        'students' => Student::class,
        'subjects' => Subject::class,
        'modules' => Module::class,
        'competency-units' => CompetencyUnit::class,
        'elements' => Element::class,
    ];

    private function model($type)
    {
        abort_unless(isset($this->map[$type]), 404);
        return $this->map[$type];
    }

    /**
     * Attach the eager-loaded relations / counts each catalog type needs
     * so the resolved display fields (names, counts) can be computed
     * without N+1 queries.
     */
    private function withRelations($query, string $type)
    {
        return match ($type) {
            'courses' => $query
                ->withCount(['batches as active_batches_count' => fn($q) => $q->where('status', 'ACTIVE')])
                ->withCount('subjects as subjects_count'),
            'batches' => $query
                ->with(['course:id,name,code,duration_months', 'tsp:id,name,code', 'round:id,name,code'])
                ->withCount(['students as active_students_count' => fn($q) => $q->where('batch_students.status', 'ACTIVE')])
                ->withCount('students as students_count'),
            'students' => $query
                ->withCount('batches as batches_count')
                ->with(['batches' => fn($q) => $q->wherePivot('status', 'ACTIVE')->orderByDesc('batch_students.assigned_at')]),
            'subjects' => $query
                ->with('course:id,name,code')
                ->withCount('modules as modules_count'),
            'modules' => $query
                ->with('subject:id,name,course_id', 'subject.course:id,name,code')
                ->withCount('competencyUnits as competency_units_count'),
            'competency-units' => $query
                ->with(['module:id,name,subject_id', 'module.subject:id,name,course_id', 'course:id,name,code'])
                ->withCount('elements as elements_count'),
            'elements' => $query->with(['competencyUnit:id,name,module_id,course_id', 'competencyUnit.module:id,name,subject_id', 'competencyUnit.module.subject:id,name,course_id', 'competencyUnit.course:id,name,code']),
            'tsps' => $query->withCount('batches as batches_count'),
            'rounds' => $query->withCount('batches as batches_count'),
            default => $query,
        };
    }

    /**
     * Turn a model into an array and append the flat, human-readable
     * fields the admin UI tables need (resolved names instead of raw
     * foreign keys, and computed counts) alongside the raw columns.
     */
    private function transform(string $type, $item): array
    {
        $arr = $item->toArray();

        switch ($type) {
            case 'courses':
                $arr['duration_label'] = $item->duration_months ? "{$item->duration_months} month" . ($item->duration_months > 1 ? 's' : '') : null;
                break;
            case 'batches':
                $arr['course_name'] = $item->course->name ?? null;
                $arr['course_code'] = $item->course->code ?? null;
                $arr['tsp_name'] = $item->tsp->name ?? null;
                $arr['tsp_code'] = $item->tsp->code ?? null;
                $arr['round_name'] = $item->round->name ?? null;
                $arr['round_code'] = $item->round->code ?? null;
                $arr['display_code'] = $item->displayCode();
                // Batch capacity is a system-wide rule (see BatchStudentController),
                // not a per-row column, so surface it here for the admin UI.
                $arr['capacity'] = Setting::get('security.batch_active_capacity', config('isdb.batch_active_capacity'));
                break;
            case 'subjects':
                $arr['course_name'] = $item->course->name ?? null;
                $arr['course_code'] = $item->course->code ?? null;
                break;
            case 'modules':
                $arr['subject_name'] = $item->subject->name ?? null;
                $arr['course_id'] = $item->subject->course->id ?? null;
                $arr['course_code'] = $item->subject->course->code ?? null;
                $arr['course_name'] = $item->subject->course->name ?? null;
                break;
            case 'competency-units':
                $arr['module_name'] = $item->module->name ?? null;
                $arr['subject_name'] = $item->module->subject->name ?? null;
                $arr['course_code'] = $item->course->code ?? null;
                $arr['course_name'] = $item->course->name ?? null;
                break;
            case 'elements':
                $arr['competency_unit_name'] = $item->competencyUnit->name ?? null;
                $arr['module_name'] = $item->competencyUnit->module->name ?? null;
                $arr['subject_name'] = $item->competencyUnit->module->subject->name ?? null;
                $arr['course_code'] = $item->competencyUnit->course->code ?? null;
                $arr['course_name'] = $item->competencyUnit->course->name ?? null;
                break;
            case 'students':
                $activeBatch = $item->batches->first();
                $arr['batch_id'] = $activeBatch->id ?? null;
                $arr['batch_name'] = $activeBatch?->displayCode();
                $arr['batch_assignment_id'] = $activeBatch->pivot->id ?? null;
                $arr['is_locked'] = $item->isLocked();
                break;
        }

        return $arr;
    }

    public function index(Request $r, string $type)
    {
        $m = $this->model($type);
        $q = $m::query();
        $q = (new CourseScopeService)->catalog($q, $type, $r->user());
        $q = $this->withRelations($q, $type);

        $search = $r->input('search');
        if ($search) {
            $fields = in_array($type, ['courses', 'tsps', 'rounds']) ? ['code', 'name'] : ($type === 'students' ? ['student_id', 'name'] : ['name']);
            $q->where(function ($x) use ($fields, $search) {
                foreach ($fields as $f) {
                    $x->orWhere($f, 'like', "%{$search}%");
                }
            });
        }

        foreach (['status', 'course_id', 'tsp_id', 'round_id', 'shift', 'batch_id', 'subject_id', 'module_id', 'competency_unit_id'] as $f) {
            if ($r->filled($f) && in_array($f, $this->allowed($type), true)) {
                $q->where($f, $r->input($f));
            }
        }

        // Round does not live directly on the students table (it is a
        // property of the batch a student is assigned to), so this is
        // handled separately from the generic column-filter loop above.
        if ($type === 'students' && $r->filled('round_id')) {
            $q->whereHas('batches', fn($b) => $b->where('batches.round_id', $r->input('round_id')));
        }

        // Recently-added-first makes sense for operational lists (courses,
        // batches, students, exams, etc.), but curriculum hierarchy items
        // (subjects/modules/competency-units/elements) are seeded and
        // maintained in a fixed logical sequence (Module01, 02, 03...); the
        // seed order isn't necessarily the insertion order for every course,
        // so sort those ascending by id (creation order) to keep Module01
        // ahead of Module05 on page one instead of newest-id-first.
        // Recently-added-first makes sense for operational lists (courses,
        // batches, exams, etc.), but curriculum hierarchy items are seeded
        // in a fixed logical sequence (see comment above), and students are
        // expected in Student ID order (1300001, 1300002...) rather than
        // "who was added to the system most recently" — newest-id-first
        // put the last-imported student on page one instead of the first.
        $curriculumTypes = ['subjects', 'modules', 'competency-units', 'elements'];
        if ($type === 'students') {
            $q->orderBy('student_id');
        } elseif (in_array($type, $curriculumTypes, true)) {
            $q->orderBy('id');
        } else {
            $q->orderByDesc('id');
        }
        $paginator = $q->paginate(min((int) $r->input('per_page', 20), config('isdb.pagination_max')));
        $paginator->getCollection()->transform(fn($item) => $this->transform($type, $item));

        return ApiResponse::success($paginator);
    }

    private function allowed($t)
    {
        return match ($t) {
            'batches' => ['status', 'course_id', 'tsp_id', 'round_id', 'shift'],
            'students' => ['status'],
            'subjects' => ['status', 'course_id'],
            'modules' => ['status', 'subject_id'],
            'competency-units' => ['status', 'module_id', 'course_id'],
            'elements' => ['status', 'competency_unit_id'],
            default => ['status'],
        };
    }

    public function store(Request $r, string $type)
    {
        $m = $this->model($type);
        $rules = [
            'courses' => ['code' => 'required|string|max:50|unique:courses,code', 'name' => 'required|string|max:255', 'duration_months' => 'required|integer|min:1', 'status' => 'required|string|max:30'],
            'tsps' => ['code' => 'required|string|max:50|unique:tsps,code', 'name' => 'required|string|max:255', 'location' => 'nullable|string|max:255', 'center_manager_mobile' => 'nullable|string|max:30', 'status' => 'required|string|max:30'],
            'rounds' => ['code' => 'required|string|max:50|unique:rounds,code', 'name' => 'required|string|max:255', 'status' => 'required|string|max:30'],
            'batches' => ['course_id' => 'required|exists:courses,id', 'tsp_id' => 'required|exists:tsps,id', 'round_id' => 'required|exists:rounds,id', 'shift' => 'required|string|max:30', 'batch_number' => 'required|integer|min:1', 'start_date' => 'required|date', 'end_date' => 'nullable|date|after_or_equal:start_date', 'status' => 'required|string|max:30'],
            'students' => ['student_id' => 'required|string|max:100|unique:students,student_id', 'name' => 'required|string|max:255', 'date_of_birth' => 'required|date', 'email' => 'nullable|email', 'status' => 'required|string|max:30'],
            // The name uniqueness here mirrors each table's DB-level unique
            // constraint (see the 2026_08_27_140000 migration): subjects are
            // unique per course, modules per subject, competency units per
            // module, elements per competency unit. Without this, a duplicate
            // name reaches the DB and throws an unhandled QueryException
            // (raw 500) instead of a clean 422 validation error.
            'subjects' => ['course_id' => 'required|exists:courses,id', 'name' => ['required', 'string', 'max:255', Rule::unique('subjects')->where(fn($q) => $q->where('course_id', $r->input('course_id')))], 'status' => 'required|string|max:30'],
            'modules' => ['subject_id' => 'required|exists:subjects,id', 'name' => ['required', 'string', 'max:255', Rule::unique('modules')->where(fn($q) => $q->where('subject_id', $r->input('subject_id')))], 'status' => 'required|string|max:30'],
            'competency-units' => ['module_id' => 'required|exists:modules,id', 'name' => ['required', 'string', 'max:255', Rule::unique('competency_units')->where(fn($q) => $q->where('module_id', $r->input('module_id')))], 'status' => 'required|string|max:30'],
            'elements' => ['competency_unit_id' => 'required|exists:competency_units,id', 'name' => ['required', 'string', 'max:255', Rule::unique('elements')->where(fn($q) => $q->where('competency_unit_id', $r->input('competency_unit_id')))], 'status' => 'required|string|max:30'],
        ][$type] ?? [];

        $data = $r->validate($rules);
        if (!$r->user()->isSuperAdmin()) {
            $scope = new CourseScopeService;
            if ($type === 'courses') abort(403, 'Only Super Admin can create courses.');
            if ($type === 'batches') abort_unless($r->user()->activeCourses()->whereKey($data['course_id'])->exists(), 403, 'This course is outside your assigned scope.');
            if ($type === 'subjects') abort_unless($r->user()->activeCourses()->whereKey($data['course_id'])->exists(), 403, 'This course is outside your assigned scope.');
            if ($type === 'modules') $scope->assertCatalog($r->user(), 'subjects', $data['subject_id']);
            if ($type === 'competency-units') $scope->assertCatalog($r->user(), 'modules', $data['module_id']);
            if ($type === 'elements') $scope->assertCatalog($r->user(), 'competency-units', $data['competency_unit_id']);
            if (in_array($type, ['tsps', 'rounds'], true) && !$r->user()->hasPermission("{$type}.create")) abort(403, 'You do not have permission to create this record.');
        }
        if ($type === 'competency-units') {
            $data['course_id'] = Module::findOrFail($data['module_id'])->subject->course_id;
        }

        $x = $m::create($data);
        AuditLogger::record("{$type}.created", $x);

        $x = $this->withRelations($m::query()->whereKey($x->getKey()), $type)->first();
        return ApiResponse::success($this->transform($type, $x), 'Created successfully', 201);
    }

    public function show(string $type, $id)
    {
        $m = $this->model($type);
        (new CourseScopeService)->assertCatalog(request()->user(), $type, $id);
        $x = $this->withRelations($m::query()->whereKey($id), $type)->firstOrFail();
        return ApiResponse::success($this->transform($type, $x));
    }

    public function update(Request $r, string $type, $id)
    {
        $m = $this->model($type);
        (new CourseScopeService)->assertCatalog($r->user(), $type, $id);
        $x = $m::findOrFail($id);
        $data = CatalogUpdateService::validated($r, $type, $id);
        if (!$r->user()->isSuperAdmin()) {
            $scope = new CourseScopeService;
            if ($type === 'modules' && array_key_exists('subject_id', $data)) $scope->assertCatalog($r->user(), 'subjects', $data['subject_id']);
            if ($type === 'competency-units' && array_key_exists('module_id', $data)) $scope->assertCatalog($r->user(), 'modules', $data['module_id']);
            if ($type === 'elements' && array_key_exists('competency_unit_id', $data)) $scope->assertCatalog($r->user(), 'competency-units', $data['competency_unit_id']);
        }
        $x->update($data);
        AuditLogger::record("{$type}.updated", $x);

        $x = $this->withRelations($m::query()->whereKey($id), $type)->first();
        return ApiResponse::success($this->transform($type, $x), 'Updated successfully');
    }

    /** Clear a locked-out student's failed-login counter so they can sign in again. */
    public function unlockStudent(Request $r, $id)
    {
        (new CourseScopeService)->assertCatalog($r->user(), 'students', $id);
        $student = Student::findOrFail($id);
        $student->update(['failed_login_attempts' => 0, 'locked_until' => null]);
        AuditLogger::record('student.unlocked', $student);

        $x = $this->withRelations(Student::query()->whereKey($id), 'students')->first();
        return ApiResponse::success($this->transform('students', $x), 'Student unlocked');
    }

    public function destroy(string $type, $id)
    {
        $m = $this->model($type);
        (new CourseScopeService)->assertCatalog(request()->user(), $type, $id);
        $x = $m::findOrFail($id);
        // Deactivate instead of a real delete, for every catalog type, not
        // just students. Hard-deleting a course/batch/subject/module/
        // competency-unit/element/tsp/round cascades into (or is blocked
        // by, per the restrictOnDelete() foreign keys on these tables)
        // exams, questions, and student records that reference it — an
        // irreversible, high-blast-radius action. Every one of these
        // tables already carries a `status` column used elsewhere exactly
        // this way (see the "students" branch this used to be the only
        // user of, and CatalogUpdateService's status validation for every
        // type), so flipping status to INACTIVE here is consistent with
        // how the rest of the app already treats "removing" a record, and
        // it's reversible via a normal update. There is no separate
        // "delete" permission or action in this system — this endpoint is
        // gated by each type's `.update` permission (see AdminMiddleware),
        // the same as any other status change.
        $x->update(['status' => 'INACTIVE']);
        AuditLogger::record("{$type}.deactivated", $x);
        return ApiResponse::success(null, 'Operation completed');
    }
}
