<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Canvas\Canvas;
use App\Models\Canvas\CanvasGroup;
use App\Models\Canvas\CanvasVersion;
use App\Http\Requests\Admin\Canvas\CanvasGroupRequest;
use App\Http\Requests\Admin\Canvas\MoveCanvasRequest;
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

        // 1. Fetch the latest saved version for the selected canvas
        $latestVersion = CanvasVersion::with('user:id,first_name,last_name')
            ->where('canvas_id', $canvas->id)
            ->where('is_draft', false)
            ->orderByDesc('id')
            ->first();

        // Your own autosave wins when it is newer than the last saved version.
        $draft = CanvasVersion::where('canvas_id', $canvas->id)
            ->where('user_id', $user->id)
            ->where('is_draft', true)
            ->first();
        $draftIsAhead = $draft && (! $latestVersion || $draft->updated_at->gt($latestVersion->created_at));

        // 2. Fetch all historical metadata so the user can see a list of their saves
        $history = CanvasVersion::with('user:id,first_name,last_name')
            ->where('canvas_id', $canvas->id)
            ->where('is_draft', false)
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
            'latestSnapshot' => $draftIsAhead ? $draft->snapshot_json : $latestVersion?->snapshot_json,
            'latestVersionInfo' => $latestVersion ? [
                'id' => $latestVersion->id,
                'user' => $latestVersion->user,
                'created_at' => $latestVersion->created_at,
            ] : null,
            'groups' => CanvasGroup::where('user_id', $user->id)->orderBy('position')->orderBy('id')->get(['id', 'name']),
            'draftSavedAt' => $draftIsAhead ? $draft->updated_at : null,
            'canEdit' => $this->canEdit($canvas),
            'history' => $history
        ]);
    }

    public function create(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'group_id' => 'nullable|integer',
        ]);

        $canvas = Canvas::create([
            'user_id' => Auth::id(),
            'store_id' => $this->storeForNewCanvas(),
            'canvas_group_id' => $this->ownGroup($request->input('group_id'))?->id,
            'title' => $request->title,
        ]);
        return redirect('/canvas?canvas_id=' . $canvas->id)->with('success', 'Canvas created successfully!');
    }

    public function createGroup(CanvasGroupRequest $request)
    {
        $next = (int) CanvasGroup::where('user_id', Auth::id())->max('position') + 1;
        CanvasGroup::create(['user_id' => Auth::id(), 'name' => trim($request->name), 'position' => $next]);

        return back()->with('success', 'Group created.');
    }

    public function renameGroup(CanvasGroupRequest $request, int $id)
    {
        CanvasGroup::where('user_id', Auth::id())->findOrFail($id)->update(['name' => trim($request->name)]);

        return back()->with('success', 'Group renamed.');
    }

    /** Its canvases fall back to General (the foreign key nulls them). */
    public function deleteGroup(int $id)
    {
        CanvasGroup::where('user_id', Auth::id())->findOrFail($id)->delete();

        return back()->with('success', 'Group deleted. Its canvases are in General.');
    }

    /** Only the person who made a canvas can delete it; people it is shared with cannot. */
    public function destroy(int $id)
    {
        $canvas = $this->visibleCanvases()->findOrFail($id);
        abort_unless((int) $canvas->user_id === (int) Auth::id(), 403, 'Only the owner can delete this canvas.');

        $canvas->shares()->detach();
        $canvas->versions()->delete();
        $canvas->delete();

        return redirect()->route('admin.canvas.index')->with('success', 'Canvas deleted.');
    }

    public function move(MoveCanvasRequest $request, int $id)
    {
        $canvas = $this->visibleCanvases()->where('canvases.user_id', Auth::id())->findOrFail($id);
        $group = $this->ownGroup($request->input('group_id'));
        abort_if($request->filled('group_id') && ! $group, 404);

        $canvas->update(['canvas_group_id' => $group?->id]);

        return back()->with('success', 'Canvas moved.');
    }

    private function ownGroup(mixed $id): ?CanvasGroup
    {
        return $id ? CanvasGroup::where('user_id', Auth::id())->find($id) : null;
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
        $version = CanvasVersion::where('is_draft', false)->findOrFail($id);
        abort_unless($this->visibleCanvases()->whereKey($version->canvas_id)->exists(), 404);

        return response()->json($version->snapshot_json);
    }

    public function save(Request $request)
    {
        $request->validate([
            'canvas_id' => 'required|exists:canvases,id',
            'snapshot_json' => 'required|array',
            'comment' => 'required|string|max:60',
        ]);

        $canvas = $this->editableCanvas((int) $request->canvas_id);

        $version = CanvasVersion::create([
            'canvas_id' => $canvas->id,
            'user_id' => Auth::id(),
            'snapshot_json' => $request->snapshot_json,
            'status' => 'pending',
            'comment' => $request->comment,
        ]);

        // The version now holds everything the draft did.
        $this->draftsOf($canvas)->delete();

        return response()->json([
            'message' => 'Canvas saved for review!',
            'version_id' => $version->id
        ]);
    }

    /** Rewrites the caller's one draft row for this canvas; never touches the history. */
    public function autosave(Request $request)
    {
        $request->validate([
            'canvas_id' => 'required|exists:canvases,id',
            'snapshot_json' => 'required|array',
        ]);

        $canvas = $this->editableCanvas((int) $request->canvas_id);

        $draft = $this->draftsOf($canvas)->first() ?? new CanvasVersion([
            'canvas_id' => $canvas->id,
            'user_id' => Auth::id(),
            'status' => 'draft',
            'comment' => 'Autosave',
            'is_draft' => true,
        ]);
        $draft->snapshot_json = $request->snapshot_json;
        $draft->save();
        $draft->touch();

        return response()->json(['saved_at' => $draft->updated_at]);
    }

    /** Only the person who saved a version can delete it. */
    public function deleteVersion($id)
    {
        $version = CanvasVersion::where('is_draft', false)->findOrFail($id);
        abort_unless($this->visibleCanvases()->whereKey($version->canvas_id)->exists(), 404);
        abort_unless((int) $version->user_id === (int) Auth::id(), 403, 'Only the person who saved this version can delete it.');

        $version->delete();

        return response()->json(['deleted' => $version->id]);
    }

    /** Puts an older version back as a new one on top, so nothing is lost. */
    public function restore($id)
    {
        $old = CanvasVersion::where('is_draft', false)->findOrFail($id);
        $canvas = $this->editableCanvas((int) $old->canvas_id);

        $version = CanvasVersion::create([
            'canvas_id' => $canvas->id,
            'user_id' => Auth::id(),
            'snapshot_json' => $old->snapshot_json,
            'status' => 'pending',
            'comment' => mb_substr('Restored: ' . ($old->comment ?: 'earlier version'), 0, 60),
        ]);
        $this->draftsOf($canvas)->delete();

        return response()->json([
            'version_id' => $version->id,
            'comment' => $version->comment,
            'snapshot_json' => $version->snapshot_json,
        ]);
    }

    private function draftsOf(Canvas $canvas)
    {
        return CanvasVersion::where('canvas_id', $canvas->id)
            ->where('user_id', Auth::id())
            ->where('is_draft', true);
    }

    /** The owner, or someone it was shared with as an editor. */
    private function canEdit(Canvas $canvas): bool
    {
        return (int) $canvas->user_id === (int) Auth::id()
            || $canvas->shares()->where('users.id', Auth::id())->wherePivot('permission', 'edit')->exists();
    }

    private function editableCanvas(int $id): Canvas
    {
        $canvas = $this->visibleCanvases()->findOrFail($id);
        abort_unless($this->canEdit($canvas), 403, 'This canvas is view only for you.');

        return $canvas;
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
            ->visibleTo(Auth::user())
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