<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Batch extends Model
{
    protected $guarded = [];
    protected $casts = ['start_date' => 'date', 'end_date' => 'date'];
    protected $appends = ['display_code'];
    public function course()
    {
        return $this->belongsTo(Course::class);
    }
    public function tsp()
    {
        return $this->belongsTo(Tsp::class);
    }
    public function round()
    {
        return $this->belongsTo(Round::class);
    }
    public function students()
    {
        return $this->belongsToMany(Student::class, 'batch_students')->withPivot(['id', 'assigned_at', 'status']);
    }
    public function assignments()
    {
        return $this->hasMany(BatchStudent::class);
    }
    public function examSets()
    {
        return $this->hasMany(ExamSet::class);
    }
    public function displayCode(): string
    {
        $shiftLetter = strtoupper(substr((string) $this->shift, 0, 1));
        $tspShift = trim(($this->tsp?->code ?? '') . ($shiftLetter !== '' ? '-' . $shiftLetter : ''));
        $paddedNumber = str_pad((string) $this->batch_number, 2, '0', STR_PAD_LEFT);
        return implode('/', [$this->course?->code, $tspShift, $this->round?->code, $paddedNumber]);
    }
    // `displayCode()` above was never actually reaching the API response for
    // most endpoints (ExamController's sets()/exams() just return the raw
    // Eloquent models) — a plain method isn't included in JSON
    // serialization unless it's also exposed as an attribute. Without a
    // `display_code` key, the frontend fell back to building the code
    // itself from batch.tsp/batch.round, which were never eager-loaded
    // here either, so the shift and round segments were silently dropped
    // (e.g. "PWAD/M/01" instead of "PWAD/CCSL-M/71/01"). This accessor
    // reuses the same displayCode() logic and appends it automatically.
    public function getDisplayCodeAttribute(): string
    {
        return $this->displayCode();
    }
}
