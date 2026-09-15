<?php
namespace App\Services;

class ExamTypeRuleService
{
    /**
     * Resolve the mode and question composition for a given exam_type.
     * Unknown exam_type values keep the legacy behaviour: mode is not
     * forced (caller-supplied) and the full exam_question_total is MCQ.
     */
    public static function ruleFor(?string $examType): array
    {
        $key = strtoupper(trim((string) $examType));
        $rule = config("isdb.exam_type_rules.$key");
        if (is_array($rule)) {
            return [
                'mode' => $rule['mode'] ?? null,
                'mcq_count' => (int) ($rule['mcq_count'] ?? 0),
                'descriptive_count' => (int) ($rule['descriptive_count'] ?? 0),
            ];
        }
        return [
            'mode' => null,
            'mcq_count' => (int) config('isdb.exam_question_total', 25),
            'descriptive_count' => 0,
        ];
    }

    public static function totalQuestions(?string $examType): int
    {
        $rule = self::ruleFor($examType);
        return $rule['mcq_count'] + $rule['descriptive_count'];
    }
}
