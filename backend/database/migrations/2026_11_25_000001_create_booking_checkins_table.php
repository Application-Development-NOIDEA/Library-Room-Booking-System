<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('booking_checkins')) {
            return;
        }

        Schema::create('booking_checkins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->timestampTz('checked_in_at')->nullable();
            $table->foreignId('checked_in_by')->nullable()->constrained('users');
            $table->timestampTz('checked_out_at')->nullable();
            $table->foreignId('checked_out_by')->nullable()->constrained('users');
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};