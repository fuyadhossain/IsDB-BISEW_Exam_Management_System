<?php
namespace Tests\Feature;
use Tests\TestCase;
class BackendSmokeTest extends TestCase { public function test_health_endpoint_returns_safe_payload(): void { $this->getJson('/api/v1/health')->assertOk()->assertJsonPath('success',true)->assertJsonPath('data.status','ok'); } public function test_admin_authentication_route_exists(): void { $this->postJson('/api/v1/auth/login',[])->assertStatus(422)->assertJsonPath('success',false); } }
