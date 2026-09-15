<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Exam extends Model
{
    protected $guarded = [];
    protected $casts = ['start_at' => 'datetime', 'end_at' => 'datetime', 'duration' => 'integer', 'max_marks' => 'decimal:2', 'pass_marks' => 'decimal:2'];
    public function examSet()
    {
        return $this->belongsTo(ExamSet::class);
    }
    public function subjects()
    {
        return $this->belongsToMany(Subject::class, 'exam_subjects');
    }
    public function modules()
    {
        return $this->belongsToMany(Module::class, 'exam_modules');
    }
    public function competencyUnits()
    {
        return $this->belongsToMany(CompetencyUnit::class, 'exam_competency_units')->withPivot('question_count');
    }
    public function attempts()
    {
        return $this->hasMany(StudentExamAttempt::class);
    }
    public function isProtected(): bool
    {
        return in_array($this->status, ['STARTED', 'ENDED', 'PROCESSING', 'COMPLETED'], true);
    }
}
