<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | One row per issue report: what the AI said and whether staff had to step in.
 | Does nothing on Supabase if the table already exists (see database.sql).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('issue_report_analyses')) {
            return;
        }

        Schema::create('issue_report_analyses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('issue_report_id')->constrained('issue_reports')->cascadeOnDelete()->unique();

            // auto_accepted | needs_review | staff_reviewed
            $table->string('state', 20);
            // Why staff must look: ai_error | invalid_output | low_confidence
            $table->string('review_reason', 30)->nullable();

            // What the AI said (empty when the AI failed)
            $table->string('ai_category', 100)->nullable();
            $table->string('ai_severity', 10)->nullable();
            $table->text('ai_summary')->nullable();
            $table->decimal('ai_confidence', 4, 3)->nullable();
            $table->text('ai_raw_output')->nullable();

            // What the system uses: the AI's answer, or staff's correction
            $table->string('final_category', 100)->nullable();
            $table->string('final_severity', 10)->nullable();
            $table->text('final_summary')->nullable();

            $table->foreignId('reviewed_by')->nullable()->constrained('users');
            $table->timestampTz('reviewed_at')->nullable();
            $table->text('review_note')->nullable();

            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};