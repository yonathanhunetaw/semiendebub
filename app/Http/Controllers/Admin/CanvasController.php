<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Canvas\CanvasVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia; // <-- Make sure to add this import!

class CanvasController extends Controller
{
    // 1. ADD THIS METHOD TO FETCH DATA ON REFRESH
    public function index()
    {
        $latestVersion = CanvasVersion::where('user_id', Auth::id())
            ->latest()
            ->first();

        return Inertia::render('Admin/Canvas', [
            'latestSnapshot' => $latestVersion ? $latestVersion->snapshot_json : null
        ]);
    }

    public function save(Request $request)
    {
        $request->validate([
            'snapshot_json' => 'required|array',
            'comment' => 'nullable|string|max:255',
        ]);

        $version = CanvasVersion::create([
            'user_id'       => Auth::id(),
            'snapshot_json' => $request->snapshot_json,
            'status'        => 'pending',
            'comment'       => $request->input('comment', 'Submitted for review'),
        ]);

        return response()->json([
            'message' => 'Canvas saved for review!',
            'version_id' => $version->id
        ]);
    }
}