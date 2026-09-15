<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Student extends Authenticatable
{
    use HasApiTokens;
    protected $guarded = [];
    protected $casts = ['date_of_birth' => 'date', 'locked_until' => 'datetime'];
    public function batches()
    {
        return $this->belongsToMany(Batch::class, 'batch_students')->withPivot(['id', 'assigned_at', 'status']);
    }
    public function assignments()
    {
        return $this->hasMany(BatchStudent::class);
    }
    public function attempts()
    {
        return $this->hasMany(StudentExamAttempt::class);
    }
    public function isLocked(): bool
    {
        return $this->locked_until && now()->lt($this->locked_until);
    }
}
