<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('waiting_lists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            // waiting | fulfilled | cancelled
            $table->string('status')->default('waiting');
            $table->timestamps(); // created_at decides queue order

            $table->index(['room_id', 'status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('waiting_lists');
    }
};