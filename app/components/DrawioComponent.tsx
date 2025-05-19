import React, { useState, useRef, useEffect } from "react";
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
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const zoomContainerRef = useRef<HTMLDivElement>(null);
    const imgElementRef = useRef<HTMLImageElement>(null);

    React.useEffect(() => {
        console.log("[Drawio] Rendered DrawioComponent", { imageUrl, filename, pos: getPos && getPos() });
    }, [imageUrl, filename, getPos]);

    // Imperative wheel event for passive: false
    useEffect(() => {
        if (!expanded) return;
        const container = zoomContainerRef.current;
        if (!container) return;
        const handleWheelEvent = (e: WheelEvent) => {
            e.preventDefault();
            if (!imgElementRef.current) return;
            const imgRect = imgElementRef.current.getBoundingClientRect();
            const mouseX = e.clientX - imgRect.left;
            const mouseY = e.clientY - imgRect.top;
            const prevZoom = zoom;
            let newZoom = zoom;
            if (e.deltaY < 0) {
                newZoom = Math.min(zoom + 0.2, 5);
            } else {
                newZoom = Math.max(zoom - 0.2, 0.2);
            }
            if (newZoom === prevZoom) return;
            const imgX = (mouseX - pan.x) / prevZoom;
            const imgY = (mouseY - pan.y) / prevZoom;
            const newPan = {
                x: mouseX - imgX * newZoom,
                y: mouseY - imgY * newZoom,
            };
            setZoom(newZoom);
            setPan(newPan);
            console.log(`[Drawio] Zoom ${e.deltaY < 0 ? 'in' : 'out'}: ${newZoom}, pan adjusted to`, newPan, 'mouse:', { mouseX, mouseY }, 'img:', { imgX, imgY }, 'prevZoom:', prevZoom, 'newZoom:', newZoom);
        };
        container.addEventListener('wheel', handleWheelEvent, { passive: false });
        return () => container.removeEventListener('wheel', handleWheelEvent);
    }, [expanded, zoom, pan]);

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

    // Zoom controls
    const handleZoomIn = () => {
        setZoom(z => {
            const newZoom = Math.min(z + 0.2, 5);
            console.log(`[Drawio] Zoom in: ${newZoom}`);
            return newZoom;
        });
    };
    const handleZoomOut = () => {
        setZoom(z => {
            const newZoom = Math.max(z - 0.2, 0.2);
            console.log(`[Drawio] Zoom out: ${newZoom}`);
            return newZoom;
        });
    };
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const prevZoom = zoom;
        let newZoom = zoom;
        if (e.deltaY < 0) {
            newZoom = Math.min(zoom + 0.2, 5);
        } else {
            newZoom = Math.max(zoom - 0.2, 0.2);
        }
        if (newZoom === prevZoom) return;
        const scale = newZoom / prevZoom;
        // Correct pan adjustment to fix mouse position
        const offsetX = mouseX - pan.x;
        const offsetY = mouseY - pan.y;
        const newPan = {
            x: mouseX - offsetX * scale,
            y: mouseY - offsetY * scale,
        };
        setZoom(newZoom);
        setPan(newPan);
        console.log(`[Drawio] Zoom ${e.deltaY < 0 ? 'in' : 'out'}: ${newZoom}, pan adjusted to`, newPan, 'mouse:', { mouseX, mouseY }, 'offset:', { offsetX, offsetY }, 'scale:', scale);
    };
    // Pan controls
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setPanStart({ ...pan });
        console.log('[Drawio] Pan start', { x: e.clientX, y: e.clientY });
    };
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragging) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setPan({ x: panStart.x + dx, y: panStart.y + dy });
        console.log('[Drawio] Panning', { dx, dy });
    };
    const handleMouseUp = () => {
        if (dragging) {
            setDragging(false);
            console.log('[Drawio] Pan end');
        }
    };
    const handleReset = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        console.log('[Drawio] Reset zoom and pan');
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
                <div
                    style={{
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
                        overflow: 'auto',
                    }}
                    onClick={handleModalClose}
                >
                    <div
                        style={{
                            position: 'relative',
                            background: '#fff',
                            borderRadius: 8,
                            boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
                            padding: 12,
                            minWidth: 320,
                            minHeight: 120,
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <TopBar>
                            <Filename>{displayFilename}</Filename>
                        </TopBar>
                        <div
                            ref={zoomContainerRef}
                            style={{
                                flex: 1,
                                overflow: 'auto',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                                height: '100%',
                                cursor: dragging ? 'grabbing' : 'grab',
                                background: '#fff',
                                position: 'relative',
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <img
                                src={imageUrl}
                                alt="Expanded Draw.io Diagram"
                                style={{
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                    transition: dragging ? 'none' : 'transform 0.2s',
                                    maxWidth: 'none',
                                    maxHeight: 'none',
                                    userSelect: 'none',
                                    pointerEvents: 'all',
                                }}
                                ref={imgElementRef}
                                draggable={false}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
                            <button onClick={handleZoomOut} style={{ fontSize: 18 }}>-</button>
                            <span style={{ minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                            <button onClick={handleZoomIn} style={{ fontSize: 18 }}>+</button>
                            <button onClick={handleReset} style={{ fontSize: 14, marginLeft: 16 }}>Reset</button>
                        </div>
                    </div>
                </div>
            )}
        </Frame>
    );
} 