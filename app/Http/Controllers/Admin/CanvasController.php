<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Canvas\CanvasVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia; // <-- Make sure to add this import!

class CanvasController extends Controller
{
    public function index()
    {
        // 1. Fetch the latest snapshot to show automatically on page refresh
        // Assuming this is a collaborative canvas, we fetch the latest global version and include the user who made it
        $latestVersion = CanvasVersion::with('user:id,first_name,last_name')
            ->orderByDesc('id')
            ->first();

        // 2. Fetch all historical metadata so the user can see a list of their saves
        $history = CanvasVersion::with('user:id,first_name,last_name')
            ->orderByDesc('id')
            ->get(['id', 'user_id', 'comment', 'created_at']);

        return Inertia::render('Admin/Canvas', [
            'latestSnapshot' => $latestVersion ? $latestVersion->snapshot_json : null,
            'latestVersionInfo' => $latestVersion ? [
                'id' => $latestVersion->id,
                'user' => $latestVersion->user,
                'created_at' => $latestVersion->created_at,
            ] : null,
            'history'        => $history
        ]);
    }

    // 3. ADD THIS NEW ENDPOINT to fetch any historical snapshot dynamically
    public function getVersion($id)
    {
        // Removed Auth::id() scope so collaborative history can be fetched
        $version = CanvasVersion::findOrFail($id);
        
        return response()->json($version->snapshot_json);
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