import React from "react";
import { ComponentProps } from "@shared/editor/types";
import styled from "styled-components";
import { drawioDiagramStyle } from "@shared/styles/theme";

const DiagramImage = styled.img`
  ${drawioDiagramStyle}
`;

export default function DrawioComponent({ node, view, getPos }: ComponentProps) {
    const { imageUrl, xml } = node.attrs;

    const handleDoubleClick = () => {
        window.dispatchEvent(
            new CustomEvent("outline:drawio:edit", {
                detail: { pos: getPos(), xml },
            })
        );
    };

    return (
        <DiagramImage
            src={imageUrl}
            alt="Draw.io Diagram"
            onDoubleClick={handleDoubleClick}
        />
    );
} 