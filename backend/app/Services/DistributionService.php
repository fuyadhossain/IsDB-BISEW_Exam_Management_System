<?php

namespace App\Services;

use App\Models\{AuditLog, Batch, CompetencyUnit, Element, Exam, ExamAnswer, ExamAttemptQuestion, ExamResult, ExamSet, ExamViolation, Module, Question, QuestionImport, QuestionImportRow, QuestionOption, Student, StudentExamAttempt, Subject, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

class DistributionService
{
    const MCQ_TYPES = ['SINGLE_CORRECT', 'MULTIPLE_CORRECT'];

    /**
     * Computes the required/available question buckets for an exam.
     *
     * MCQ questions are drawn from a single pool across all of the exam's
     * selected competency units — there is no per-unit minimum. We still
     * start from a target split (the admin's explicit per-unit counts if
     * every selected unit has one, otherwise an even split) so that, when
     * every unit has enough questions, the paper looks the same as before.
     * But if a unit comes up short, its shortfall is simply handed to
     * whichever other selected units still have spare eligible questions,
     * so the exam only fails when the *combined* pool can't reach the
     * total — never because one specific unit is thin. Descriptive
     * questions (only used for OFFLINE/monthly exams) were already drawn
     * from a flat pool across the same competency units and are unchanged.
     */
    public function forExam(Exam $exam): array
    {
        $cus = $exam->competencyUnits()->orderBy('competency_units.id')->get();
        if ($cus->isEmpty()) {
            $cus = CompetencyUnit::whereIn('module_id', $exam->modules()->select('modules.id'))->orderBy('id')->get();
        }
        if ($cus->isEmpty()) throw ValidationException::withMessages(['configuration' => 'Select at least one competency unit or module.']);

        $rule = ExamTypeRuleService::ruleFor($exam->exam_type);
        $mcqTotal = $rule['mcq_count'];
        $descriptiveTotal = $rule['descriptive_count'];
        $cuIds = $cus->pluck('id')->all();

        // How many ACTIVE MCQ questions actually exist in each selected
        // unit. This used to run one COUNT query per competency unit in a
        // loop — for an exam with 6 units that's 6 round trips just for
        // this step, on every single call, including the lazy auto-start
        // check that runs on every exam-list load and every student's
        // waiting-room poll (see ExamLifecycleService::sync). A single
        // grouped query gets the same numbers in one round trip.
        $counts = Question::whereIn('competency_unit_id', $cuIds)
            ->where('status', 'ACTIVE')
            ->whereIn('question_type', self::MCQ_TYPES)
            ->selectRaw('competency_unit_id, count(*) as total')
            ->groupBy('competency_unit_id')
            ->pluck('total', 'competency_unit_id');
        $available = [];
        foreach ($cus as $cu) {
            $available[$cu->id] = (int) ($counts[$cu->id] ?? 0);
        }
        $totalAvailable = array_sum($available);

        // Target split before rebalancing: the admin's explicit per-unit
        // counts from the create-exam "Question Distribution" step
        // (persisted on the exam_competency_units pivot), used only when
        // every selected unit has one; otherwise an even split of the
        // exam_type's fixed total, as before.
        $explicitCounts = $cus->every(fn($cu) => $cu->pivot->question_count !== null);
        $base = $mcqTotal > 0 ? intdiv($mcqTotal, $cus->count()) : 0;
        $remainder = $mcqTotal > 0 ? $mcqTotal % $cus->count() : 0;

        $target = [];
        foreach ($cus as $i => $cu) {
            $target[$cu->id] = $explicitCounts ? (int) $cu->pivot->question_count : $base + ($i < $remainder ? 1 : 0);
        }

        // Cap each unit's allocation at what it actually has, then hand
        // any shortfall to units with spare capacity (largest spare first)
        // until the full mcqTotal is met or the whole pool is exhausted.
        $allocated = [];
        $poolDeficit = 0;
        foreach ($target as $cuId => $need) {
            $take = min($need, $available[$cuId]);
            $allocated[$cuId] = $take;
            $poolDeficit += $need - $take;
        }
        if ($poolDeficit > 0) {
            $spare = [];
            foreach ($cus as $cu) {
                $spare[$cu->id] = $available[$cu->id] - $allocated[$cu->id];
            }
            arsort($spare);
            foreach ($spare as $cuId => $room) {
                if ($poolDeficit <= 0) break;
                if ($room <= 0) continue;
                $take = min($room, $poolDeficit);
                $allocated[$cuId] += $take;
                $poolDeficit -= $take;
            }
        }
        // Whatever is still short after redistributing means the combined
        // pool itself doesn't have enough questions — that shortfall is
        // reported against the pool as a whole, not against any one unit.
        $poolSufficient = $totalAvailable >= $mcqTotal;

        $out = [];
        foreach ($cus as $cu) {
            $out[] = [
                'competency_unit_id' => $cu->id,
                'module_id' => $cu->module_id,
                'subject_id' => $cu->module->subject_id,
                'question_type' => 'MCQ',
                'required' => $allocated[$cu->id],
                'available' => $available[$cu->id],
                // Per-unit shortfalls no longer fail the exam on their own;
                // only the pool-level total below can mark MCQ insufficient.
                'sufficient' => true,
            ];
        }

        if ($mcqTotal > 0) {
            $out[] = [
                'competency_unit_id' => null,
                'module_id' => null,
                'subject_id' => null,
                'question_type' => 'MCQ_POOL',
                'required' => $mcqTotal,
                'available' => $totalAvailable,
                'sufficient' => $poolSufficient,
            ];
        }

        if ($descriptiveTotal > 0) {
            $available = Question::whereIn('competency_unit_id', $cuIds)->where('status', 'ACTIVE')->where('question_type', 'DESCRIPTIVE')->count();
            $out[] = [
                'competency_unit_id' => null,
                'module_id' => null,
                'subject_id' => null,
                'question_type' => 'DESCRIPTIVE',
                'required' => $descriptiveTotal,
                'available' => $available,
                'sufficient' => $available >= $descriptiveTotal,
            ];
        }

        return $out;
    }

    public function assertAvailable(Exam $exam): array
    {
        $d = $this->forExam($exam);
        $short = array_values(array_filter($d, fn($x) => !$x['sufficient']));
        if ($short) {
            throw ValidationException::withMessages(['availability' => array_map(function ($x) {
                $label = match ($x['question_type']) {
                    'DESCRIPTIVE' => 'The descriptive question pool',
                    'MCQ_POOL' => 'The combined MCQ question pool across the selected competency units',
                    default => "Competency unit {$x['competency_unit_id']}",
                };
                return "{$label} requires {$x['required']} questions but only {$x['available']} eligible questions are available.";
            }, $short)]);
        }
        return $d;
    }
}
