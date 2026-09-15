<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Round extends Model { protected $guarded=[]; public function batches(){return $this->hasMany(Batch::class);} }
