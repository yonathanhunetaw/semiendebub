<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Canvas\Canvas;
use App\Models\Canvas\CanvasVersion;
use App\Services\ImageResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Throwable;

class CanvasController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();

        // Fetch user's personal and shared canvases
        $canvases = Canvas::with('user:id,first_name,last_name')
            ->where('user_id', $user->id)
            ->orWhereHas('shares', function ($query) use ($user) {
                $query->where('user_id', $user->id);
            })
            ->get();

        $selectedCanvasId = $request->input('canvas_id');
        $canvas = $canvases->firstWhere('id', $selectedCanvasId) ?? $canvases->first();

        // If no canvas exists, create a default one
        if (!$canvas) {
            $canvas = Canvas::create(['user_id' => $user->id, 'title' => 'My Canvas']);
            $canvases->push($canvas);
        }

        // 1. Fetch the latest snapshot for the selected canvas
        $latestVersion = CanvasVersion::with('user:id,first_name,last_name')
            ->where('canvas_id', $canvas->id)
            ->orderByDesc('id')
            ->first();

        // 2. Fetch all historical metadata so the user can see a list of their saves
        $history = CanvasVersion::with('user:id,first_name,last_name')
            ->where('canvas_id', $canvas->id)
            ->orderByDesc('id')
            ->get(['id', 'user_id', 'comment', 'created_at']);

        $allUsers = \App\Models\Auth\User::where('id', '!=', $user->id)->get(['id', 'first_name', 'last_name']);
        $sharedUsers = $canvas->shares()->get(['users.id', 'users.first_name', 'users.last_name']);

        return Inertia::render('Admin/Canvas', [
            'canvases'         => $canvases,
            'activeCanvasId'   => $canvas->id,
            'currentUserId'    => $user->id,
            'allUsers'         => $allUsers,
            'sharedUsers'      => $sharedUsers,
            'latestSnapshot'   => $latestVersion ? $latestVersion->snapshot_json : null,
            'latestVersionInfo' => $latestVersion ? [
                'id'         => $latestVersion->id,
                'user'       => $latestVersion->user,
                'created_at' => $latestVersion->created_at,
            ] : null,
            'history' => $history
        ]);
    }

    public function create(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
        ]);
        
        $canvas = Canvas::create(['user_id' => Auth::id(), 'title' => $request->title]);
        return redirect('/canvas?canvas_id=' . $canvas->id)->with('success', 'Canvas created successfully!');
    }

    public function share(Request $request)
    {
        $request->validate([
            'canvas_id' => 'required|exists:canvases,id',
            'user_id' => 'required|exists:users,id',
        ]);
        
        $canvas = Canvas::where('user_id', Auth::id())->findOrFail($request->canvas_id);
        $canvas->shares()->syncWithoutDetaching([$request->user_id => ['permission' => 'edit']]);
        
        return back()->with('success', 'Canvas shared successfully!');
    }

    public function unshare(Request $request)
    {
        $request->validate([
            'canvas_id' => 'required|exists:canvases,id',
            'user_id' => 'required|exists:users,id',
        ]);
        
        $canvas = Canvas::where('user_id', Auth::id())->findOrFail($request->canvas_id);
        $canvas->shares()->detach($request->user_id);
        
        return back()->with('success', 'User removed from canvas successfully!');
    }

    public function getVersion($subdomain, $id)
    {
        $version = CanvasVersion::findOrFail($id);

        // Return the raw snapshot_json directly — the frontend will sanitize it
        return response()->json($version->snapshot_json);
    }

    public function save(Request $request)
    {
        $request->validate([
            'canvas_id'     => 'required|exists:canvases,id',
            'snapshot_json' => 'required|array',
            'comment'       => 'nullable|string|max:255',
        ]);

        $version = CanvasVersion::create([
            'canvas_id'     => $request->canvas_id,
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
        try {
            // 🟢 Try running the validation rules
            $request->validate([
                'file' => 'required|file|mimes:jpeg,png,jpg,gif,svg,heic,heif,webp|max:10240', // 10MB limit
            ]);
        } catch (ValidationException $validationException) {
            // 🚨 LOG CAT 1: Validation failed (e.g., failed 'image' rule or extension mismatch)
            Log::error('Canvas Upload Validation Failed:', [
                'errors' => $validationException->errors(),
                'has_file' => $request->hasFile('file'),
                'mime_type_detected' => $request->file('file') ? $request->file('file')->getMimeType() : 'No file',
                'client_mime_type' => $request->file('file') ? $request->file('file')->getClientMimeType() : 'No file',
                'client_original_name' => $request->file('file') ? $request->file('file')->getClientOriginalName() : 'No file',
            ]);

            throw $validationException; // Re-throw so frontend gets the 422
        }

        $file = $request->file('file');

        // 🟢 Check if the file wrapper is valid or missing entirely
        if (!$file || !$file->isValid()) {
            // 🚨 LOG CAT 2: File is structural corrupted or failed OS temporary directory allocation
            Log::error('Canvas Upload File Reference Invalid:', [
                'is_null' => is_null($file),
                'error_code' => $file ? $file->getError() : 'No file instance',
                'error_message' => $file ? $file->getErrorMessage() : 'No file instance',
            ]);

            return response()->json(['error' => 'Uploaded image file is invalid.'], 422);
        }

        try {
            $path = Storage::disk('s3')->putFile('canvas-assets', $file, [
                'visibility' => 'public',
                'ContentType' => $file->getClientMimeType()
            ]);

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