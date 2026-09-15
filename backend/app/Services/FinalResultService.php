<?php

namespace App\Services;

use App\Models\{Exam, ExamEvidence, ExamResult, Setting};

/**
 * Cross-exam Final Result for the Mid Monthly / Monthly pair.
 *
 * Pairing: same batch + same exam_number (Mid Monthly and Monthly are
 * always separate exam_sets, so exam_set can't be used for pairing).
 *
 * Formula:
 *   Final External = Mid Monthly External[effective] x midWeight() + Monthly External x monthlyWeight()
 *   Final Evidence = Mid Monthly Evidence[effective] x midWeight() + Monthly Evidence x monthlyWeight()
 *   Total Marks = Final External + Final Evidence (display only)
 *
 * Mid Monthly's own pass mark (midPassMark()) applies per component; below
 * that, the component contributes 0 (not its raw mark) to the formula
 * above, but the raw mark/FAIL status is still shown for display.
 *
 * Final External and Final Evidence each pass/fail independently against
 * componentPassThreshold(). Overall status is PASS only if both pass;
 * either failing fails the whole Final Result regardless of Total Marks.
 *
 * All four numbers are admin-configurable (Settings -> Grading); the
 * literals below are only the defaults used until an admin overrides them.
 */
class FinalResultService
{
    public static function midPassMark(): float
    {
        return (float) Setting::get('grading.mid_pass_mark', 32);
    }

    public static function midWeight(): float
    {
        return ((float) Setting::get('grading.mid_weight_percent', 20)) / 100;
    }

    public static function monthlyWeight(): float
    {
        return ((float) Setting::get('grading.monthly_weight_percent', 80)) / 100;
    }

    public static function componentPassThreshold(): float
    {
        return (float) Setting::get('grading.component_pass_threshold', 28);
    }

    /** MONTHLY is the only "Monthly" exam_type; everything else is Mid Monthly. */
    public static function isMonthly(?string $examType): bool
    {
        return strtoupper(trim((string) $examType)) === 'MONTHLY';
    }

    /** Same batch, same exam_number, the other exam_type bucket. Null if not created yet. */
    public static function siblingExam(Exam $exam): ?Exam
    {
        $batchId = $exam->examSet?->batch_id;
        if (!$batchId) return null;

        $wantMonthly = !self::isMonthly($exam->exam_type);

        return Exam::whereHas('examSet', fn($q) => $q->where('batch_id', $batchId))
            ->where('exam_number', $exam->exam_number)
            ->when($wantMonthly, fn($q) => $q->where('exam_type', 'MONTHLY'))
            ->when(!$wantMonthly, fn($q) => $q->where('exam_type', '!=', 'MONTHLY'))
            ->first();
    }

    public static function componentStatus(?float $marks): ?string
    {
        if ($marks === null) return null;
        return $marks >= self::midPassMark() ? 'PASS' : 'FAIL';
    }

    public static function finalComponentStatus(float $marks): string
    {
        return $marks >= self::componentPassThreshold() ? 'PASS' : 'FAIL';
    }

    /** Mid Monthly marks below the pass mark contribute 0 to the weighted Final Result. */
    private static function effectiveMidMarks(?float $marks): float
    {
        if ($marks === null) return 0.0;
        return $marks >= self::midPassMark() ? $marks : 0.0;
    }

    /** Builds the Final Result for one student given a confirmed Mid Monthly + Monthly pair. */
    public static function buildForPair(Exam $midExam, Exam $monthlyExam, int $studentId): array
    {
        $midResult = ExamResult::where('exam_id', $midExam->id)->where('student_id', $studentId)->first();
        $midEvidence = ExamEvidence::where('exam_id', $midExam->id)->where('student_id', $studentId)->first();
        $monthlyEvidence = ExamEvidence::where('exam_id', $monthlyExam->id)->where('student_id', $studentId)->first();

        $midExternal = $midResult !== null ? (float) $midResult->total_marks : null;
        $midEvidenceMarks = $midEvidence?->marks !== null ? (float) $midEvidence->marks : null;
        $monthlyExternal = $monthlyEvidence?->mcq_marks !== null ? (float) $monthlyEvidence->mcq_marks : null;
        $monthlyEvidenceMarks = $monthlyEvidence?->marks !== null ? (float) $monthlyEvidence->marks : null;

        $missing = [];
        if ($midExternal === null) $missing[] = 'Mid Monthly External';
        if ($midEvidenceMarks === null) $missing[] = 'Mid Monthly Evidence';
        if ($monthlyExternal === null) $missing[] = 'Monthly External';
        if ($monthlyEvidenceMarks === null) $missing[] = 'Monthly Evidence';

        $midWeight = self::midWeight();
        $monthlyWeight = self::monthlyWeight();
        $finalExternal = round(self::effectiveMidMarks($midExternal) * $midWeight + (float) ($monthlyExternal ?? 0) * $monthlyWeight, 2);
        $finalEvidence = round(self::effectiveMidMarks($midEvidenceMarks) * $midWeight + (float) ($monthlyEvidenceMarks ?? 0) * $monthlyWeight, 2);
        $totalMarks = round($finalExternal + $finalEvidence, 2);

        $finalExternalStatus = self::finalComponentStatus($finalExternal);
        $finalEvidenceStatus = self::finalComponentStatus($finalEvidence);

        return [
            'complete' => empty($missing),
            'message' => empty($missing) ? null : ('Missing: ' . implode(', ', $missing) . '.'),
            'midMonthlyExamId' => $midExam->id,
            'midMonthlyExamTitle' => $midExam->exam_title,
            'monthlyExamId' => $monthlyExam->id,
            'monthlyExamTitle' => $monthlyExam->exam_title,
            'midMonthly' => [
                'external' => $midExternal,
                'externalStatus' => self::componentStatus($midExternal),
                'evidence' => $midEvidenceMarks,
                'evidenceStatus' => self::componentStatus($midEvidenceMarks),
            ],
            'monthly' => [
                'external' => $monthlyExternal,
                'evidence' => $monthlyEvidenceMarks,
            ],
            'finalExternal' => $finalExternal,
            'finalExternalStatus' => $finalExternalStatus,
            'finalEvidence' => $finalEvidence,
            'finalEvidenceStatus' => $finalEvidenceStatus,
            'totalMarks' => $totalMarks,
            'passThreshold' => self::componentPassThreshold(),
            'midWeightPercent' => round($midWeight * 100),
            'monthlyWeightPercent' => round($monthlyWeight * 100),
            'status' => ($finalExternalStatus === 'PASS' && $finalEvidenceStatus === 'PASS') ? 'PASS' : 'FAIL',
        ];
    }

    /** Same as buildForPair(), but starting from either exam of the pair. */
    public static function buildForExam(Exam $exam, int $studentId): ?array
    {
        $sibling = self::siblingExam($exam);
        if (!$sibling) {
            return [
                'complete' => false,
                'message' => self::isMonthly($exam->exam_type)
                    ? "No Mid Monthly exam numbered {$exam->exam_number} was found for this batch yet."
                    : "No Monthly exam numbered {$exam->exam_number} was found for this batch yet.",
            ];
        }

        return self::isMonthly($exam->exam_type)
            ? self::buildForPair($sibling, $exam, $studentId)
            : self::buildForPair($exam, $sibling, $studentId);
    }
}
