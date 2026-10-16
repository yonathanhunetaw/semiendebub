import React from 'react';
import AppLayout from '@/Layouts/AppLayout';
import StoreForm, { type StoreFields } from './StoreForm';

interface Props {
    store: StoreFields & { id: number };
}

export default function EditStore({ store }: Props) {
    return <StoreForm store={store} />;
}

EditStore.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
