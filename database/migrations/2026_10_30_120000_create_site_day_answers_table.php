<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The opener, closer and driver of a site day say whether they will do it:
 * yes, or no with a reason (the manager then picks someone else). One answer
 * per day and duty; naming someone else for that duty clears it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_day_answers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_day_id')->constrained('site_days')->cascadeOnDelete();
            $table->string('duty', 16); // opener | closer | driver
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('answer', 8); // yes | no
            $table->string('note', 500)->nullable();
            $table->timestamps();

            $table->unique(['site_day_id', 'duty']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_day_answers');
    }
};
