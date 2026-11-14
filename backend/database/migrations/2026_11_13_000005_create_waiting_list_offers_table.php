<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | Mirrors the `waiting_list_offers` table in database/database.sql.
 | Does nothing on Supabase (table already exists).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('waiting_list_offers')) {
            return;
        }

        Schema::create('waiting_list_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('waiting_list_entry_id')->constrained('waiting_list_entries');
            $table->foreignId('booking_id')->constrained('bookings');
            $table->timestampTz('offered_at')->nullable()->useCurrent();
            $table->timestampTz('expires_at');
            // pending | accepted | declined | expired
            $table->string('status', 20)->default('pending');
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};