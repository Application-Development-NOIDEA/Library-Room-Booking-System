<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DemoUserSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = [
            ['email' => 'ariana@graduate.utm.my', 'name' => 'Ariana Arissa Binti Azri', 'student_id' => 'A25CS0045', 'role' => 'student'],
            ['email' => 'staff@utm.my', 'name' => 'Library Staff', 'student_id' => null, 'role' => 'staff'],
        ];

        foreach ($accounts as $a) {
            $user = User::firstOrNew(['email' => $a['email']]);

            if (! $user->exists) {
                $user->name = $a['name'];
                $user->student_id = $a['student_id'];
                $user->role = $a['role'];
                $user->password = 'Password123';
                $user->save();
            }
        }
    }
}