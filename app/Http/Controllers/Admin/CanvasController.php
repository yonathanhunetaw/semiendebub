<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CanvasVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CanvasController extends Controller
{
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