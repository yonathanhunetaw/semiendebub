import {Head} from '@inertiajs/react';
import AdminLayout from "@/Components/Admin/AdminLayout";
import DeleteUserForm from './Partials/DeleteUserForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';

export default function Edit({mustVerifyEmail, status}) {
    return (
        <AdminLayout header={<h2 className="text-xl font-semibold">Profile</h2>}>
            <Head title="Profile"/>

            <div className="py-6">
                <div className="mx-auto max-w-4xl space-y-6">

                    {/* Update Profile Information */}
                    <div className="bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 p-6 shadow rounded-lg">
                        <UpdateProfileInformationForm
                            mustVerifyEmail={mustVerifyEmail}
                            status={status}
                        />
                    </div>

                    {/* Update Password */}
                    <div className="bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 p-6 shadow rounded-lg">
                        <UpdatePasswordForm/>
                    </div>

                    {/* Delete User */}
                    <div className="bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 p-6 shadow rounded-lg">
                        <DeleteUserForm/>
                    </div>

                </div>
            </div>
        </AdminLayout>
    );
}
