<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | Mirrors the `rooms` table in database/database.sql.
 | On Supabase the table already exists, so this does nothing there;
 | it only builds the table for local/test databases.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('rooms')) {
            return;
        }

        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('room_code', 50)->unique();
            $table->string('room_name', 150);
            $table->string('room_type', 50);
            $table->integer('capacity');
            $table->string('location', 150)->nullable();
            $table->jsonb('facilities')->nullable();
            $table->string('status', 20)->default('active'); // active | maintenance
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};
