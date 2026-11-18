<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $table = 'users';

    public const UPDATED_AT = null;

    /** Campus ids, same as CAMPUSES in frontend/src/student/Profile.jsx */
    public const CAMPUSES = ['jb', 'kl'];

    protected $fillable = [
        'name',
        'email',
        'password',
        'student_id',
        'programme',
        'year_of_study',
        'campus',
    ];

    protected $hidden = [
        'password',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'year_of_study' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function isStudent(): bool
    {
        return $this->role === 'student';
    }

    public function isStaff(): bool
    {
        return $this->role === 'staff';
    }

    /** What the frontend gets after login, from /auth/me and after saving the profile. */
    public function toProfileArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'student_id' => $this->student_id,
            'role' => $this->role,
            'programme' => $this->programme,
            'year_of_study' => $this->year_of_study,
            'campus' => $this->campus,
        ];
    }
}