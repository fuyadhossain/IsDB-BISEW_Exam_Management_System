<?php

namespace App\Services;

use App\Models\{Exam, ExamEvidence, ExamResult};

/**
 * A student's real pass/fail is not decided by a single exam, and not by
 * one lump obtained/max pair per exam either -- it's decided per
 * *component*. Both the Mid Monthly exam and the Monthly exam each have
 * their own External (MCQ) mark and their own Evidence mark:
 *
 *   Final External = (Mid Monthly External + Monthly External) x 20%
 *   Final Evidence = (Mid Monthly Evidence + Monthly Evidence) x 80%
 *   Total Marks    = Final External + Final Evidence
 *   Pass/Fail      = Total Marks >= 28
 *
 * Mid Monthly has its own internal pass mark of 32 per component: a Mid
 * Monthly component (External or Evidence) that scores below 32 is
 * FAILED, and a failed component contributes 0 -- not its real mark --
 * to the corresponding weighted Final term above. This 32-mark rule is
 * Mid-Monthly-only; Monthly's own External/Evidence marks are never
 * zeroed by it, no matter how low they are, since they aren't Mid Monthly
 * components.
 *
 * The exam_type actually stored in this system is 'MID_MONTHLY' (see the
 * exams table), not the bare 'MID' the previous version of this service
 * checked for -- that mismatch meant this service never actually applied
 * to a single real Mid Monthly exam. Checks below use 'MID_MONTHLY'.
 */
class CombinedResultService
{
    public const EXTERNAL_WEIGHT = 0.20;
    public const EVIDENCE_WEIGHT = 0.80;
    public const PASS_THRESHOLD = 28.0;
    public const MID_MONTHLY_COMPONENT_PASS_MARK = 32.0;

    /**
     * Given a Mid Monthly exam's ExamResult (the auto-graded External/MCQ
     * attempt), find the sibling Monthly exam in the same exam set and
     * both exams' Evidence rows, then combine all four components. When a
     * needed piece isn't available yet, this returns a descriptive
     * "incomplete" payload (rather than a bare null) so the UI can tell
     * the admin exactly what is still missing instead of silently hiding
     * the whole card.
     */
    public function forMidResult(ExamResult $midResult): array
    {
        $midExam = $midResult->exam;
        if (!$midExam || strtoupper($midExam->exam_type) !== 'MID_MONTHLY') {
            return $this->incomplete('not_applicable', 'This result is not a Mid Monthly exam, so no Final Result applies.');
        }

        $monthlyExam = Exam::where('exam_set_id', $midExam->exam_set_id)
            ->where('exam_type', 'MONTHLY')
            ->first();
        if (!$monthlyExam) {
            return $this->incomplete('monthly_exam_missing', 'No Monthly exam is set up yet for this exam set.');
        }

        $midEvidence = ExamEvidence::where('exam_id', $midExam->id)
            ->where('student_id', $midResult->student_id)
            ->first();
        $monthlyEvidence = ExamEvidence::where('exam_id', $monthlyExam->id)
            ->where('student_id', $midResult->student_id)
            ->first();

        return $this->buildFromComponents(
            midExternal: (float) $midResult->total_marks,
            midEvidence: $midEvidence?->marks !== null ? (float) $midEvidence->marks : null,
            monthlyExternal: $monthlyEvidence?->mcq_marks !== null ? (float) $monthlyEvidence->mcq_marks : null,
            monthlyEvidence: $monthlyEvidence?->marks !== null ? (float) $monthlyEvidence->marks : null,
            midExamTitle: $midExam->exam_title,
            monthlyExamTitle: $monthlyExam->exam_title,
            monthlyExamId: $monthlyExam->id,
        );
    }

    /** The reverse direction: starting from a Monthly Evidence entry. */
    public function forEvidence(ExamEvidence $monthlyEvidence): array
    {
        $monthlyExam = $monthlyEvidence->exam;
        if (!$monthlyExam || strtoupper($monthlyExam->exam_type) !== 'MONTHLY') {
            return $this->incomplete('not_applicable', 'This result is not a Monthly exam, so no Final Result applies.');
        }

        $midExam = Exam::where('exam_set_id', $monthlyExam->exam_set_id)
            ->where('exam_type', 'MID_MONTHLY')
            ->first();
        if (!$midExam) {
            return $this->incomplete('mid_exam_missing', 'No Mid Monthly exam is set up yet for this exam set.');
        }

        $midResult = ExamResult::where('exam_id', $midExam->id)
            ->where('student_id', $monthlyEvidence->student_id)
            ->first();
        if (!$midResult) {
            return $this->incomplete(
                'mid_result_missing',
                "Mid Monthly result missing. The student hasn't attempted (or hasn't been graded for) the Mid Monthly exam yet.",
            );
        }

        $midEvidence = ExamEvidence::where('exam_id', $midExam->id)
            ->where('student_id', $monthlyEvidence->student_id)
            ->first();

        return $this->buildFromComponents(
            midExternal: (float) $midResult->total_marks,
            midEvidence: $midEvidence?->marks !== null ? (float) $midEvidence->marks : null,
            monthlyExternal: $monthlyEvidence->mcq_marks !== null ? (float) $monthlyEvidence->mcq_marks : null,
            monthlyEvidence: $monthlyEvidence->marks !== null ? (float) $monthlyEvidence->marks : null,
            midExamTitle: $midExam->exam_title,
            monthlyExamTitle: $monthlyExam->exam_title,
            monthlyExamId: $monthlyExam->id,
        );
    }

    /**
     * All four components are required before a Final Result can be
     * shown -- Monthly's External is filled in by hand (it's an offline
     * exam), same as its Evidence, so either one can legitimately still
     * be missing. Reports exactly which piece is missing rather than a
     * generic "incomplete" so the admin knows which tab to go fill in.
     */
    private function buildFromComponents(
        ?float $midExternal, ?float $midEvidence,
        ?float $monthlyExternal, ?float $monthlyEvidence,
        ?string $midExamTitle, ?string $monthlyExamTitle, ?int $monthlyExamId,
    ): array {
        if ($midEvidence === null) {
            return $this->incomplete(
                'mid_evidence_missing',
                'Mid Monthly Evidence result missing. Update evidence result for the Mid Monthly exam to see the Final Result.',
            );
        }
        if ($monthlyExternal === null) {
            return $this->incomplete(
                'monthly_external_missing',
                'Monthly External/MCQ marks missing. Enter MCQ marks for the Monthly exam to see the Final Result.',
                ['finalExamId' => $monthlyExamId, 'finalExamTitle' => $monthlyExamTitle],
            );
        }
        if ($monthlyEvidence === null) {
            return $this->incomplete(
                'monthly_evidence_missing',
                'Monthly Evidence result missing. Update evidence result for the Monthly exam to see the Final Result.',
                ['finalExamId' => $monthlyExamId, 'finalExamTitle' => $monthlyExamTitle],
            );
        }

        return $this->calculate($midExternal, $midEvidence, $monthlyExternal, $monthlyEvidence, $midExamTitle, $monthlyExamTitle);
    }

    private function incomplete(string $reason, string $message, array $extra = []): array
    {
        return array_merge(['complete' => false, 'reason' => $reason, 'message' => $message], $extra);
    }

    /**
     * A Mid Monthly component below MID_MONTHLY_COMPONENT_PASS_MARK (32)
     * is FAILED and contributes 0 to the corresponding weighted Final
     * term -- the real mark is returned unchanged (for display), and the
     * effective (possibly zeroed) value used for calculation is returned
     * alongside it, so callers/UI never confuse the two.
     */
    private function midComponentStatus(float $mark): array
    {
        $pass = $mark >= self::MID_MONTHLY_COMPONENT_PASS_MARK;
        return ['mark' => $mark, 'effective' => $pass ? $mark : 0.0, 'status' => $pass ? 'PASS' : 'FAIL'];
    }

    public function calculate(
        float $midExternal, float $midEvidence,
        float $monthlyExternal, float $monthlyEvidence,
        ?string $midExamTitle = null, ?string $monthlyExamTitle = null,
    ): array {
        $midExternalComponent = $this->midComponentStatus($midExternal);
        $midEvidenceComponent = $this->midComponentStatus($midEvidence);

        // Monthly's own External/Evidence are never subject to the Mid
        // Monthly 32-mark zeroing rule -- only Mid Monthly components can
        // fail into a 0 contribution.
        $finalExternal = round(($midExternalComponent['effective'] + $monthlyExternal) * self::EXTERNAL_WEIGHT, 2);
        $finalEvidence = round(($midEvidenceComponent['effective'] + $monthlyEvidence) * self::EVIDENCE_WEIGHT, 2);
        $totalMarks = round($finalExternal + $finalEvidence, 2);

        return [
            'complete' => true,
            'midMonthly' => [
                'title' => $midExamTitle,
                'external' => $midExternalComponent,
                'evidence' => $midEvidenceComponent,
            ],
            'monthly' => [
                'title' => $monthlyExamTitle,
                // Monthly components never fail into a 0 contribution, so
                // there's no separate pass/fail per component here -- the
                // raw mark is the effective mark.
                'external' => ['mark' => $monthlyExternal, 'effective' => $monthlyExternal],
                'evidence' => ['mark' => $monthlyEvidence, 'effective' => $monthlyEvidence],
            ],
            'final_external' => $finalExternal,
            'final_evidence' => $finalEvidence,
            'external_weight' => self::EXTERNAL_WEIGHT,
            'evidence_weight' => self::EVIDENCE_WEIGHT,
            'total_marks' => $totalMarks,
            'pass_threshold' => self::PASS_THRESHOLD,
            'status' => $totalMarks >= self::PASS_THRESHOLD ? 'PASS' : 'FAIL',
        ];
    }
}
