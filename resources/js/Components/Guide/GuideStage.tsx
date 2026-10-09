import React from "react";
import { Box, Stack } from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import LocalMove from "@/Components/Visual/LocalMove";
import OrderJourney from "@/Components/Visual/OrderJourney";
import RoleAvatar from "@/Components/Visual/RoleAvatar";
import Scene from "@/Components/Visual/scenes";
import TransferJourney from "@/Components/Visual/TransferJourney";
import VariantFan from "@/Components/Visual/VariantFan";
import { bob, motionSafe, pop } from "@/Components/Visual/motion";
import type { Stage } from "./chapters";

const EXAMPLE_VARIANTS = [
    { key: 1, color: "Red", size: "M", pack: "Piece", sku: "TSH-RED-M" },
    { key: 2, color: "Navy", size: "L", pack: "Piece", sku: "TSH-NAV-L" },
    { key: 3, color: "White", size: "S", pack: "Pack of 3", sku: "TSH-WHT-S3" },
    { key: 4, color: "Black", size: "XL", pack: "Carton (24)", sku: "TSH-BLK-XLC" },
];

/** What a guide step shows while it is explained. */
export default function GuideStage({ stage }: { stage: Stage }) {
    switch (stage.type) {
        case "journey":
            return <OrderJourney current={stage.current} compact />;
        case "transfer":
            return (
                <TransferJourney from={stage.from} to={stage.to} status={stage.status} needsCourier={stage.courier ?? true}
                    quantity={stage.quantity} unit={stage.unit} />
            );
        case "local":
            return <LocalMove status={stage.status} quantity={24} store="Main Store" />;
        case "variants":
            return <VariantFan item="Cotton T-shirt (example)" variants={EXAMPLE_VARIANTS} />;
        case "cast":
            return (
                <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ py: 2, ...motionSafe }}>
                    {stage.roles.map((role, index) => (
                        <Box key={role} sx={{ animation: `${pop} .4s ease-out both`, animationDelay: `${index * 90}ms` }}>
                            <RoleAvatar role={role} size={64} working={index === 0} />
                        </Box>
                    ))}
                </Stack>
            );
        case "scenes":
        default:
            return (
                <Stack direction="row" alignItems="center" justifyContent="center" spacing={{ xs: 1, sm: 2 }} sx={{ py: 2, flexWrap: "wrap", rowGap: 2, ...motionSafe }}>
                    {stage.scenes.map((scene, index) => (
                        <React.Fragment key={`${scene}-${index}`}>
                            {index > 0 && <ArrowForwardRounded sx={{ color: "text.disabled" }} />}
                            <Box sx={{ animation: `${pop} .45s ease-out both, ${bob} 2.4s ease-in-out ${0.5 + index * 0.3}s infinite`, animationDelay: `${index * 120}ms, ${0.5 + index * 0.3}s` }}>
                                <Scene kind={scene} size={84} />
                            </Box>
                        </React.Fragment>
                    ))}
                </Stack>
            );
    }
}
