<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('booking_extensions')) {
            return;
        }

        Schema::create('booking_extensions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->timestampTz('requested_end_at');
            $table->string('status', 20)->default('pending'); // pending | approved | rejected
            $table->timestampTz('requested_at')->useCurrent();
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};