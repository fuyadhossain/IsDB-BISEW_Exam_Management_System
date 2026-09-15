<?php

namespace App\Services;

use App\Models\{AuditLog, Batch, CompetencyUnit, Element, Exam, ExamAnswer, ExamAttemptQuestion, ExamResult, ExamSet, ExamViolation, Module, Question, QuestionImport, QuestionImportRow, QuestionOption, Student, StudentExamAttempt, Subject, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

class ImportService
{
    // CSVs routinely have long runs of rows for the same
    // course/subject/module/competency_unit/element (e.g. 25 questions for
    // one element in a row). Without this, adaptFrontendRow() below ran a
    // 4-level nested EXISTS lookup for every single row even when it was
    // identical to the previous one — on a local/XAMPP-style MySQL setup
    // that nested query was the single biggest cost in the whole import,
    // multiplied by the row count. Caching it per unique combination for
    // the lifetime of one import() call turns N lookups into (at most) the
    // number of distinct elements actually used in the file.
    private array $elementLookupCache = [];

    /**
     * The frontend's CSV template uses human-readable hierarchy names
     * (course/subject/module/competency_unit/element) and separate
     * option_a..option_d columns, instead of the raw element_id / options
     * / correct_options format the backend normalizer expects. This maps
     * a row keyed by the frontend's headers into the backend's raw shape.
     */
    private function adaptFrontendRow(array $raw): array
    {
        // The course column expects just the course code (e.g. "PWAD").
        // A common mistake is pasting the full batch code instead (e.g.
        // "PWAD/CCSL-M/71/01") — since a batch code always starts with its
        // course code followed by "/", tolerate that by keeping only the
        // segment before the first "/".
        $courseCode = trim((string) ($raw['course'] ?? ''));
        if (str_contains($courseCode, '/')) $courseCode = trim(strstr($courseCode, '/', true));

        $cacheKey = strtolower($courseCode . '|' . trim((string)($raw['subject'] ?? '')) . '|' . trim((string)($raw['module'] ?? '')) . '|' . trim((string)($raw['competency_unit'] ?? '')) . '|' . trim((string)($raw['element'] ?? '')));
        if (array_key_exists($cacheKey, $this->elementLookupCache)) {
            $element = $this->elementLookupCache[$cacheKey];
        } else {
            $element = \App\Models\Element::query()
                ->whereRaw('LOWER(elements.name) = ?', [strtolower(trim((string)($raw['element'] ?? '')))])
                ->whereHas('competencyUnit', function ($q) use ($raw, $courseCode) {
                    $q->whereRaw('LOWER(competency_units.name) = ?', [strtolower(trim((string)($raw['competency_unit'] ?? '')))]);
                    $q->whereHas('module', function ($q2) use ($raw, $courseCode) {
                        $q2->whereRaw('LOWER(modules.name) = ?', [strtolower(trim((string)($raw['module'] ?? '')))])
                            ->whereHas('subject', function ($q3) use ($raw, $courseCode) {
                                $q3->whereRaw('LOWER(subjects.name) = ?', [strtolower(trim((string)($raw['subject'] ?? '')))])
                                    ->whereHas('course', fn($q4) => $q4->whereRaw('LOWER(courses.code) = ?', [strtolower($courseCode)]));
                            });
                    });
                })
                ->first();
            $this->elementLookupCache[$cacheKey] = $element;
        }

        if (!$element) {
            throw ValidationException::withMessages(['element_id' => 'No element matches the given course/subject/module/competency_unit/element combination.']);
        }

        $typeMap = ['SINGLE CORRECT' => 'SINGLE_CORRECT', 'MULTIPLE CORRECT' => 'MULTIPLE_CORRECT', 'DESCRIPTIVE' => 'DESCRIPTIVE'];
        $type = $typeMap[strtoupper(trim((string)($raw['question_type'] ?? '')))] ?? strtoupper(trim((string)($raw['question_type'] ?? '')));

        $optionTokens = [];
        foreach (['A' => 'option_a', 'B' => 'option_b', 'C' => 'option_c', 'D' => 'option_d'] as $key => $col) {
            $text = trim((string)($raw[$col] ?? ''));
            if ($text !== '') $optionTokens[] = "{$key}:{$text}";
        }

        $correctOptions = trim((string)($raw['correct_options'] ?? ''));
        $correctOptions = implode('|', array_filter(array_map('trim', preg_split('/[,|]/', $correctOptions))));

        return [
            'element_id' => $element->id,
            'question_code' => strtoupper(Str::slug($courseCode, '')) . '-' . strtoupper(Str::slug($element->code ?? $element->name, '')) . '-' . substr(md5(($raw['question_text'] ?? '') . microtime()), 0, 6),
            'question_text' => $raw['question_text'] ?? '',
            'question_type' => $type,
            'difficulty' => $raw['difficulty'] ?? 'MEDIUM',
            'marks' => $raw['marks'] ?? null,
            'options' => implode('|', $optionTokens),
            'correct_options' => $correctOptions,
            'status' => strtoupper(trim((string)($raw['status'] ?? 'ACTIVE'))),
        ];
    }

    public function import(User $user, UploadedFile $file): QuestionImport
    {
        // A large CSV can take longer than PHP's default 60s request limit
        // to process, especially when every row now runs an extra
        // duplicate/match lookup. This is a background-ish bulk operation,
        // not a quick request, so don't let the default limit kill it
        // mid-file (0 = no limit). Ignored harmlessly if the SAPI disallows
        // changing it (e.g. some CLI/FPM configs).
        @set_time_limit(0);

        $path = $file->store('private/question-imports');
        $imp = QuestionImport::create(['uploaded_by' => $user->id, 'file_name' => $file->getClientOriginalName(), 'file_path' => $path, 'status' => 'PROCESSING']);
        $successful = $failed = $duplicate = $updated = 0;
        $h = fopen($file->getRealPath(), 'r');
        if ($h === false) throw ValidationException::withMessages(['file' => 'Unable to read the uploaded CSV.']);
        $headers = fgetcsv($h);
        // Strip a UTF-8 BOM (common when files are saved from Excel/Sheets)
        // and normalize case/whitespace so header matching is not fragile.
        $headers = array_map(fn($x) => strtolower(trim(str_replace("\xEF\xBB\xBF", '', (string) $x))), is_array($headers) ? $headers : []);

        $backendHeaders = ['element_id', 'question_code', 'question_text', 'question_type', 'difficulty', 'marks', 'options', 'correct_options'];
        $frontendHeaders = ['course', 'subject', 'module', 'competency_unit', 'element', 'question_text', 'question_type', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_options', 'marks', 'status'];
        $missingFrontend = array_values(array_diff($frontendHeaders, $headers));
        $missingBackend = array_values(array_diff($backendHeaders, $headers));
        $isFrontendFormat = empty($missingFrontend);
        $isBackendFormat = empty($missingBackend);

        if (!$headers || (!$isFrontendFormat && !$isBackendFormat)) {
            fclose($h);
            $imp->update(['status' => 'FAILED', 'total_rows' => 0, 'successful_rows' => 0, 'failed_rows' => 0, 'duplicate_rows' => 0]);
            // Report against whichever format is the closer match, so the
            // message reflects what the uploader actually intended to use.
            $useFrontendMessage = count($missingFrontend) <= count($missingBackend);
            $missing = $useFrontendMessage ? $missingFrontend : $missingBackend;
            throw ValidationException::withMessages(['file' => 'CSV headers are invalid or missing: ' . implode(', ', $missing) . '. Detected headers: ' . implode(', ', $headers)]);
        }

        // Read every row into memory first (CSVs here are small, a few
        // hundred rows) so the DB work below can run inside a single
        // transaction instead of one commit per row. On local/XAMPP-style
        // MySQL setups each commit can carry a noticeable disk-flush cost;
        // 200+ separate commits was enough to blow past the request's
        // execution-time limit. One transaction for the whole file turns
        // that into a single commit.
        $csvRows = [];
        $rowNo = 1;
        while (($row = fgetcsv($h)) !== false) {
            $rowNo++;
            $csvRows[] = ['line' => $rowNo, 'cells' => $row];
        }
        fclose($h);

        DB::transaction(function () use ($csvRows, $headers, $isFrontendFormat, $user, $imp, &$successful, &$failed, &$duplicate, &$updated) {
            foreach ($csvRows as $entry) {
                $rowNo = $entry['line'];
                $row = $entry['cells'];
                $raw = array_combine($headers, $row);
                $record = ['import_id' => $imp->id, 'row_number' => $rowNo, 'raw_data' => is_array($raw) ? $raw : ['values' => $row], 'status' => 'FAILED'];
                try {
                    if (!$raw || count($row) !== count($headers)) throw ValidationException::withMessages(['row' => 'Column count does not match the CSV header.']);
                    $mapped = $isFrontendFormat ? $this->adaptFrontendRow($raw) : $raw;
                    $normalized = QuestionBankService::normalizeCsvRow($mapped);
                    if (!$user->isSuperAdmin() && !$user->activeCourses()->whereKey($normalized['question']['course_id'] ?? 0)->exists()) {
                        throw ValidationException::withMessages(['course_id' => 'This row\'s course is outside your assigned scope.']);
                    }
                    $existing = QuestionBankService::findMatch($normalized);
                    if ($existing) {
                        if (QuestionBankService::isIdenticalToExisting($existing, $normalized)) {
                            // Same element + question_text and every other field
                            // (type, marks, difficulty, status, options) already
                            // matches — nothing to do, skip as a true duplicate.
                            $record['question_id'] = $existing->id;
                            $record['status'] = 'DUPLICATE';
                            $record['error_message'] = 'A question with the same text and details already exists for this element; skipped.';
                            $duplicate++;
                        } else {
                            // Same element + question_text but something changed
                            // (e.g. marks, options, status) — replace it in place
                            // instead of silently dropping the row.
                            $q = QuestionBankService::updateNormalized($existing, $normalized);
                            $record['question_id'] = $q->id;
                            $record['status'] = 'UPDATED';
                            $record['error_message'] = 'An existing question for this element was updated with the changed values.';
                            $updated++;
                        }
                    } else {
                        $q = QuestionBankService::createNormalized($normalized);
                        $record['question_id'] = $q->id;
                        $record['status'] = 'SUCCESS';
                        $successful++;
                    }
                } catch (ValidationException $e) {
                    $record['error_message'] = Str::limit(implode(' ', array_merge(...array_values($e->errors()))), 500);
                    $failed++;
                } catch (\Throwable $e) {
                    $record['error_message'] = config('app.debug') ? Str::limit('Row could not be imported: ' . $e->getMessage(), 500) : 'Row could not be imported.';
                    $failed++;
                }
                QuestionImportRow::create($record);
            }
        });

        $imp->update(['status' => $failed ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', 'total_rows' => $successful + $failed + $duplicate + $updated, 'successful_rows' => $successful, 'failed_rows' => $failed, 'duplicate_rows' => $duplicate, 'updated_rows' => $updated]);
        AuditLogger::record('question_import.completed', $imp, ['successful' => $successful, 'failed' => $failed, 'duplicate' => $duplicate, 'updated' => $updated]);
        return $imp->fresh();
    }
}
