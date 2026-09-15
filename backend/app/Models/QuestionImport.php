<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class QuestionImport extends Model
{
    protected $guarded = [];
    protected $casts = ['total_rows' => 'integer', 'successful_rows' => 'integer', 'failed_rows' => 'integer', 'duplicate_rows' => 'integer', 'updated_rows' => 'integer'];
    public function rows()
    {
        return $this->hasMany(QuestionImportRow::class, 'import_id');
    }
    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
