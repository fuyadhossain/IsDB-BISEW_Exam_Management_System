<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class ExamPaper extends Model
{
    protected $guarded = [];
    protected $casts = ['questions_snapshot' => 'array', 'generated_at' => 'datetime'];

    public function exam() { return $this->belongsTo(Exam::class); }
    public function generatedBy() { return $this->belongsTo(User::class, 'generated_by'); }
}
