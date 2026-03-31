import React from 'react';
import { Head } from '@inertiajs/react';

interface FileData {
    name: string;
    url: string;
    size: string;
}

interface Props {
    files: FileData[];
}

export default function Downloads({ files }: Props) {
    return (
        <div className="min-h-screen p-6 bg-gray-100 sm:p-12">
            <Head title="File Downloads" />

            <div className="max-w-3xl mx-auto overflow-hidden bg-white rounded-lg shadow-lg">
                <div className="px-6 py-4 bg-indigo-700">
                    <h1 className="text-xl font-bold text-white">File Center</h1>
                    <p className="text-sm text-indigo-100">Download assets from your Raspberry Pi</p>
                </div>

                <div className="divide-y divide-gray-200">
                    {files.length > 0 ? (
                        files.map((file, index) => (
                            <div key={index} className="flex items-center justify-between p-6 transition-colors hover:bg-gray-50">
                                <div className="flex flex-col">
                                    <span className="max-w-xs font-semibold text-gray-900 truncate sm:max-w-md">
                                        {file.name}
                                    </span>
                                    <span className="text-xs tracking-wider text-gray-500 uppercase">
                                        {file.size}
                                    </span>
                                </div>

                                <a
                                    href={file.url}
                                    download
                                    className="inline-flex items-center px-4 py-2 ml-4 text-xs font-semibold tracking-widest text-white uppercase transition duration-150 ease-in-out bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-500 active:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                >
                                    Download
                                </a>
                            </div>
                        ))
                    ) : (
                        <div className="p-12 italic text-center text-gray-500">
                            No files found in the downloads folder.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
