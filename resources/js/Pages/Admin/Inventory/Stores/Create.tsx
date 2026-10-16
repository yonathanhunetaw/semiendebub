import React from 'react';
import AppLayout from '@/Layouts/AppLayout';
import StoreForm from './StoreForm';

export default function CreateStore() {
    return <StoreForm />;
}

CreateStore.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
