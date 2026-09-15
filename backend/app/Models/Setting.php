<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Simple key-value settings store backing the admin Settings page.
 *
 * Every value has a caller-supplied default (the same hardcoded value
 * this app used before Settings existed), so a fresh install with an
 * empty `settings` table behaves identically to before — nothing reads
 * this table and gets a hard failure, it just falls back to the default.
 */
class Setting extends Model
{
    protected $guarded = [];
    private const CACHE_TTL = 300;

    public static function get(string $key, $default = null)
    {
        return Cache::remember("setting:{$key}", self::CACHE_TTL, function () use ($key, $default) {
            $row = static::where('key', $key)->first();
            if (!$row || $row->value === null) return $default;
            $decoded = json_decode($row->value, true);
            return json_last_error() === JSON_ERROR_NONE ? $decoded : $row->value;
        });
    }

    public static function set(string $key, $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => json_encode($value)]);
        Cache::forget("setting:{$key}");
    }

    /** @param array<string, mixed> $values */
    public static function setMany(array $values): void
    {
        foreach ($values as $key => $value) {
            static::set($key, $value);
        }
    }
}
