<?php

namespace App\Services;

use App\Models\{Exam, ExamPaper, Question, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Generates the printable paper for OFFLINE (e.g. monthly) exams:
 * a fixed set of MCQ + Descriptive questions with MCQ options shown
 * (no answer key), meant for the admin to download/print on paper.
 * Descriptive questions never appear in the student's online portal;
 * they are only part of this printed paper.
 */
class ExamPaperService
{
    public function generate(Exam $exam, ?User $admin = null): ExamPaper
    {
        if ($exam->mode !== 'OFFLINE') {
            throw ValidationException::withMessages(['exam' => 'Only offline exams have a printable paper.']);
        }
        if ($exam->isProtected()) {
            throw ValidationException::withMessages(['exam' => 'This exam is locked and its paper cannot be (re)generated.']);
        }

        return DB::transaction(function () use ($exam, $admin) {
            $dist = (new DistributionService)->assertAvailable($exam);
            $cuIds = $exam->competencyUnits()->pluck('competency_units.id')->all();

            $mcq = [];
            $descriptive = [];
            foreach ($dist as $bucket) {
                if ($bucket['question_type'] === 'DESCRIPTIVE') {
                    $descriptive = Question::where('status', 'ACTIVE')
                        ->where('question_type', 'DESCRIPTIVE')
                        ->whereIn('competency_unit_id', $cuIds)
                        ->inRandomOrder()->limit($bucket['required'])->get();
                    continue;
                }
                if ($bucket['question_type'] !== 'MCQ') continue;
                $qs = Question::with('options')
                    ->where('competency_unit_id', $bucket['competency_unit_id'])
                    ->where('status', 'ACTIVE')
                    ->whereIn('question_type', DistributionService::MCQ_TYPES)
                    ->inRandomOrder()->limit($bucket['required'])->get();
                foreach ($qs as $q) $mcq[] = $q;
            }

            shuffle($mcq);
            $ordered = array_merge($mcq, $descriptive instanceof \Illuminate\Support\Collection ? $descriptive->all() : $descriptive);

            $snapshot = collect($ordered)->values()->map(fn($q, $i) => [
                'order' => $i + 1,
                'question_code' => $q->question_code,
                'question_text' => $q->question_text,
                'question_type' => $q->question_type,
                'marks' => (float) $q->marks,
                // Answer key is intentionally omitted from the printed paper.
                'options' => $q->question_type === 'DESCRIPTIVE'
                    ? []
                    : collect($q->options)->map(fn($o) => ['option_key' => $o->option_key, 'option_text' => $o->option_text])->values()->all(),
            ])->all();

            $paper = ExamPaper::updateOrCreate(
                ['exam_id' => $exam->id],
                ['questions_snapshot' => $snapshot, 'generated_at' => now(), 'generated_by' => $admin?->id]
            );

            AuditLogger::record('exam.paper_generated', $exam, ['question_count' => count($snapshot)]);
            return $paper;
        });
    }
}
