<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class AuditLog extends Model {
    protected $table='audit_logs';
    public $timestamps=false;
    protected $guarded=[];
    protected $casts=['payload'=>'array','created_at'=>'datetime'];

    public function user() {
        return $this->belongsTo(User::class, 'actor_id')->withDefault();
    }
}