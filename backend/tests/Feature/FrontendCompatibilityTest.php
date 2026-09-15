<?php

namespace Tests\Feature;

use Tests\TestCase;

class FrontendCompatibilityTest extends TestCase
{
    public function test_legacy_admin_and_student_routes_are_mounted(): void
    {
        $this->getJson('/api/admin/results')->assertStatus(401)->assertJsonPath('success', false);
        $this->getJson('/api/admin/results/filter-options')->assertStatus(401)->assertJsonPath('success', false);
        $this->postJson('/api/student/exam/login', [
            'student_id' => 'missing-student',
        ])->assertStatus(422)->assertJsonPath('success', false);
    }

    public function test_legacy_import_route_requires_admin_authentication(): void
    {
        $this->post('/api/admin/imports/questions')->assertStatus(401);
    }
}
