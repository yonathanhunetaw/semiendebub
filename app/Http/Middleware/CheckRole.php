<?php
    namespace App\Http\Middleware;

    use Closure;
    use Illuminate\Http\Request;
    use Symfony\Component\HttpFoundation\Response;
    use Illuminate\Support\Facades\Auth;
    use Illuminate\Support\Facades\Log;

   class CheckRole
   {
        public function handle(Request $request, Closure $next, $role): Response
        {
            $user = Auth::user();

            // Log user info
            Log::info('User Info', ['user' => $user, 'role_from_route' => $role]);

            // If no user is authenticated, redirect to login
            if (!$user) {
                Log::info('User not authenticated. Redirecting to login.');
                return redirect()->route('login')->with('error', 'You need to be logged in!');
            }

            // Check if the authenticated user's role matches the expected role
            if ($user->role !== $role) {
                Log::info('Access denied: User role mismatch. Expected role: ' . $role . ', Actual role: ' . $user->role);

                // Redirect the user to their own dashboard based on their role
                if ($user->role === 'Admin') {
                    return redirect()->route('admin.dashboard'); // Admin dashboard
                }

                if ($user->role === 'Seller') {
                    session(['theme' => 'sellerandstock_keepertheme']);
                    Log::info('Session theme set:', ['theme' => session('theme')]);
                    session()->save(); // Explicitly save the session if necessary
                    return redirect()->route('seller.dashboard'); // Seller dashboard
                }

                if ($user->role === 'Stock Keeper') {
                    return redirect()->route('stock_keeper.dashboard'); // Stock keeper dashboard
                }

                if ($user->role === 'User') {
                    return redirect()->route('user.home'); // Stock keeper dashboard
                }

                // If no valid role is found, redirect to default Home
                return redirect()->route('home'); // Default Home
            }

            // If the user's role matches the required role, proceed with the request
            return $next($request);
        }
   }
