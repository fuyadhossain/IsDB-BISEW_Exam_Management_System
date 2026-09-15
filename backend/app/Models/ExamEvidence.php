<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExamEvidence extends Model
{
    // Eloquent's pluralizer treats "evidence" as uncountable and guesses
    // the table name as "exam_evidence" (no trailing s) — but the
    // migration created it as "exam_evidences", matching the plural style
    // the rest of this app's tables use. Pin it explicitly so the model
    // doesn't silently query a table that was never created.
    protected $table = 'exam_evidences';
    protected $guarded = [];

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }
}
