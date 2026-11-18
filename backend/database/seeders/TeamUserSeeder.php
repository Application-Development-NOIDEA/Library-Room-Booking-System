<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Creates (or updates) real accounts for the team from a CSV file,
 * so everyone can sign in with their own UTM email.
 *
 * 1. Copy database/seeders/team-users.example.csv
 *    to   database/seeders/team-users.csv   (this copy is NOT committed to git)
 * 2. Fill in one row per person.
 * 3. php artisan db:seed --class=TeamUserSeeder
 *
 * Leave "password" empty to get a random temporary password, printed once
 * at the end. Running it again updates names and details but keeps
 * existing passwords, unless you fill in a new one.
 */
class TeamUserSeeder extends Seeder
{
    private const FILE = 'seeders/team-users.csv';

    private const MATRIC_PATTERN = '/^[A-Z]\d{2}[A-Z]{2}\d{4}$/';

    public function run(): void
    {
        $path = database_path(self::FILE);

        if (! is_file($path)) {
            $this->command->error('Missing '.$path);
            $this->command->line('Copy team-users.example.csv to team-users.csv, fill it in, then run this again.');

            return;
        }

        $rows = $this->readCsv($path);
        $hasProfileColumns = Schema::hasColumns('users', ['programme', 'year_of_study', 'campus']);
        $summary = [];

        foreach ($rows as $line => $row) {
            $email = strtolower(trim($row['email'] ?? ''));
            $name = preg_replace('/\s+/', ' ', trim($row['name'] ?? ''));
            $role = strtolower(trim($row['role'] ?? '')) ?: 'student';
            $matric = strtoupper(trim($row['student_id'] ?? '')) ?: null;
            $year = trim($row['year_of_study'] ?? '');
            $campus = strtolower(trim($row['campus'] ?? '')) ?: null;
            $password = trim($row['password'] ?? '');

            $problem = match (true) {
                ! filter_var($email, FILTER_VALIDATE_EMAIL) => 'email is not valid',
                ! Str::endsWith($email, ['@graduate.utm.my', '@utm.my']) => 'use a UTM email (@graduate.utm.my or @utm.my)',
                strlen($name) < 3 => 'name is missing',
                ! in_array($role, ['student', 'staff'], true) => 'role must be student or staff',
                $matric !== null && ! preg_match(self::MATRIC_PATTERN, $matric) => 'matric number should look like A22EC0123',
                $year !== '' && ! in_array((int) $year, [1, 2, 3, 4, 5], true) => 'year_of_study must be 1 to 5',
                $campus !== null && ! in_array($campus, ['jb', 'kl'], true) => 'campus must be jb or kl',
                $password !== '' && strlen($password) < 8 => 'password must be at least 8 characters',
                default => null,
            };

            if ($problem) {
                $summary[] = ["line {$line}", $email ?: '?', 'SKIPPED', $problem];

                continue;
            }

            if ($matric && User::where('student_id', $matric)->where('email', '!=', $email)->exists()) {
                $summary[] = ["line {$line}", $email, 'SKIPPED', "matric {$matric} already belongs to another account"];

                continue;
            }

            $user = User::firstOrNew(['email' => $email]);
            $isNew = ! $user->exists;

            $user->name = $name;
            $user->student_id = $matric;
            $user->role = $role;

            if ($hasProfileColumns) {
                $user->programme = trim($row['programme'] ?? '') ?: null;
                $user->year_of_study = $year === '' ? null : (int) $year;
                $user->campus = $campus;
            }

            $shownPassword = '(unchanged)';
            if ($password !== '') {
                $user->password = $password; // hashed by the model
                $shownPassword = $password;
            } elseif ($isNew) {
                $shownPassword = Str::random(10);
                $user->password = $shownPassword;
            }

            $user->save();
            $summary[] = ["line {$line}", $email, $isNew ? 'created' : 'updated', $shownPassword];
        }

        $this->command->table(['Row', 'Email', 'Result', 'Password / note'], $summary);

        if (! $hasProfileColumns) {
            $this->command->warn('programme / year_of_study / campus were skipped: those columns are not in the users table yet.');
        }
        $this->command->line('Send each person their own password privately. Do not post this table in a group chat.');
    }

    /** CSV rows keyed by the header names, numbered by file line. */
    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'r');
        $header = null;
        $rows = [];
        $line = 0;

        while (($cells = fgetcsv($handle, null, ',', '"', '')) !== false) {
            $line++;
            if ($cells === [null] || trim(implode('', $cells)) === '') {
                continue; // blank line
            }
            if ($header === null) {
                // Strip a UTF-8 BOM that Excel adds to the first cell.
                $cells[0] = preg_replace('/^\xEF\xBB\xBF/', '', $cells[0]);
                $header = array_map(fn ($cell) => strtolower(trim($cell)), $cells);

                continue;
            }
            $rows[$line] = array_combine($header, array_pad($cells, count($header), ''));
        }

        fclose($handle);

        return $rows;
    }
}