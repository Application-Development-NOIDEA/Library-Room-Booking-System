<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | Mirrors the `issue_reports` table in database/database.sql.
 | Does nothing on Supabase (table already exists).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('issue_reports')) {
            return;
        }

        Schema::create('issue_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings');
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('room_id')->constrained('rooms');
            $table->string('issue_category', 100);
            $table->text('description')->nullable();
            $table->text('image_path')->nullable();
            // submitted | in_progress | resolved
            $table->string('status', 20)->default('submitted');
            $table->timestampTz('created_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};