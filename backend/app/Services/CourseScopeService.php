<?php

namespace App\Services;

use App\Models\{Batch, Course, CompetencyUnit, Element, Exam, ExamSet, Module, Question, Round, Student, Subject, Tsp, User};
use Illuminate\Database\Eloquent\Builder;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class CourseScopeService
{
    public function isSuperAdmin(User $user): bool
    {
        return $user->isSuperAdmin();
    }

    public function catalog(Builder $query, string $type, User $user): Builder
    {
        if ($this->isSuperAdmin($user)) return $query;
        $courses = fn($q) => $q->whereIn('courses.id', $user->activeCourses()->select('courses.id'));
        return match ($type) {
            'courses' => $query->whereIn('id', $user->activeCourses()->select('courses.id')),
            'subjects' => $query->whereIn('course_id', $user->activeCourses()->select('courses.id')),
            'questions' => $query->whereIn('course_id', $user->activeCourses()->select('courses.id')),
            'exam-sets' => $query->whereHas('batch', fn($q) => $q->whereIn('course_id', $user->activeCourses()->select('courses.id'))),
            'competency-units' => $query->whereIn('course_id', $user->activeCourses()->select('courses.id')),
            'modules' => $query->whereHas('subject', fn($q) => $q->whereIn('course_id', $user->activeCourses()->select('courses.id'))),
            'elements' => $query->whereHas('competencyUnit', fn($q) => $q->whereIn('course_id', $user->activeCourses()->select('courses.id'))),
            'batches' => $query->whereIn('course_id', $user->activeCourses()->select('courses.id')),
            'students' => $query->whereHas('batches', fn($q) => $q->whereIn('course_id', $user->activeCourses()->select('courses.id'))),
            'tsps' => $query,
            'rounds' => $query,
            default => $query->whereRaw('1 = 0'),
        };
    }

    public function assertCatalog(User $user, string $type, $id): void
    {
        $model = match ($type) {
            'courses' => Course::class,
            'tsps' => Tsp::class,
            'rounds' => Round::class,
            'batches' => Batch::class,
            'students' => Student::class,
            'subjects' => Subject::class,
            'modules' => Module::class,
            'competency-units' => CompetencyUnit::class,
            'elements' => Element::class,
            default => null,
        };
        abort_unless($model && $this->catalog($model::query()->whereKey($id), $type, $user)->exists(), 403, 'This record is outside your assigned course scope.');
    }

    public function assertQuestion(User $user, Question $question): void
    {
        if (!$this->isSuperAdmin($user) && !$user->activeCourses()->whereKey($question->course_id)->exists()) throw new AccessDeniedHttpException('This question is outside your assigned course scope.');
    }

    public function assertExamSet(User $user, ExamSet $set): void
    {
        $set->loadMissing('batch');
        if (!$this->isSuperAdmin($user) && (!$set->batch || !$user->activeCourses()->whereKey($set->batch->course_id)->exists())) throw new AccessDeniedHttpException('This exam set is outside your assigned course scope.');
    }

    public function assertExam(User $user, Exam $exam): void
    {
        $exam->loadMissing('examSet.batch');
        if (!$this->isSuperAdmin($user) && (!$exam->examSet || !$exam->examSet->batch || !$user->activeCourses()->whereKey($exam->examSet->batch->course_id)->exists())) throw new AccessDeniedHttpException('This exam is outside your assigned course scope.');
    }
}
