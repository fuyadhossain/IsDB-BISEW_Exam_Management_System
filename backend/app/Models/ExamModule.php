<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class ExamModule extends Model { protected $table='exam_modules'; public $timestamps=false; protected $guarded=[]; }
