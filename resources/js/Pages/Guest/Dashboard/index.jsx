import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import { useState, useEffect } from 'react';

export default function Dashboard() {
    // 1. Setup State for our API data
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // 2. Fetch the API data when the component mounts
    useEffect(() => {
        const fetchWeather = async () => {
            try {
                // Using a free open API (Open-Meteo) - No API Key required for testing!
                const response = await fetch(
                    'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current_weather=true'
                );
                if (!response.ok) throw new Error('Weather data unavailable');

                const data = await response.json();
                setWeather(data.current_weather);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchWeather();
    }, []); // Empty array means this runs once on load

    return (
        <AuthenticatedLayout
            header={
                <h2 className="text-xl font-semibold leading-tight text-gray-800">
                    Dashboard
                </h2>
            }
        >
            <Head title="Dashboard" />

            <div className="py-12">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 space-y-6">

                    {/* Welcome Card */}
                    <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg">
                        <div className="p-6 text-gray-900">
                            You're logged in!
                        </div>
                    </div>

                    {/* Weather Service Card */}
                    <div className="overflow-hidden bg-white shadow-sm sm:rounded-lg p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Live Weather Service</h3>

                        {loading && (
                            <div className="animate-pulse flex space-x-4">
                                <div className="flex-1 space-y-4 py-1">
                                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                    <div className="h-4 bg-gray-200 rounded"></div>
                                </div>
                            </div>
                        )}

                        {error && <div className="text-red-500">Error: {error}</div>}

                        {weather && (
                            <div className="flex items-center space-x-4">
                                <div className="text-4xl font-bold text-blue-600">
                                    {weather.temperature}°C
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 uppercase tracking-wide">Current Condition</p>
                                    <p className="font-semibold text-gray-700">
                                        Wind Speed: {weather.windspeed} km/h
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </AuthenticatedLayout>
    );
}
