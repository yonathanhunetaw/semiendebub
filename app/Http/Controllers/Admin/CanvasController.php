<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Canvas\Canvas;
use App\Models\Canvas\CanvasVersion;
use App\Models\Auth\User;
use App\Services\Admin\ActiveStore;
use Illuminate\Database\Eloquent\Builder;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Throwable;

/**
 * The white board. Canvases belong to a store: a store admin sees only their
 * stores' canvases (their own and those shared with them) and can share only
 * with that store's people and the global admins. A global admin's own
 * canvases have no store and are global.
 */
class CanvasController extends Controller
{
    public function __construct(private readonly ActiveStore $activeStore)
    {
    }

    public function index(Request $request)
    {
        $user = Auth::user();

        // Personal and shared canvases, limited to the stores the user reaches,
        // so a share made across stores before canvases had a store stays shut.
        $canvases = $this->visibleCanvases()->with('user:id,first_name,last_name')->get();

        $selectedCanvasId = $request->input('canvas_id');
        $canvas = $canvases->firstWhere('id', $selectedCanvasId) ?? $canvases->first();

        // If no canvas exists, create a default one
        if (!$canvas) {
            $canvas = Canvas::create(['user_id' => $user->id, 'store_id' => $this->storeForNewCanvas(), 'title' => 'My Canvas']);
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

        $allUsers = $this->shareCandidates($canvas)->get(['users.id', 'first_name', 'last_name']);
        $sharedUsers = $canvas->shares()->get(['users.id', 'users.first_name', 'users.last_name']);

        return Inertia::render('Admin/Canvas', [
            'canvases' => $canvases,
            'activeCanvasId' => $canvas->id,
            'currentUserId' => $user->id,
            'allUsers' => $allUsers,
            'sharedUsers' => $sharedUsers,
            'latestSnapshot' => $latestVersion ? $latestVersion->snapshot_json : null,
            'latestVersionInfo' => $latestVersion ? [
                'id' => $latestVersion->id,
                'user' => $latestVersion->user,
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

        $canvas = Canvas::create(['user_id' => Auth::id(), 'store_id' => $this->storeForNewCanvas(), 'title' => $request->title]);
        return redirect('/canvas?canvas_id=' . $canvas->id)->with('success', 'Canvas created successfully!');
    }

    public function share(Request $request)
    {
        $request->validate([
            'canvas_id' => 'required|exists:canvases,id',
            'user_id' => 'required|exists:users,id',
            'permission' => 'required|in:view,edit',
        ]);

        $canvas = $this->visibleCanvases()->where('canvases.user_id', Auth::id())->findOrFail($request->canvas_id);

        // Checked here, not only in the picker: the candidate list is the rule.
        if (! $this->shareCandidates($canvas)->whereKey($request->user_id)->exists()) {
            return back()->withErrors(['user_id' => 'You can only share with people of this canvas\'s store.']);
        }

        $canvas->shares()->syncWithoutDetaching([$request->user_id => ['permission' => $request->permission]]);

        return back()->with('success', 'Canvas shared successfully!');
    }

    public function unshare(Request $request)
    {
        $request->validate([
            'canvas_id' => 'required|exists:canvases,id',
            'user_id' => 'required|exists:users,id',
        ]);

        $canvas = $this->visibleCanvases()->where('canvases.user_id', Auth::id())->findOrFail($request->canvas_id);
        $canvas->shares()->detach($request->user_id);

        return back()->with('success', 'User removed from canvas successfully!');
    }

    public function getVersion($id)
    {
        $version = CanvasVersion::findOrFail($id);
        abort_unless($this->visibleCanvases()->whereKey($version->canvas_id)->exists(), 404);

        return response()->json($version->snapshot_json);
    }

    public function save(Request $request)
    {
        $request->validate([
            'canvas_id' => 'required|exists:canvases,id',
            'snapshot_json' => 'required|array',
            'comment' => 'nullable|string|max:255',
        ]);

        abort_unless($this->visibleCanvases()->whereKey($request->canvas_id)->exists(), 404);

        $version = CanvasVersion::create([
            'canvas_id' => $request->canvas_id,
            'user_id' => Auth::id(),
            'snapshot_json' => $request->snapshot_json,
            'status' => 'pending',
            'comment' => $request->input('comment', 'Submitted for review'),
        ]);

        return response()->json([
            'message' => 'Canvas saved for review!',
            'version_id' => $version->id
        ]);
    }

    /** The user's own and shared canvases, inside the stores they reach. */
    private function visibleCanvases(): Builder
    {
        $userId = (int) Auth::id();
        $storeIds = $this->activeStore->accessibleIds();

        return Canvas::query()
            ->where(fn (Builder $q) => $q
                ->where('canvases.user_id', $userId)
                ->orWhereHas('shares', fn (Builder $share) => $share->where('users.id', $userId)))
            ->when($storeIds !== null, fn (Builder $q) => $q->whereIn('canvases.store_id', $storeIds ?: [0]));
    }

    /**
     * Who a canvas may be shared with: its store's people plus the global
     * admins. A global canvas follows the active store, or everyone on "All
     * stores".
     */
    private function shareCandidates(Canvas $canvas): Builder
    {
        $storeId = $canvas->store_id ?? $this->activeStore->id();

        return User::query()
            ->whereKeyNot(Auth::id())
            ->when($storeId !== null, fn (Builder $q) => $q->where(fn (Builder $inner) => $inner
                ->where('store_id', $storeId)
                ->orWhere(fn (Builder $global) => $global->whereNull('store_id')->role('admin'))));
    }

    /** A store admin's canvas is their active store's; a global admin's is global. */
    private function storeForNewCanvas(): ?int
    {
        return $this->activeStore->isGlobal() ? null : $this->activeStore->id();
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
            // 🟢 Changed from 's3' (MinIO) to 'r2' and removed object-level visibility
            $path = Storage::disk('r2')->putFile('canvas-assets', $file);

            if (!is_string($path) || $path === '') {
                Log::error('Canvas asset upload did not return a storage path.', [
                    'original_name' => $file->getClientOriginalName(),
                    'mime_type' => $file->getMimeType(),
                    'size' => $file->getSize(),
                ]);

                return response()->json(['error' => 'Image upload did not return a storage path.'], 500);
            }

            // Build the public URL from the R2 disk directly.
            // ImageResolver uses the MinIO/s3 disk, which is wrong here —
            // this file lives on R2, so we must get the URL from the r2 disk.
            $url = Storage::disk('r2')->url($path);

            return response()->json([
                'path' => $path,
                'url'  => $url,
            ]);
        } catch (Throwable $exception) {
            Log::error('Canvas asset upload failed.', [
                'message' => $exception->getMessage(),
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(),
                'size' => $file->getSize(),
            ]);

            return response()->json([
                'error' => 'Image upload failed. Check R2 configuration and Laravel logs.',
            ], 500);
        }
    }
}