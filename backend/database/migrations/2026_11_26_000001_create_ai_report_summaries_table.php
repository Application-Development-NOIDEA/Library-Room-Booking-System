<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 | AI summaries of issue reports over a period (staff "AI Report Analyzer").
 | Same columns as ai_report_summaries in database/database.sql.
 | Does nothing on Supabase, where the table already exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('ai_report_summaries')) {
            return;
        }

        Schema::create('ai_report_summaries', function (Blueprint $table) {
            $table->id();
            $table->date('period_start');
            $table->date('period_end');
            $table->text('summary_text')->nullable();
            $table->json('issue_counts')->nullable();
            $table->json('recurring_issues')->nullable();
            $table->json('suggested_actions')->nullable();
            $table->timestampTz('generated_at')->nullable()->useCurrent();
        });
    }

    public function down(): void
    {
        // Never drop the shared Supabase table from a rollback.
    }
};