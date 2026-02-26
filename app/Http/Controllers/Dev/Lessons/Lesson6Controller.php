<?php

namespace App\Http\Controllers\Dev\Lessons;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;

// For generating IDs if not using a DB

class Lesson6Controller extends Controller
{
    /**
     * Display the Color Organizer (List of colors).
     * Route: admin.lessons.lesson6 (GET)
     */
    public function index()
    {
        // In a real app: $colors = Color::all();
        $colors = [
            ['id' => '0175d1f0-a8c6-41bf-8d02-df5734d829a4', 'title' => 'ocean at dusk', 'color' => '#00c4e2', 'rating' => 5],
            ['id' => '83c7ba2f-7392-4d7d-9e23-35adbe186046', 'title' => 'lawn', 'color' => '#26ac56', 'rating' => 3],
            ['id' => 'a11e3995-b0bd-4d58-8c48-5e49ae7f7f23', 'title' => 'bright red', 'color' => '#ff0000', 'rating' => 0],
        ];

        return Inertia::render('Dev/Lessons/Lesson6/index', [
            'initialColors' => $colors,
        ]);
    }

    /**
     * Show the form for creating a new color.
     * Route: admin.lessons.create (GET)
     */
    public function create()
    {
        return Inertia::render('Dev/Lessons/Lesson6/CreateColor');
    }

    /**
     * Store a newly created color in storage.
     * Route: admin.lessons.store (POST)
     */
    public function store(Request $request)
    {
        //        $validated = $request->validate([
        //            'title' => 'required|string|max:255',
        //            'color' => 'required|string|size:7', // Hex code
        //        ]);

        // Logic: Color::create([...$validated, 'rating' => 0]);

        return redirect()->route('lessons6.store')
            ->with('success', 'Color added successfully!');
    }

    /**
     * Display a specific color (rarely used for this specific app).
     * Route: admin.lessons.show (GET)
     */
    public function show($id)
    {
        // Logic: $color = Color::findOrFail($id);
        return Inertia::render('Dev/Lessons/Lesson6/ShowColor', ['color' => $id]);
    }

    /**
     * Show the form for editing a color.
     * Route: admin.lessons.edit (GET)
     */
    public function edit($id)
    {
        // Logic: $color = Color::findOrFail($id);
        return Inertia::render('Dev/Lessons/Lesson6/EditColor', ['color' => $id]);
    }

    /**
     * Update the rating or title of a color.
     * Route: admin.lessons.update (PUT/PATCH)
     */
    public function update(Request $request, $id)
    {
        $validated = $request->validate([
            'rating' => 'integer|min:0|max:5',
            'title' => 'string',
        ]);

        // Logic: $color = Color::findOrFail($id);
        // $color->update($validated);

        return back(); // Refresh the page with updated data
    }

    /**
     * Remove a color from the organizer.
     * Route: admin.lessons.destroy (DELETE)
     */
    public function destroy($id)
    {
        // Logic: Color::destroy($id);

        return back()->with('message', 'Color removed.');
    }
}
