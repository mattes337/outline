import React from "react";
import { Icon } from "@outline/components/Icon";

export default function DiagramIcon(props: React.ComponentProps<typeof Icon>) {
    return (
        <Icon {...props}>
            <path
                d="M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h10v2H7v-2z"
                fill="currentColor"
            />
        </Icon>
    );
} 