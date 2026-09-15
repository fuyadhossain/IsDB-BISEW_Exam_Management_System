<?php

namespace App\Services;

use App\Models\{CompetencyUnit, Element, Module, Subject};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CatalogUpdateService
{
    public static function validated(Request $request, string $type, int|string $id): array
    {
        $table = match ($type) {
            'courses' => 'courses',
            'tsps' => 'tsps',
            'rounds' => 'rounds',
            'batches' => 'batches',
            'students' => 'students',
            'subjects' => 'subjects',
            'modules' => 'modules',
            'competency-units' => 'competency_units',
            'elements' => 'elements',
            default => throw new \InvalidArgumentException('Unsupported catalog resource.'),
        };
        // Renaming a subject/module/competency-unit/element usually doesn't
        // resend its parent id (only `name` changes), but the uniqueness
        // constraint is scoped to that parent. Fall back to the record's
        // current parent column so the duplicate-name check still scopes
        // correctly even when the request omits it.
        $parentColumn = match ($type) {
            'subjects' => 'course_id',
            'modules' => 'subject_id',
            'competency-units' => 'module_id',
            'elements' => 'competency_unit_id',
            default => null,
        };
        $currentParentId = $parentColumn ? $request->input($parentColumn, match ($type) {
            'subjects' => Subject::find($id)?->course_id,
            'modules' => Module::find($id)?->subject_id,
            'competency-units' => CompetencyUnit::find($id)?->module_id,
            'elements' => Element::find($id)?->competency_unit_id,
        }) : null;
        $rules = match ($type) {
            'courses' => ['code' => ['sometimes', 'string', 'max:50', Rule::unique($table, 'code')->ignore($id)], 'name' => 'sometimes|string|max:255', 'duration_months' => 'sometimes|integer|min:1', 'status' => 'sometimes|string|max:30'],
            'tsps' => ['code' => ['sometimes', 'string', 'max:50', Rule::unique($table, 'code')->ignore($id)], 'name' => 'sometimes|string|max:255', 'location' => 'nullable|string|max:255', 'center_manager_mobile' => 'nullable|string|max:30', 'status' => 'sometimes|string|max:30'],
            'rounds' => ['code' => ['sometimes', 'string', 'max:50', Rule::unique($table, 'code')->ignore($id)], 'name' => 'sometimes|string|max:255', 'status' => 'sometimes|string|max:30'],
            'batches' => ['course_id' => 'sometimes|integer|exists:courses,id', 'tsp_id' => 'sometimes|integer|exists:tsps,id', 'round_id' => 'sometimes|integer|exists:rounds,id', 'shift' => 'sometimes|string|max:30', 'batch_number' => 'sometimes|integer|min:1', 'start_date' => 'sometimes|date', 'end_date' => 'nullable|date|after_or_equal:start_date', 'status' => 'sometimes|string|max:30'],
            'students' => ['student_id' => ['sometimes', 'string', 'max:100', Rule::unique($table, 'student_id')->ignore($id)], 'name' => 'sometimes|string|max:255', 'date_of_birth' => 'sometimes|date', 'email' => 'nullable|email', 'status' => 'sometimes|string|max:30'],
            'subjects' => ['course_id' => 'sometimes|integer|exists:courses,id', 'name' => ['sometimes', 'string', 'max:255', Rule::unique('subjects')->where(fn($q) => $q->where('course_id', $currentParentId))->ignore($id)], 'status' => 'sometimes|string|max:30'],
            'modules' => ['subject_id' => 'sometimes|integer|exists:subjects,id', 'name' => ['sometimes', 'string', 'max:255', Rule::unique('modules')->where(fn($q) => $q->where('subject_id', $currentParentId))->ignore($id)], 'status' => 'sometimes|string|max:30'],
            'competency-units' => ['module_id' => 'sometimes|integer|exists:modules,id', 'name' => ['sometimes', 'string', 'max:255', Rule::unique('competency_units')->where(fn($q) => $q->where('module_id', $currentParentId))->ignore($id)], 'status' => 'sometimes|string|max:30'],
            'elements' => ['competency_unit_id' => 'sometimes|integer|exists:competency_units,id', 'name' => ['sometimes', 'string', 'max:255', Rule::unique('elements')->where(fn($q) => $q->where('competency_unit_id', $currentParentId))->ignore($id)], 'status' => 'sometimes|string|max:30'],
        };
        $data = $request->validate($rules);
        if ($type === 'competency-units' && array_key_exists('module_id', $data)) $data['course_id'] = Module::findOrFail($data['module_id'])->subject->course_id;
        return $data;
    }
}
