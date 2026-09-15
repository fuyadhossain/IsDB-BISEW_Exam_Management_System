<?php

namespace App\Services;

use App\Models\{CompetencyUnit, Exam, Module, Subject};
use App\Services\{AuditLogger, DistributionService};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ExamService
{
	public function transition(Exam $exam, string $to): Exam
	{
		$allowed = [
			'DRAFT' => ['SCHEDULED'],
			'SCHEDULED' => ['READY', 'DRAFT'],
			'READY' => ['STARTED', 'SCHEDULED'],
			'STARTED' => ['ENDED'],
			'ENDED' => ['PROCESSING'],
			'PROCESSING' => ['COMPLETED'],
		];

		if (!in_array($to, $allowed[$exam->status] ?? [], true)) {
			throw ValidationException::withMessages(['status' => "Invalid exam transition from {$exam->status} to {$to}."]);
		}
		if ($to === 'READY') {
			// The create-exam form never calls the separate "configure" step,
			// so a freshly created exam has no subjects/modules/competency
			// units attached. Without this, every publish attempt failed
			// with "Select at least one competency unit or module." (422),
			// even when the course has plenty of eligible questions.
			// Default such exams to the full syllabus of their course.
			if ($exam->competencyUnits()->count() === 0 && $exam->modules()->count() === 0) {
				$this->autoConfigureFromCourse($exam);
			}
			(new DistributionService)->assertAvailable($exam);
		}
		$exam->update(['status' => $to]);
		AuditLogger::record('exam.status_changed', $exam, ['from' => $exam->getOriginal('status'), 'to' => $to]);
		return $exam;
	}

	/**
	 * Attach every subject/module/competency unit under the exam's course,
	 * so an exam that was never explicitly configured can still be
	 * published against its full syllabus instead of failing outright.
	 */
	public function autoConfigureFromCourse(Exam $exam): void
	{
		$batch = $exam->examSet()->with('batch')->first()?->batch;
		if (!$batch) return;
		$courseId = $batch->course_id;

		$subjectIds = Subject::where('course_id', $courseId)->pluck('id')->all();
		$moduleIds = Module::whereIn('subject_id', $subjectIds)->pluck('id')->all();
		$cuIds = CompetencyUnit::whereIn('module_id', $moduleIds)->pluck('id')->all();

		if (!$cuIds) return;

		$exam->subjects()->sync($subjectIds);
		$exam->modules()->sync($moduleIds);
		$exam->competencyUnits()->sync($cuIds);
		AuditLogger::record('exam.configuration_saved', $exam, ['subjects' => count($subjectIds), 'modules' => count($moduleIds), 'competency_units' => count($cuIds), 'auto' => true]);
	}

	public function configure(Exam $exam, array $data): Exam
	{
		if ($exam->isProtected()) {
			throw ValidationException::withMessages(['exam' => 'This exam configuration is protected in its current lifecycle state.']);
		}

		return DB::transaction(function () use ($exam, $data): Exam {
			$batch = $exam->examSet()->with('batch')->first()->batch;
			$courseId = $batch->course_id;
			$subjectIds = $data['subject_ids'] ?? [];
			$moduleIds = $data['module_ids'] ?? [];
			$cuIds = $data['competency_unit_ids'] ?? [];

			if ($subjectIds && Subject::whereIn('id', $subjectIds)->where('course_id', $courseId)->count() !== count($subjectIds)) {
				throw ValidationException::withMessages(['subject_ids' => 'One or more subjects are outside the exam course.']);
			}
			foreach ($moduleIds as $moduleId) {
				$module = Module::with('subject')->findOrFail($moduleId);
				// $subjectIds arrives from the frontend as an array of
				// numeric strings (e.g. "7"), while Eloquent returns
				// subject_id as a native int. A strict in_array() check
				// between the two never matches, so every configure() call
				// failed with "Every module must belong to a selected
				// subject" even when the module's subject genuinely was
				// selected. Compare as integers on both sides instead.
				if (!in_array((int) $module->subject_id, array_map('intval', $subjectIds), true)) {
					throw ValidationException::withMessages(['module_ids' => 'Every module must belong to a selected subject.']);
				}
			}
			foreach ($cuIds as $unitId) {
				$unit = CompetencyUnit::findOrFail($unitId);
				if (!in_array((int) $unit->module_id, array_map('intval', $moduleIds), true)) {
					throw ValidationException::withMessages(['competency_unit_ids' => 'Every competency unit must belong to a selected module.']);
				}
			}

			// Per-competency-unit question counts (as configured per module
			// in the create-exam "Question Distribution" step). Any unit not
			// present in $data['distribution'] keeps a null question_count,
			// which tells DistributionService to fall back to an even split
			// of the exam_type's fixed total for that unit.
			$distribution = collect($data['distribution'] ?? [])->keyBy('competency_unit_id');
			$syncData = [];
			foreach (array_values(array_unique($cuIds)) as $unitId) {
				$syncData[$unitId] = ['question_count' => $distribution->get($unitId)['question_count'] ?? null];
			}

			$exam->subjects()->sync(array_values(array_unique($subjectIds)));
			$exam->modules()->sync(array_values(array_unique($moduleIds)));
			$exam->competencyUnits()->sync($syncData);
			// Fail fast here instead of only at publish (READY transition):
			// an admin picking modules/competency units for this exam should
			// find out immediately if the selected pool can't fill the
			// required question count, not after finishing the whole
			// create-exam form and trying to publish it later.
			(new DistributionService)->assertAvailable($exam->fresh(['competencyUnits', 'modules']));
			AuditLogger::record('exam.configuration_saved', $exam, ['subjects' => count($subjectIds), 'modules' => count($moduleIds), 'competency_units' => count($cuIds), 'has_distribution' => $distribution->isNotEmpty()]);
			return $exam->fresh(['subjects', 'modules', 'competencyUnits']);
		});
	}
}
