<?php

namespace App\Services;

use App\Models\{AuditLog, Batch, CompetencyUnit, Element, Exam, ExamAnswer, ExamAttemptQuestion, ExamResult, ExamSet, ExamViolation, Module, Question, QuestionImport, QuestionImportRow, QuestionOption, Setting, Student, StudentExamAttempt, Subject, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

class StudentAuthService
{
    public function authenticate(string $studentId, string $dob): array
    {
        $student = Student::where('student_id', $studentId)->first();
        $generic = 'Invalid student credentials or unavailable account.';
        if (!$student || $student->isLocked() || optional($student->date_of_birth)->format('Y-m-d') !== $dob) {
            if ($student && !$student->isLocked()) {
                $student->increment('failed_login_attempts');
                $student->refresh();
                if ($student->failed_login_attempts >= Setting::get('security.student_max_failed_logins', config('isdb.student_max_failed_logins'))) {
                    $student->update(['locked_until' => now()->addMinutes(Setting::get('security.student_lock_minutes', config('isdb.student_lock_minutes')))]);
                    AuditLogger::record('student.account_locked', $student);
                }
            }
            throw ValidationException::withMessages(['credentials' => $generic]);
        }
        if ($student->status !== 'ACTIVE') throw ValidationException::withMessages(['credentials' => $generic]);
        $student->update(['failed_login_attempts' => 0, 'locked_until' => null]);
        // Revoke every previously issued token for this student before
        // handing out a new one, so logging in on a second device/tab/
        // browser immediately invalidates the first session's token —
        // the next request that first session makes gets a 401 and is
        // signed out — instead of both staying valid at once and letting
        // the same student sit two exam attempts (or the same one) from
        // two places simultaneously.
        $student->tokens()->delete();
        $token = $student->createToken('student-portal', ['student'], now()->addMinutes(Setting::get('security.student_token_expiration_minutes', config('isdb.student_token_expiration_minutes'))))->plainTextToken;
        $eligible = $student->assignments()->where('status', 'ACTIVE')->exists();
        AuditLogger::record('student.login', $student);
        return ['token' => $token, 'student_id' => $student->student_id, 'name' => $student->name, 'date_of_birth' => $student->date_of_birth?->format('Y-m-d'), 'status' => $student->status, 'portal_access' => $eligible];
    }
}
