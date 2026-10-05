import InputError from '@/Components/UI/InputError';
import InputLabel from '@/Components/UI/InputLabel';
import PrimaryButton from '@/Components/UI/PrimaryButton';
import TextInput from '@/Components/UI/TextInput';
import { Transition } from '@headlessui/react';
import { Link, useForm, usePage } from '@inertiajs/react';

/**
 * The fields here are the ones ProfileUpdateRequest validates: first_name,
 * last_name, phone_number and email.
 *
 * It used to post a single `name` field, which this application's users table
 * does not have — so `first_name` (required) was never supplied and every save
 * failed validation, while the Name box itself rendered empty because
 * `auth.user.name` is undefined too.
 */
export default function UpdateProfileInformation({
    mustVerifyEmail,
    status,
    className = '',
}) {
    const user = usePage().props.auth.user;

    const { data, setData, patch, errors, processing, recentlySuccessful } =
        useForm({
            first_name: user.first_name ?? '',
            last_name: user.last_name ?? '',
            phone_number: user.phone_number ?? '',
            email: user.email ?? '',
        });

    const submit = (e) => {
        e.preventDefault();

        patch(route('profile.update'));
    };

    return (
        <section className={className}>
            <header>
                <h2 className="text-lg font-medium text-on-surface">
                    Profile Information
                </h2>

                <p className="mt-1 text-sm text-on-surface-variant">
                    Update your account's profile information and email address.
                </p>
            </header>

            <form onSubmit={submit} className="mt-6 space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                        <InputLabel
                            htmlFor="first_name"
                            value="First name"
                        />

                        <TextInput
                            id="first_name"
                            name="first_name"
                            className="block w-full mt-1"
                            value={data.first_name}
                            onChange={(e) => setData('first_name', e.target.value)}
                            required
                            isFocused
                            autoComplete="given-name"
                        />

                        <InputError className="mt-2" message={errors.first_name} />
                    </div>

                    <div>
                        <InputLabel
                            htmlFor="last_name"
                            value="Last name"
                        />

                        <TextInput
                            id="last_name"
                            name="last_name"
                            className="block w-full mt-1"
                            value={data.last_name}
                            onChange={(e) => setData('last_name', e.target.value)}
                            autoComplete="family-name"
                        />

                        <InputError className="mt-2" message={errors.last_name} />
                    </div>
                </div>

                <div>
                    <InputLabel
                        htmlFor="email"
                        value="Email"
                    />

                    <TextInput
                        id="email"
                        name="email"
                        type="email"
                        className="block w-full mt-1"
                        value={data.email}
                        onChange={(e) => setData('email', e.target.value)}
                        required
                        autoComplete="username"
                    />

                    <InputError className="mt-2" message={errors.email} />
                </div>

                <div>
                    <InputLabel
                        htmlFor="phone_number"
                        value="Phone number"
                    />

                    <TextInput
                        id="phone_number"
                        name="phone_number"
                        type="tel"
                        className="block w-full mt-1"
                        value={data.phone_number}
                        onChange={(e) => setData('phone_number', e.target.value)}
                        autoComplete="tel"
                    />

                    <InputError className="mt-2" message={errors.phone_number} />
                </div>

                {mustVerifyEmail && user.email_verified_at === null && (
                    <div>
                        <p className="mt-2 text-sm text-on-surface-variant">
                            Your email address is unverified.
                            <Link
                                href={route('verification.send')}
                                method="post"
                                as="button"
                                className="ms-1 text-sm text-on-surface-variant underline rounded-md hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                            >
                                Click here to re-send the verification email.
                            </Link>
                        </p>

                        {status === 'verification-link-sent' && (
                            <div className="mt-2 text-sm font-medium text-success">
                                A new verification link has been sent to your
                                email address.
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <PrimaryButton disabled={processing}>Save</PrimaryButton>

                    <Transition
                        show={recentlySuccessful}
                        enter="transition ease-in-out"
                        enterFrom="opacity-0"
                        leave="transition ease-in-out"
                        leaveTo="opacity-0"
                    >
                        <p className="text-sm text-success">Saved.</p>
                    </Transition>
                </div>
            </form>
        </section>
    );
}
