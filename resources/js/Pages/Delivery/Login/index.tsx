import * as React from 'react';
import { Head, useForm, Link as InertiaLink } from '@inertiajs/react';
import {
    Box,
    TextField,
    Button,
    Typography,
    Paper,
    Container,
    Checkbox,
    FormControlLabel,
    Alert
} from '@mui/material';

// 1. Define what the component expects
interface LoginProps {
    status?: string;
    canResetPassword?: boolean;
}

export default function Login({ status, canResetPassword }: LoginProps) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();

        // Use (window as any).route if TypeScript complains about the route helper
        // or just use the string path if ziggy-js isn't fully typed yet
        post('/login', {
            onFinish: () => reset('password'),
        });
    };

    return (
        <Container maxWidth="xs">
            <Head title="Log in" />

            <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center' }}>
                <Paper sx={{ p: 4, width: '100%' }} elevation={4}>
                    <Typography variant="h4" align="center" gutterBottom fontWeight="bold" color="primary">
                        Duka
                    </Typography>
                    <Typography variant="body2" align="center" sx={{ mb: 3 }} color="text.secondary">
                        Delivery Partner Portal
                    </Typography>

                    {status && (
                        <Alert severity="success" sx={{ mb: 2 }}>{status}</Alert>
                    )}

                    <form onSubmit={submit}>
                        <TextField
                            fullWidth
                            label="Email"
                            type="email"
                            margin="normal"
                            value={data.email}
                            error={!!errors.email}
                            helperText={errors.email}
                            onChange={(e) => setData('email', e.target.value)}
                            autoFocus
                        />

                        <TextField
                            fullWidth
                            label="Password"
                            type="password"
                            margin="normal"
                            value={data.password}
                            error={!!errors.password}
                            helperText={errors.password}
                            onChange={(e) => setData('password', e.target.value)}
                        />

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={data.remember}
                                    onChange={(e) => setData('remember', e.target.checked)}
                                />
                            }
                            label={<Typography variant="body2">Remember me</Typography>}
                        />

                        <Button
                            fullWidth
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={processing}
                            sx={{ mt: 3, py: 1.5, fontWeight: 'bold' }}
                        >
                            Log in
                        </Button>

                        <Box sx={{ mt: 2, textAlign: 'center' }}>
                            {canResetPassword && (
                                <InertiaLink
                                    href="/forgot-password"
                                    style={{ textDecoration: 'none', fontSize: '0.875rem', color: '#f57c00' }}
                                >
                                    Forgot your password?
                                </InertiaLink>
                            )}
                        </Box>
                    </form>
                </Paper>
            </Box>
        </Container>
    );
}
