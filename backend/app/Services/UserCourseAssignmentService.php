<?php
namespace App\Services;

use App\Models\{Course,User,UserCourse};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UserCourseAssignmentService
{
    public function assign(int $userId, int $courseId, ?int $assignedBy = null): UserCourse
    {
        return DB::transaction(function () use ($userId, $courseId, $assignedBy) {
            $user = User::excludeDeveloperAccounts()->findOrFail($userId);
            $course = Course::findOrFail($courseId);
            $existing = UserCourse::where('user_id', $user->id)->where('course_id', $course->id)->first();
            if ($existing?->status === 'ACTIVE') throw ValidationException::withMessages(['course_id' => 'This user is already actively assigned to the selected course.']);
            $assignment = $existing ?: new UserCourse(['user_id' => $user->id, 'course_id' => $course->id]);
            $assignment->status = 'ACTIVE';
            $assignment->assigned_at = now();
            $assignment->assigned_by = $assignedBy;
            $assignment->save();
            AuditLogger::record($existing ? 'user_course.reactivated' : 'user_course.assigned', $assignment, ['user_id' => $user->id, 'course_id' => $course->id, 'assigned_by' => $assignedBy]);
            return $assignment->load(['user:id,name,email', 'course:id,code,name', 'assignedByUser:id,name,email']);
        });
    }

    public function changeStatus(UserCourse $assignment, string $status, ?int $actedBy = null): UserCourse
    {
        return DB::transaction(function () use ($assignment, $status, $actedBy) {
            $assignment->status = $status;
            if ($status === 'ACTIVE') {
                $assignment->assigned_at = now();
                $assignment->assigned_by = $actedBy;
            }
            $assignment->save();
            AuditLogger::record($status === 'ACTIVE' ? 'user_course.reactivated' : 'user_course.deactivated', $assignment, ['user_id' => $assignment->user_id, 'course_id' => $assignment->course_id, 'assigned_by' => $actedBy]);
            return $assignment->fresh(['user:id,name,email', 'course:id,code,name', 'assignedByUser:id,name,email']);
        });
    }
}
