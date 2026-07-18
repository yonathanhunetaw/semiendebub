<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Canvas\CanvasVersion;
use App\Services\ImageResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Throwable;

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

        $file = $request->file('file');

        if (!$file || !$file->isValid()) {
            return response()->json(['error' => 'Uploaded image file is invalid.'], 422);
        }

        try {
            $path = Storage::disk('s3')->putFile('canvas-assets', $file, 'public');

            if (!is_string($path) || $path === '') {
                Log::error('Canvas asset upload did not return a storage path.', [
                    'original_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getMimeType(),
                    'size' => $file->getSize(),
                ]);

                return response()->json(['error' => 'Image upload did not return a storage path.'], 500);
            }

            return response()->json([
                'path' => $path,
                'url' => ImageResolver::resolve($path),
            ]);
        } catch (Throwable $exception) {
            Log::error('Canvas asset upload failed.', [
                'message' => $exception->getMessage(),
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(),
                'size' => $file->getSize(),
            ]);

            return response()->json([
                'error' => 'Image upload failed. Check MinIO/S3 configuration and Laravel logs.',
            ], 500);
        }
    }
}
