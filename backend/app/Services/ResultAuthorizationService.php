<?php

namespace App\Services;

use App\Models\{ExamResult, StudentExamAttempt, User};
use Illuminate\Database\Eloquent\Builder;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class ResultAuthorizationService
{
    public function scope(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) return $query;
        return $query->whereHas('exam.examSet.batch', fn($batch) => $batch->whereIn('course_id', $user->activeCourses()->select('courses.id')));
    }

    /**
     * Same course-scoping rule as scope(), but for a query whose base model
     * IS a Batch (used when listing a whole batch's roster for one exam,
     * rather than filtering existing ExamResult rows).
     */
    public function scopeBatch(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) return $query;
        return $query->whereIn('course_id', $user->activeCourses()->select('courses.id'));
    }

    public function canAccessResult(User $user, ExamResult $result): bool
    {
        if ($user->isSuperAdmin()) return true;
        $result->loadMissing('exam.examSet.batch');
        $courseId = $result->exam?->examSet?->batch?->course_id;
        return $courseId !== null && $user->activeCourses()->whereKey($courseId)->exists();
    }

    public function assertResult(User $user, ExamResult $result): void
    {
        if (!$this->canAccessResult($user, $result)) throw new AccessDeniedHttpException('You do not have permission to access this result.');
    }

    public function assertAttempt(User $user, StudentExamAttempt $attempt): void
    {
        if ($user->isSuperAdmin()) return;
        $attempt->loadMissing('exam.examSet.batch');
        $courseId = $attempt->exam?->examSet?->batch?->course_id;
        if ($courseId === null || !$user->activeCourses()->whereKey($courseId)->exists()) throw new AccessDeniedHttpException('You do not have permission to process this result.');
    }

    /** Used when the base record is a Batch (e.g. saving evidence marks) rather than an ExamResult/attempt. */
    public function assertBatch(User $user, $batch): void
    {
        if ($user->isSuperAdmin()) return;
        if (!$batch || !$user->activeCourses()->whereKey($batch->course_id)->exists()) throw new AccessDeniedHttpException('You do not have permission to modify this result.');
    }
}
