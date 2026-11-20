<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | Mirrors the `booking_extensions` table in database/database.sql.
 | Does nothing on Supabase (table already exists). Mainly for the tests.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('booking_extensions')) {
            return;
        }

        Schema::create('booking_extensions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings');
            $table->timestampTz('requested_end_at');
            // pending | approved | rejected
            $table->string('status', 20)->default('pending');
            $table->timestampTz('requested_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};