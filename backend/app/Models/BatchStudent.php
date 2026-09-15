<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class BatchStudent extends Model { protected $table='batch_students'; public $timestamps=false; protected $guarded=[]; protected $casts=['assigned_at'=>'datetime']; public function batch(){return $this->belongsTo(Batch::class);} public function student(){return $this->belongsTo(Student::class);} }
