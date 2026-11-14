<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | Mirrors the `notifications` table in database/database.sql
 | (our own table, not Laravel's built-in notifications format).
 | Does nothing on Supabase (table already exists).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('notifications')) {
            return;
        }

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users');
            $table->string('message_type', 50);
            $table->text('message');
            $table->timestampTz('scheduled_at')->nullable();
            $table->timestampTz('delivered_at')->nullable();
            $table->boolean('is_read')->default(false);
            $table->string('status', 20)->default('pending'); // pending | sent | failed
            $table->timestampTz('created_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};
