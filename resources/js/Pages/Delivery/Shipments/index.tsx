import * as React from 'react';
import DeliveryLayout from '@/Layouts/DeliveryLayout';
import { Container, Typography, List, ListItem, ListItemText, Paper, Chip } from '@mui/material';

export default function ShipmentsIndex() {
    // Mock data for now
    const shipments = [
        { id: '102', date: '2026-04-20', status: 'Delivered', destination: 'Bole' },
        { id: '101', date: '2026-04-19', status: 'Cancelled', destination: 'Kazanchis' },
    ];

    return (
        <Container sx={{ mt: 3 }}>
            <Typography variant="h5" fontWeight="bold" gutterBottom>
                Shipment History
            </Typography>

            <Paper>
                <List>
                    {shipments.map((s) => (
                        <ListItem key={s.id} divider>
                            <ListItemText
                                primary={`Order #${s.id}`}
                                secondary={`${s.date} • ${s.destination}`}
                            />
                            <Chip
                                label={s.status}
                                color={s.status === 'Delivered' ? 'success' : 'error'}
                                size="small"
                            />
                        </ListItem>
                    ))}
                </List>
            </Paper>
        </Container>
    );
}

ShipmentsIndex.layout = (page: React.ReactNode) => <DeliveryLayout children={page} />;
