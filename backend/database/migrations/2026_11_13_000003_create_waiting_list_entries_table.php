<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | Mirrors the `waiting_list_entries` table in database/database.sql.
 | Does nothing on Supabase (table already exists).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('waiting_list_entries')) {
            return;
        }

        Schema::create('waiting_list_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users');
            $table->string('room_type', 50);
            $table->foreignId('room_id')->nullable()->constrained('rooms');
            $table->timestampTz('wanted_start');
            $table->timestampTz('wanted_end');
            $table->integer('party_size');
            $table->timestampTz('joined_at')->nullable()->useCurrent();
            // waiting | offered | fulfilled | cancelled | expired
            $table->string('status', 20)->default('waiting');
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};
