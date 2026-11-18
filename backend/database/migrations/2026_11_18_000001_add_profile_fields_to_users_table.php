<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | Profile fields for students: programme, year of study and campus.
 |
 | On Supabase these columns are added with the SQL in database/database.sql
 | (run once in the Supabase SQL editor), so this only adds whatever is
 | still missing. It is mainly here so the automated tests have them.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('users')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'programme')) {
                $table->string('programme', 150)->nullable();
            }
            if (! Schema::hasColumn('users', 'year_of_study')) {
                $table->smallInteger('year_of_study')->nullable();
            }
            if (! Schema::hasColumn('users', 'campus')) {
                $table->string('campus', 10)->nullable(); // jb | kl
            }
        });
    }

    public function down(): void
    {
        // Keep the shared Supabase columns and their data.
    }
};