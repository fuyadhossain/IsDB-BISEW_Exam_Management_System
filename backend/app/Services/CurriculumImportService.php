<?php

namespace App\Services;

use App\Models\{CompetencyUnit, Course, Element, Module, Subject, User};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Bulk-creates (or updates) curriculum records (subjects, modules,
 * competency units, elements) from a CSV that references parents by
 * human-readable name (course code / subject name / module name /
 * competency unit name), mirroring how ImportService::adaptFrontendRow
 * resolves questions.
 *
 * A row whose name already exists under the same parent is NOT rejected —
 * it is treated as an update (status refreshed for subjects/modules/
 * competency units; elements simply match by name, since they carry no
 * other editable field). This keeps a re-uploaded or corrected file from
 * ever failing on "already exists" and lets one file both create new
 * records and refresh existing ones in the same pass.
 *
 * The whole file is still applied inside a single DB transaction: the
 * first genuinely invalid/unresolved row (bad course, missing parent,
 * etc.) aborts the entire import, so nothing partial is ever left behind.
 */
class CurriculumImportService
{
    private const SPECS = [
        'subjects' => ['columns' => ['course', 'name', 'status'], 'label' => 'Subject'],
        'modules' => ['columns' => ['course', 'subject', 'name', 'status'], 'label' => 'Module'],
        'competency-units' => ['columns' => ['course', 'subject', 'module', 'name', 'status'], 'label' => 'Competency unit'],
        'elements' => ['columns' => ['course', 'subject', 'module', 'competency_unit', 'name'], 'label' => 'Element'],
        'curriculum' => ['columns' => ['course', 'subject', 'module', 'competency_unit', 'element'], 'label' => 'Curriculum'],
    ];

    public function import(User $user, string $type, UploadedFile $file): array
    {
        $spec = self::SPECS[$type] ?? null;
        abort_unless($spec, 422, 'Unsupported curriculum import type.');
        $expected = $spec['columns'];

        $handle = fopen($file->getRealPath(), 'rb');
        if ($handle === false) throw ValidationException::withMessages(['file' => 'Unable to read the uploaded CSV.']);
        $headers = array_map(fn($v) => strtolower(trim(str_replace("\xEF\xBB\xBF", '', (string) $v))), fgetcsv($handle) ?: []);

        $errors = [];
        if ($headers !== $expected) {
            $errors[] = ['line' => 1, 'column' => 'Header', 'message' => 'The CSV header must match the downloaded ' . $spec['label'] . ' template exactly: ' . implode(', ', $expected) . '.'];
        }

        $rows = [];
        $line = 1;
        while (($cells = fgetcsv($handle)) !== false) {
            $line++;
            if (count($cells) === 1 && trim((string) $cells[0]) === '') continue;
            if (count($cells) !== count($expected)) {
                $errors[] = ['line' => $line, 'column' => 'CSV format', 'message' => 'The number of columns does not match the template.'];
                continue;
            }
            $row = array_combine($expected, array_map(fn($v) => trim((string) $v), $cells));
            foreach ($expected as $field) {
                if ($row[$field] === '') $errors[] = ['line' => $line, 'column' => $field, 'message' => 'This value is required.'];
            }
            if (array_key_exists('status', $row) && $row['status'] !== '' && !in_array(strtolower($row['status']), ['active', 'inactive'], true)) {
                $errors[] = ['line' => $line, 'column' => 'status', 'message' => 'Use Active or Inactive.'];
            }
            $rows[] = ['line' => $line, 'data' => $row];
        }
        fclose($handle);

        // Rows repeating the exact same hierarchy path + name are simply
        // redundant within the file (not an error) — the second occurrence
        // is a harmless no-op once the first has created/updated the
        // record, so duplicates inside the file are de-duplicated instead
        // of being flagged.
        $rows = array_values(array_reduce($rows, function ($carry, $entry) {
            $key = strtolower(implode('|', $entry['data']));
            if (!isset($carry[$key])) $carry[$key] = $entry;
            return $carry;
        }, []));

        if ($errors) throw ValidationException::withMessages(['file' => $errors]);
        if (!$rows) throw ValidationException::withMessages(['file' => [['line' => 2, 'column' => 'Data rows', 'message' => 'The file contains no data rows.']]]);

        $result = DB::transaction(function () use ($rows, $type, $user) {
            // Cache resolved parents within this import so a file with many
            // rows under the same subject/module doesn't re-run the same
            // lookup query per row.
            $courses = [];
            $subjects = [];
            $modules = [];
            $competencyUnits = [];
            $created = 0;
            $updated = 0;
            $breakdown = [
                'subjects' => ['created' => 0, 'updated' => 0],
                'modules' => ['created' => 0, 'updated' => 0],
                'competencyUnits' => ['created' => 0, 'updated' => 0],
                'elements' => ['created' => 0, 'updated' => 0],
            ];

            // Update-or-create a subject/module/competency unit by name
            // under its parent. Returns [record, wasCreated].
            $upsertSubject = function ($course, string $name, string $status) {
                $existing = Subject::where('course_id', $course->id)->whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                if ($existing) {
                    $existing->update(['name' => $name, 'status' => $status]);
                    return [$existing, false];
                }
                return [Subject::create(['course_id' => $course->id, 'name' => $name, 'status' => $status]), true];
            };
            $upsertModule = function ($subject, string $name, string $status) {
                $existing = Module::where('subject_id', $subject->id)->whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                if ($existing) {
                    $existing->update(['name' => $name, 'status' => $status]);
                    return [$existing, false];
                }
                return [Module::create(['subject_id' => $subject->id, 'name' => $name, 'status' => $status]), true];
            };
            $upsertCompetencyUnit = function ($module, $course, string $name, string $status) {
                $existing = CompetencyUnit::where('module_id', $module->id)->whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                if ($existing) {
                    $existing->update(['name' => $name, 'status' => $status]);
                    return [$existing, false];
                }
                return [CompetencyUnit::create(['module_id' => $module->id, 'course_id' => $course->id, 'name' => $name, 'status' => $status]), true];
            };
            // Elements carry no other editable field besides their name and
            // parent, so an "update" is a no-op match rather than a write.
            $upsertElement = function ($cu, string $name) {
                $existing = Element::where('competency_unit_id', $cu->id)->whereRaw('LOWER(name) = ?', [strtolower($name)])->first();
                if ($existing) return [$existing, false];
                return [Element::create(['competency_unit_id' => $cu->id, 'name' => $name]), true];
            };

            foreach ($rows as $entry) {
                $row = $entry['data'];
                $line = $entry['line'];
                $status = strtoupper($row['status'] ?? 'ACTIVE') ?: 'ACTIVE';

                $courseKey = strtolower($row['course']);
                $course = $courses[$courseKey] ??= Course::query()->whereRaw('LOWER(code) = ?', [$courseKey])->first();
                if (!$course) throw ValidationException::withMessages(['course' => ["Row {$line}: No course matches code \"{$row['course']}\"."]]);
                if (!$user->isSuperAdmin() && !$user->activeCourses()->whereKey($course->id)->exists()) {
                    throw ValidationException::withMessages(['course' => ["Row {$line}: Course \"{$row['course']}\" is outside your assigned scope."]]);
                }

                if ($type === 'curriculum') {
                    // Full hierarchy row: resolve, create, or update each
                    // level in order, then resolve the leaf element.
                    $subjectKey = $courseKey . '|' . strtolower($row['subject']);
                    if (!isset($subjects[$subjectKey])) {
                        [$subject, $wasCreated] = $upsertSubject($course, $row['subject'], 'ACTIVE');
                        $subjects[$subjectKey] = $subject;
                        $breakdown['subjects'][$wasCreated ? 'created' : 'updated']++;
                    }
                    $subject = $subjects[$subjectKey];

                    $moduleKey = $subjectKey . '|' . strtolower($row['module']);
                    if (!isset($modules[$moduleKey])) {
                        [$module, $wasCreated] = $upsertModule($subject, $row['module'], 'ACTIVE');
                        $modules[$moduleKey] = $module;
                        $breakdown['modules'][$wasCreated ? 'created' : 'updated']++;
                    }
                    $module = $modules[$moduleKey];

                    $cuKey = $moduleKey . '|' . strtolower($row['competency_unit']);
                    if (!isset($competencyUnits[$cuKey])) {
                        [$cu, $wasCreated] = $upsertCompetencyUnit($module, $course, $row['competency_unit'], 'ACTIVE');
                        $competencyUnits[$cuKey] = $cu;
                        $breakdown['competencyUnits'][$wasCreated ? 'created' : 'updated']++;
                    }
                    $cu = $competencyUnits[$cuKey];

                    [, $wasCreated] = $upsertElement($cu, $row['element']);
                    $breakdown['elements'][$wasCreated ? 'created' : 'updated']++;
                    $wasCreated ? $created++ : $updated++;
                    continue;
                }

                if ($type === 'subjects') {
                    [, $wasCreated] = $upsertSubject($course, $row['name'], $status);
                    $wasCreated ? $created++ : $updated++;
                    continue;
                }

                $subjectKey = $courseKey . '|' . strtolower($row['subject']);
                $subject = $subjects[$subjectKey] ??= Subject::where('course_id', $course->id)->whereRaw('LOWER(name) = ?', [strtolower($row['subject'])])->first();
                if (!$subject) throw ValidationException::withMessages(['subject' => ["Row {$line}: No subject \"{$row['subject']}\" found under course {$course->code}."]]);

                if ($type === 'modules') {
                    [, $wasCreated] = $upsertModule($subject, $row['name'], $status);
                    $wasCreated ? $created++ : $updated++;
                    continue;
                }

                $moduleKey = $subjectKey . '|' . strtolower($row['module']);
                $module = $modules[$moduleKey] ??= Module::where('subject_id', $subject->id)->whereRaw('LOWER(name) = ?', [strtolower($row['module'])])->first();
                if (!$module) throw ValidationException::withMessages(['module' => ["Row {$line}: No module \"{$row['module']}\" found under subject \"{$row['subject']}\"."]]);

                if ($type === 'competency-units') {
                    [, $wasCreated] = $upsertCompetencyUnit($module, $course, $row['name'], $status);
                    $wasCreated ? $created++ : $updated++;
                    continue;
                }

                $cuKey = $moduleKey . '|' . strtolower($row['competency_unit']);
                $cu = $competencyUnits[$cuKey] ??= CompetencyUnit::where('module_id', $module->id)->whereRaw('LOWER(name) = ?', [strtolower($row['competency_unit'])])->first();
                if (!$cu) throw ValidationException::withMessages(['competency_unit' => ["Row {$line}: No competency unit \"{$row['competency_unit']}\" found under module \"{$row['module']}\"."]]);

                [, $wasCreated] = $upsertElement($cu, $row['name']);
                $wasCreated ? $created++ : $updated++;
            }

            return ['created' => $created, 'updated' => $updated, 'breakdown' => $breakdown];
        });

        AuditLogger::record("{$type}_import.completed", $user, ['created' => $result['created'], 'updated' => $result['updated']]);
        return [
            'imported' => $result['created'] + $result['updated'],
            'created' => $result['created'],
            'updated' => $result['updated'],
            'status' => 'COMPLETED',
            'breakdown' => $result['breakdown'],
        ];
    }
}
