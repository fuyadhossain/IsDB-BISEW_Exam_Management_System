<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Tsp extends Model { protected $table='tsps'; protected $guarded=[]; public function batches(){return $this->hasMany(Batch::class);} }
