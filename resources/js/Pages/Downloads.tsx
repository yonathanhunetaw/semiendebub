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
        <div className="min-h-screen p-6 bg-background sm:p-12">
            <Head title="File Downloads" />

            <div className="max-w-3xl mx-auto overflow-hidden bg-surface-container-lowest rounded-lg shadow-lg">
                <div className="px-6 py-4 bg-primary">
                    <h1 className="text-xl font-bold text-on-primary">File Center</h1>
                    <p className="text-sm text-on-primary/80">Download assets from your Raspberry Pi</p>
                </div>

                <div className="divide-y divide-outline-variant">
                    {files.length > 0 ? (
                        files.map((file, index) => (
                            <div key={index} className="flex items-center justify-between p-6 transition-colors hover:bg-surface-container-low">
                                <div className="flex flex-col">
                                    <span className="max-w-xs font-semibold text-on-surface truncate sm:max-w-md">
                                        {file.name}
                                    </span>
                                    <span className="text-xs tracking-wider text-on-surface-variant uppercase">
                                        {file.size}
                                    </span>
                                </div>

                                <a
                                    href={file.url}
                                    download
                                    className="inline-flex items-center px-4 py-2 ml-4 text-xs font-semibold tracking-widest text-on-primary uppercase transition duration-150 ease-in-out bg-primary border border-transparent rounded-md hover:bg-primary/90 active:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                                >
                                    Download
                                </a>
                            </div>
                        ))
                    ) : (
                        <div className="p-12 italic text-center text-on-surface-variant">
                            No files found in the downloads folder.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
