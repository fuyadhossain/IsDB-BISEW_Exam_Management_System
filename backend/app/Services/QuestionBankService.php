<?php

namespace App\Services;

use App\Models\{Element, Question, QuestionOption};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class QuestionBankService
{
    public static function normalize(array $input): array
    {
        $elementId = filter_var($input['element_id'] ?? null, FILTER_VALIDATE_INT);
        $questionCode = trim((string)($input['question_code'] ?? ''));
        $questionText = trim((string)($input['question_text'] ?? ''));
        $type = strtoupper(trim((string)($input['question_type'] ?? '')));
        $difficulty = trim((string)($input['difficulty'] ?? ''));
        $status = strtoupper(trim((string)($input['status'] ?? '')));
        $marks = $input['marks'] ?? null;
        $options = $input['options'] ?? null;
        $isDescriptive = $type === 'DESCRIPTIVE';

        $errors = [];
        if (!$elementId) $errors['element_id'][] = 'A valid element_id is required.';
        if ($questionCode === '' || strlen($questionCode) > 100) $errors['question_code'][] = 'question_code is required and must be at most 100 characters.';
        if ($questionText === '' || strlen($questionText) > 10000) $errors['question_text'][] = 'question_text is required and must be at most 10000 characters.';
        if (!in_array($type, ['SINGLE_CORRECT', 'MULTIPLE_CORRECT', 'DESCRIPTIVE'], true)) $errors['question_type'][] = 'question_type must be SINGLE_CORRECT, MULTIPLE_CORRECT, or DESCRIPTIVE.';
        if ($difficulty === '' || strlen($difficulty) > 30) $errors['difficulty'][] = 'difficulty is required and must be at most 30 characters.';
        if ($status === '' || strlen($status) > 30) $errors['status'][] = 'status is required and must be at most 30 characters.';
        if (!is_numeric($marks) || (float)$marks <= 0) $errors['marks'][] = 'marks must be a positive number.';
        if (!$isDescriptive && (!is_array($options) || count($options) < 2)) $errors['options'][] = 'At least two options are required.';
        if ($errors) throw ValidationException::withMessages($errors);

        try {
            $hierarchy = HierarchyService::fromElement($elementId);
        } catch (\Throwable) {
            throw ValidationException::withMessages(['element_id' => 'The selected element does not exist.']);
        }

        // Descriptive questions have no options and no correct-answer key;
        // the student writes the answer on paper and it is graded manually.
        if ($isDescriptive) {
            return ['question' => array_merge($hierarchy, ['question_code' => $questionCode, 'question_text' => $questionText, 'question_type' => $type, 'difficulty' => $difficulty, 'marks' => (float)$marks, 'status' => $status]), 'options' => []];
        }

        $normalized = [];
        $seen = [];
        $correct = 0;
        foreach (array_values($options) as $index => $option) {
            if (!is_array($option)) throw ValidationException::withMessages(['options' => 'Every option must be an object.']);
            $key = strtoupper(trim((string)($option['option_key'] ?? '')));
            $text = trim((string)($option['option_text'] ?? ''));
            if ($key === '' || strlen($key) > 10 || !preg_match('/^[A-Z0-9_-]+$/', $key)) throw ValidationException::withMessages(['options' => "Option {$index} has an invalid option_key."]);
            if (isset($seen[$key])) throw ValidationException::withMessages(['options' => "Duplicate option_key {$key} is not allowed."]);
            if ($text === '' || strlen($text) > 10000) throw ValidationException::withMessages(['options' => "Option {$key} must contain meaningful option_text."]);
            $seen[$key] = true;
            $rawCorrect = $option['is_correct'] ?? false;
            if (!is_bool($rawCorrect) && !in_array(strtolower(trim((string)$rawCorrect)), ['0', '1', 'true', 'false'], true)) throw ValidationException::withMessages(['options' => "Option {$key} has an invalid is_correct value."]);
            $isCorrect = filter_var($rawCorrect, FILTER_VALIDATE_BOOLEAN);
            $correct += (int)$isCorrect;
            $normalized[] = ['option_key' => $key, 'option_text' => $text, 'is_correct' => $isCorrect, 'option_order' => $index + 1];
        }
        if (($type === 'SINGLE_CORRECT' && $correct !== 1) || ($type === 'MULTIPLE_CORRECT' && $correct < 1)) {
            throw ValidationException::withMessages(['options' => $type === 'SINGLE_CORRECT' ? 'Exactly one correct option is required.' : 'At least one correct option is required.']);
        }

        return ['question' => array_merge($hierarchy, ['question_code' => $questionCode, 'question_text' => $questionText, 'question_type' => $type, 'difficulty' => $difficulty, 'marks' => (float)$marks, 'status' => $status]), 'options' => $normalized];
    }

    public static function normalizeCsvRow(array $raw): array
    {
        $optionTokens = array_values(array_filter(array_map('trim', explode('|', (string)($raw['options'] ?? ''))), fn($x) => $x !== ''));
        $correctKeys = array_values(array_filter(array_map(fn($x) => strtoupper(trim($x)), explode('|', (string)($raw['correct_options'] ?? ''))), fn($x) => $x !== ''));
        $options = [];
        foreach ($optionTokens as $token) {
            [$key, $text] = array_pad(explode(':', $token, 2), 2, '');
            $key = strtoupper(trim($key));
            $options[] = ['option_key' => $key, 'option_text' => trim($text), 'is_correct' => in_array($key, $correctKeys, true)];
        }
        return self::normalize(array_merge(['status' => 'ACTIVE'], $raw, ['status' => $raw['status'] ?? 'ACTIVE', 'options' => $options]));
    }

    public static function duplicateReason(array $normalized, ?int $ignoreId = null): ?string
    {
        $q = $normalized['question'];
        if (Question::where('question_code', $q['question_code'])->when($ignoreId !== null, fn($query) => $query->where('id', '<>', $ignoreId))->exists()) return 'A question with this question_code already exists.';
        if (Question::where('element_id', $q['element_id'])->whereRaw('LOWER(question_text)=?', [strtolower($q['question_text'])])->when($ignoreId !== null, fn($query) => $query->where('id', '<>', $ignoreId))->exists()) return 'A question with the same text already exists for this element.';
        return null;
    }

    /**
     * Find an existing question that a new/imported row would collide with:
     * same question_code, or same element + question_text (case-insensitive).
     * Import re-runs use this instead of duplicateReason() so a matching row
     * with changed values can be updated rather than always skipped.
     */
    public static function findMatch(array $normalized, ?int $ignoreId = null): ?Question
    {
        $q = $normalized['question'];
        return Question::where(function ($query) use ($q) {
            $query->where('question_code', $q['question_code'])
                ->orWhere(function ($q2) use ($q) {
                    $q2->where('element_id', $q['element_id'])
                        ->whereRaw('LOWER(question_text)=?', [strtolower($q['question_text'])]);
                });
        })
            ->when($ignoreId !== null, fn($query) => $query->where('id', '<>', $ignoreId))
            ->with('options')
            ->first();
    }

    /**
     * True only when the matched question already has exactly the same
     * type, difficulty, marks, status, and option set (key/text/correctness)
     * as the incoming row — i.e. re-importing it would be a genuine no-op.
     * Any other difference means the row carries an update to apply.
     */
    public static function isIdenticalToExisting(Question $existing, array $normalized): bool
    {
        $q = $normalized['question'];
        if ((string)$existing->question_type !== (string)$q['question_type']) return false;
        if ((string)$existing->difficulty !== (string)$q['difficulty']) return false;
        if ((float)$existing->marks !== (float)$q['marks']) return false;
        if ((string)$existing->status !== (string)$q['status']) return false;

        $existingOptions = $existing->options
            ->map(fn($o) => strtoupper($o->option_key) . ':' . $o->option_text . ':' . ($o->is_correct ? '1' : '0'))
            ->sort()
            ->values()
            ->all();
        $incomingOptions = collect($normalized['options'])
            ->map(fn($o) => strtoupper($o['option_key']) . ':' . $o['option_text'] . ':' . ($o['is_correct'] ? '1' : '0'))
            ->sort()
            ->values()
            ->all();

        return $existingOptions === $incomingOptions;
    }

    public static function createNormalized(array $normalized): Question
    {
        return DB::transaction(function () use ($normalized) {
            $question = Question::create($normalized['question']);
            foreach ($normalized['options'] as $option) QuestionOption::create(array_merge($option, ['question_id' => $question->id]));
            return $question->load('options');
        });
    }

    /**
     * Replace an existing question's fields and options with the incoming
     * (changed) values. Used when an import row matches an existing
     * question by element+question_text but is not an exact duplicate.
     */
    public static function updateNormalized(Question $existing, array $normalized): Question
    {
        return DB::transaction(function () use ($existing, $normalized) {
            $existing->update($normalized['question']);
            $existing->options()->delete();
            foreach ($normalized['options'] as $option) QuestionOption::create(array_merge($option, ['question_id' => $existing->id]));
            return $existing->fresh('options');
        });
    }

    public static function create(array $input): Question
    {
        $normalized = self::normalize($input);
        if ($reason = self::duplicateReason($normalized)) throw ValidationException::withMessages(['question_code' => $reason]);
        return self::createNormalized($normalized);
    }

    public static function update(Question $question, array $input): Question
    {
        $base = array_merge($question->only(['element_id', 'question_code', 'question_text', 'question_type', 'difficulty', 'marks', 'status']), $input);
        $normalized = self::normalize($base);
        if ($reason = self::duplicateReason($normalized, (int)$question->id)) throw ValidationException::withMessages(['question_code' => $reason]);
        return DB::transaction(function () use ($question, $normalized, $input) {
            $question->update($normalized['question']);
            if (array_key_exists('options', $input)) {
                $question->options()->delete();
                foreach ($normalized['options'] as $option) QuestionOption::create(array_merge($option, ['question_id' => $question->id]));
            }
            return $question->fresh('options');
        });
    }
}
