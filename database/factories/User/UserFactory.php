<?php

namespace Database\Factories\User;

use App\Models\Auth\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = User::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'first_name' => $this->faker->firstName(),
            'last_name' => $this->faker->lastName(),
            'phone_number' => $this->faker->unique()->regexify('[0-9]{10}'), // Use regex for phone number
            'email' => $this->faker->unique()->safeEmail(),
            'email_verified_at' => now(),
            // A plain user by default.
            //
            // This picked randomly from admin/seller/stock_keeper, which was
            // harmless only while the column was decorative: the seeder then
            // assigned every factory user the `user` role, so the column and the
            // gate disagreed on ten accounts. Now that User keeps the two in
            // step, a random privileged column value would mint real admins.
            // Tests that want a role pass one.
            'role' => 'user',
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            'created_by' => 1, // Assuming a user with ID 1 is creating the user

        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
