<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | Mirrors the `bookings` table in database/database.sql.
 | Does nothing on Supabase (table already exists).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('bookings')) {
            return;
        }

        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users');
            $table->foreignId('room_id')->constrained('rooms');
            $table->timestampTz('start_at');
            $table->timestampTz('end_at');
            // held | confirmed | checked_in | checked_out | cancelled | no_show
            $table->string('status', 20)->default('confirmed');
            $table->string('qr_token_hash', 255)->nullable();
            $table->timestampTz('created_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};
