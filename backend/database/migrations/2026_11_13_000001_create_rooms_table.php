<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();          // "Discussion Room 01"
            $table->string('type')->index();           // carrel | discussion | meeting
            $table->unsignedSmallInteger('capacity')->default(1);
            $table->boolean('is_active')->default(true); // false = closed / under maintenance
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rooms');
    }
};