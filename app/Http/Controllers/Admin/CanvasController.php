<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Canvas\CanvasVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class CanvasController extends Controller
{
    public function index()
    {
        // 1. Fetch the latest snapshot to show automatically on page refresh
        $latestVersion = CanvasVersion::with('user:id,first_name,last_name')
            ->orderByDesc('id')
            ->first();

        // 2. Fetch all historical metadata so the user can see a list of their saves
        $history = CanvasVersion::with('user:id,first_name,last_name')
            ->orderByDesc('id')
            ->get(['id', 'user_id', 'comment', 'created_at']);

        return Inertia::render('Admin/Canvas', [
            'latestSnapshot'   => $latestVersion ? $latestVersion->snapshot_json : null,
            'latestVersionInfo' => $latestVersion ? [
                'id'         => $latestVersion->id,
                'user'       => $latestVersion->user,
                'created_at' => $latestVersion->created_at,
            ] : null,
            'history' => $history
        ]);
    }

    public function getVersion($id)
    {
        $version = CanvasVersion::findOrFail($id);

        // Return the raw snapshot_json directly — the frontend will sanitize it
        return response()->json($version->snapshot_json);
    }

    public function save(Request $request)
    {
        $request->validate([
            'snapshot_json' => 'required|array',
            'comment'       => 'nullable|string|max:255',
        ]);

        $version = CanvasVersion::create([
            'user_id'       => Auth::id(),
            'snapshot_json' => $request->snapshot_json,
            'status'        => 'pending',
            'comment'       => $request->input('comment', 'Submitted for review'),
        ]);

        return response()->json([
            'message'    => 'Canvas saved for review!',
            'version_id' => $version->id
        ]);
    }

    public function uploadAsset(Request $request)
    {
        $request->validate([
            'file' => 'required|image|max:10240', // 10MB limit
        ]);

        if ($request->file('file')) {
            // Store the file in the canvas-assets folder on the s3 (MinIO) disk
            $path = Storage::disk('s3')->putFile('canvas-assets', $request->file('file'), 'public');

            // Generate the absolute public URL for the browser to load
            $url = Storage::disk('s3')->url($path);

            return response()->json(['url' => $url]);
        }

        return response()->json(['error' => 'File upload failed'], 400);
    }
}