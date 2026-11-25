<?php

use App\Models\User;
use App\Services\Ai\SummaryAiClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

uses(RefreshDatabase::class);

/** A fake AI for category suggestions: fixed answer, counts calls. */
class FakeSuggestClient implements SummaryAiClient
{
    public int $calls = 0;

    public function __construct(private ?string $answer) {}

    public function summarize(string $prompt): string
    {
        $this->calls++;
        if ($this->answer === null) {
            throw new RuntimeException('AI is down');
        }

        return $this->answer;
    }
}

function csAi(?string $answer): FakeSuggestClient
{
    $fake = new FakeSuggestClient($answer);
    app()->instance(SummaryAiClient::class, $fake);

    return $fake;
}

function csStudent(string $role = 'student'): User
{
    $user = User::create(['name' => 'Aina', 'email' => uniqid('cs').'@graduate.utm.my', 'password' => 'Password123']);
    $user->role = $role;
    $user->save();

    return $user;
}

function csSuggest(string $description)
{
    return test()->postJson('/api/reports/suggest', ['description' => $description]);
}

test('only signed-in students can ask for a suggestion', function () {
    csSuggest('The light keeps flickering.')->assertUnauthorized();

    Sanctum::actingAs(csStudent('staff'));
    csSuggest('The light keeps flickering.')->assertForbidden();
});

test('a confident AI answer is used', function () {
    $fake = csAi(json_encode(['category' => 'power', 'severity' => 'high', 'summary' => 'Socket is sparking.', 'confidence' => 0.92]));
    Sanctum::actingAs(csStudent());

    csSuggest('The socket near the door made sparks when I plugged in my laptop.')->assertOk()
        ->assertJsonPath('suggestion.category', 'power')
        ->assertJsonPath('suggestion.severity', 'high')
        ->assertJsonPath('suggestion.source', 'ai');

    expect($fake->calls)->toBe(1);
});

test('without AI, keyword rules suggest the category, in English or Malay', function () {
    csAi(null); // AI down
    Sanctum::actingAs(csStudent());

    csSuggest('The ceiling light keeps flickering and the room is dark.')->assertOk()
        ->assertJsonPath('suggestion.category', 'lighting')
        ->assertJsonPath('suggestion.severity', 'medium')
        ->assertJsonPath('suggestion.source', 'rules');

    csSuggest('Wi-Fi keeps disconnecting every few minutes.')->assertJsonPath('suggestion.category', 'wifi');
    csSuggest('Meja dan kerusi rosak, kerusi tidak stabil.')->assertJsonPath('suggestion.category', 'furniture');
    csSuggest('Water is leaking from the aircond onto the floor.')
        ->assertJsonPath('suggestion.category', 'air_conditioning')
        ->assertJsonPath('suggestion.severity', 'high');
});

test('an unsure or broken AI answer falls back to the rules', function () {
    Sanctum::actingAs(csStudent());

    csAi(json_encode(['category' => 'other', 'severity' => 'low', 'summary' => 'Not sure what this is.', 'confidence' => 0.2]));
    csSuggest('There is rubbish and spilled food on the table.')
        ->assertJsonPath('suggestion.category', 'cleanliness')
        ->assertJsonPath('suggestion.source', 'rules');

    csAi('I think it is probably cleanliness!');
    csSuggest('There is rubbish and spilled food on the table.')
        ->assertJsonPath('suggestion.source', 'rules');
});

test('no suggestion when nothing matches, and short text is rejected', function () {
    csAi(null);
    Sanctum::actingAs(csStudent());

    csSuggest('Something strange is going on here.')->assertOk()->assertJsonPath('suggestion', null);
    csSuggest('Broken')->assertStatus(422)->assertJsonPath('message', 'Describe the problem in at least 10 characters.');
});