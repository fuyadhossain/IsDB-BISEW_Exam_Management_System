<?php
namespace App\Support;
use Illuminate\Http\JsonResponse;
class ApiResponse {
    public static function success(mixed $data = null, string $message = 'Request completed successfully', int $status = 200): JsonResponse {
        return response()->json(['success'=>true,'message'=>$message,'data'=>$data], $status);
    }
    public static function error(string $message, int $status = 400, mixed $data = null): JsonResponse {
        return response()->json(['success'=>false,'message'=>$message,'data'=>$data], $status);
    }
    public static function validation($errors): JsonResponse {
        return response()->json(['success'=>false,'message'=>'Validation failed','data'=>['errors'=>$errors]], 422);
    }
}
