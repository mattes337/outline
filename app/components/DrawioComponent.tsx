import React from "react";
import { ComponentProps } from "@shared/editor/types";
import styled from "styled-components";
import { drawioDiagramStyle } from "@shared/styles/theme";
import { EditIcon, TrashIcon } from "outline-icons";

const Frame = styled.div`
  border: 2px solid #ccc;
  border-radius: 8px;
  background: #f8f8f8;
  position: relative;
  padding: 24px 16px 16px 16px;
  margin: 16px 0;
  display: inline-block;
  min-width: 200px;
`;

const DiagramImage = styled.img`
  ${drawioDiagramStyle}
  display: block;
  max-width: 100%;
  margin: 24px auto 0 auto; /* 24px matches the TopBar height */
  cursor: pointer;
`;

const TopBar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  padding: 0 8px;
  cursor: move;
`;

const Filename = styled.span`
  color: #888;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const IconGroup = styled.div`
  display: flex;
  gap: 8px;
`;

const IconButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: #888;
  display: flex;
  align-items: center;
  &:hover {
    color: #333;
  }

  /* Add right margin to the last icon (TrashIcon) */
  &:last-child {
    margin-right: 4px;
  }
`;

export default function DrawioComponent({ node, view, getPos }: ComponentProps) {
    const { imageUrl, xml, filename } = node.attrs;
    // Fallback filename if not present
    const displayFilename = filename || "diagram.png";

    const handleDoubleClick = () => {
        console.log("[Drawio] Double-clicked diagram, opening editor", { pos: getPos(), imageUrl });
        window.dispatchEvent(
            new CustomEvent("outline:drawio:edit", {
                detail: { pos: getPos(), xml },
            })
        );
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        console.log("[Drawio] Edit icon clicked, opening editor", { pos: getPos(), imageUrl });
        window.dispatchEvent(
            new CustomEvent("outline:drawio:edit", {
                detail: { pos: getPos(), xml },
            })
        );
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        console.log("[Drawio] Delete icon clicked, deleting diagram", { pos: getPos(), imageUrl });
        if (view && getPos) {
            const { state, dispatch } = view;
            dispatch(state.tr.delete(getPos(), getPos() + 1));
        }
    };

    return (
        <Frame>
            <TopBar>
                <Filename>{displayFilename}</Filename>
                <IconGroup>
                    <IconButton title="Edit diagram" onClick={handleEdit}>
                        <EditIcon size={18} />
                    </IconButton>
                    <IconButton title="Delete diagram" onClick={handleDelete}>
                        <TrashIcon size={18} />
                    </IconButton>
                </IconGroup>
            </TopBar>
            <DiagramImage
                src={imageUrl}
                alt="Draw.io Diagram"
                onDoubleClick={handleDoubleClick}
                draggable={false}
            />
        </Frame>
    );
} 