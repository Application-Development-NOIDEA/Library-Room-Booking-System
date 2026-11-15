<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'student_id')) {
                $table->string('student_id', 50)
                      ->nullable()
                      ->unique();
            }

            if (!Schema::hasColumn('users', 'role')) {
                $table->string('role', 20)
                      ->default('student');
            }
        });

        // The check below uses Postgres-only tables (pg_constraint).
        // Skip it on SQLite, which the automated tests use.
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // Ensure only student and staff roles are allowed.
        $constraint = DB::selectOne("
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'users_role_check'
            AND conrelid = 'public.users'::regclass
        ");

        if (!$constraint) {
            DB::statement("
                ALTER TABLE public.users
                ADD CONSTRAINT users_role_check
                CHECK (role IN ('student', 'staff'))
            ");
        }
    }

    public function down(): void
    {
        // Intentionally preserve existing user columns and data.
    }
};