<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class ExamSubject extends Model { protected $table='exam_subjects'; public $timestamps=false; protected $guarded=[]; }
