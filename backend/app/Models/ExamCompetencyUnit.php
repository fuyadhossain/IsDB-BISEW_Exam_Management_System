<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class ExamCompetencyUnit extends Model { protected $table='exam_competency_units'; public $timestamps=false; protected $guarded=[]; }
