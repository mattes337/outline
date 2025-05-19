import React, { useState } from "react";
import { ComponentProps } from "@shared/editor/types";
import styled from "styled-components";
import { drawioDiagramStyle } from "@shared/styles/theme";
import { EditIcon, TrashIcon } from "outline-icons";

const Frame = styled.div`
  border: 2px solid #ccc;
  border-radius: 8px;
  background: #f8f8f8;
  position: relative;
  padding: 8px 24px 8px 16px;
  padding-right: 40px; /* Add space for icon group */
  margin: 16px 0;
  display: inline-block;
  min-width: 200px;
  /* Prevent ProseMirror blue outline when selected */
  &.ProseMirror-selectednode,
  &.ProseMirror-selectednode:focus {
    outline: none !important;
    box-shadow: none !important;
  }
`;

const DiagramImage = styled.img`
  ${drawioDiagramStyle}
  display: block;
  max-width: 100%;
  margin: 12px auto 0 auto; /* 24px matches the TopBar height */
  cursor: pointer;
`;

const TopBar = styled.div`
  position: relative;
  width: 100%;
  height: 24px;
  display: flex;
  align-items: center;
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
  position: absolute;
  top: 0;
  right: -8px;
  height: 24px;
  display: flex;
  gap: 8px;
  align-items: center;
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
    const { imageUrl, xml, filename, xmlFilename } = node.attrs;
    // Fallback filename if not present
    const displayFilename = filename || "diagram.png";
    const [expanded, setExpanded] = useState(false);

    React.useEffect(() => {
        console.log("[Drawio] Rendered DrawioComponent", { imageUrl, filename, pos: getPos && getPos() });
    }, [imageUrl, filename, getPos]);

    const handleDoubleClick = () => {
        console.log("[Drawio] Double-clicked diagram, opening editor", { pos: getPos(), imageUrl });
        window.dispatchEvent(
            new CustomEvent("outline:drawio:edit", {
                detail: { pos: getPos(), xml, xmlFilename },
            })
        );
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        console.log("[Drawio] Edit icon clicked, opening editor", { pos: getPos(), imageUrl });
        window.dispatchEvent(
            new CustomEvent("outline:drawio:edit", {
                detail: { pos: getPos(), xml, xmlFilename },
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

    const handleImageClick = () => {
        console.log("[Drawio] Diagram image clicked, expanding");
        setExpanded(true);
    };

    const handleModalClose = () => {
        console.log("[Drawio] Expanded modal closed");
        setExpanded(false);
    };

    return (
        <Frame className="drawio-frame">
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
                onClick={handleImageClick}
                draggable={false}
            />
            {expanded && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2000,
                }} onClick={handleModalClose}>
                    <img src={imageUrl} alt="Expanded Draw.io Diagram" style={{
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
                        borderRadius: 8,
                        background: '#fff',
                        padding: 12
                    }} />
                </div>
            )}
        </Frame>
    );
} 