# [Draw.io](http://Draw.io) Integration for Outline

Version 1.0.0

## Overview

This integration adds [Draw.io](http://Draw.io) diagram support to Outline, allowing users to:

* Create diagrams via `/drawio` slash command
* Edit diagrams by double-clicking
* Store diagrams as attachments with XML for editing
* Seamlessly integrate with Outline's existing image handling

## Table of Contents


1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [File Structure](#file-structure)
4. [Implementation](#implementation)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

* Outline development environment
* Node.js 16+
* Yarn
* Access to modify Outline's editor components

## Installation


1. Add dependencies:

```bash
cd packages/web
yarn add react-drawio
```


2. Copy the provided files to their respective locations in your Outline installation.

## File Structure

```
packages/
├── shared/
│   ├── editor/
│   │   ├── extensions/
│   │   │   └── Drawio.ts
│   │   └── schema.ts
│   └── commands/
│       ├── InsertDrawioCommand.ts
│       └── index.ts
└── web/
    ├── components/
    │   ├── DrawioDialog.tsx
    │   ├── DrawioComponent.tsx
    │   └── Icon/
    │       └── DiagramIcon.tsx
    └── editor/
        └── plugins/
            └── drawio.ts
```

## Implementation

### 1. Command Definition

```typescript
// packages/shared/commands/InsertDrawioCommand.ts
import { Command } from "./types";

const InsertDrawioCommand: Command = {
  name: "drawio",
  title: "Insert Draw.io Diagram",
  keywords: "diagram,drawio,draw,flowchart",
  icon: "DiagramIcon",
  visible: true,
  shortcut: "",
  execute: (_state, _dispatch, _view) => {
    window.dispatchEvent(new CustomEvent("outline:drawio:new"));
  },
};

export default InsertDrawioCommand;
```

### 2. Node Definition

```typescript
// packages/shared/editor/extensions/Drawio.ts
import { NodeSpec } from "prosemirror-model";

export const drawio: NodeSpec = {
  attrs: {
    xml: { default: "" },
    imageUrl: { default: "" },
  },
  group: "block",
  draggable: false,
  atom: true,
  selectable: true,
  parseDOM: [
    {
      tag: "drawio-diagram",
      getAttrs: (dom: HTMLElement) => ({
        xml: dom.getAttribute("xml") || "",
        imageUrl: dom.getAttribute("imageUrl") || "",
      }),
    },
  ],
  toDOM: (node) => [
    "drawio-diagram",
    { 
      xml: node.attrs.xml, 
      imageUrl: node.attrs.imageUrl,
      class: "drawio-diagram",
    },
  ],
};
```

### 3. Dialog Component

```typescript
// packages/web/components/DrawioDialog.tsx
import React, { useRef, useCallback } from "react";
import Modal from "@components/Modal";
import Drawio from "react-drawio";
import { uploadImage } from "@shared/utils/uploadImage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialXml?: string;
  onSubmit: (res: { xml: string; imageUrl: string }) => void;
}

export default function DrawioDialog({
  isOpen,
  onClose,
  onSubmit,
  initialXml,
}: Props) {
  const ref = useRef<any>();

  const handleSave = useCallback(async () => {
    try {
      const xml = await ref.current?.getXml();
      const png = await ref.current?.getPng();

      // Convert PNG data URL to File
      const file = dataURLtoFile(png, "diagram.png");
      
      // Upload using Outline's image upload
      const imageUrl = await uploadImage(file);

      onSubmit({ 
        xml: btoa(xml),  // base64 encode XML
        imageUrl 
      });
      onClose();
    } catch (error) {
      console.error("Failed to save diagram:", error);
    }
  }, [onClose, onSubmit]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      title="Draw.io Diagram"
      width="full"
    >
      <div style={{ height: "80vh", width: "100%" }}>
        <Drawio
          ref={ref}
          xml={initialXml ? atob(initialXml) : undefined}
          config={{
            theme: "dark",
            defaultFonts: ["Inter"],
          }}
        />
      </div>
      <Modal.Footer>
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleSave} type="primary">
          Save Diagram
        </button>
      </Modal.Footer>
    </Modal>
  );
}
```

### 4. Node Component

```typescript
// packages/web/components/DrawioComponent.tsx
import React from "react";
import { NodeProps } from "@outline/editor/types";
import styled from "styled-components";

const DiagramImage = styled.img`
  max-width: 100%;
  cursor: pointer;
  border: 1px solid \${(props) => props.theme.divider};
  border-radius: 4px;
  
  &:hover {
    border-color: \${(props) => props.theme.primary};
  }
`;

export default function DrawioComponent({ node, view, getPos }: NodeProps) {
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
```

### 5. Markdown Serialization

```typescript
// Add to your markdown serializer
serializer.nodes.drawio = (state, node) => {
  state.write(`![diagram](\${node.attrs.imageUrl})`);
  state.ensureNewLine();
  state.write("\`\`\`drawio");
  state.ensureNewLine();
  state.text(node.attrs.xml);
  state.ensureNewLine();
  state.write("\`\`\`");
  state.closeBlock(node);
};

// Add to your markdown parser
parser.tokens.fence = {
  mark: "drawio",
  getAttrs: (tok) => {
    if (tok.info === "drawio") {
      return { xml: tok.content.trim() };
    }
    return false;
  },
};
```

### 6. Styles

```typescript
// Add to your theme
export const theme = {
  // ... existing theme
  components: {
    // ... other components
    drawio: {
      diagram: css`
        max-width: 100%;
        border: 1px solid \${(props) => props.theme.divider};
        border-radius: 4px;
        
        &:hover {
          border-color: \${(props) => props.theme.primary};
        }
      `,
    },
  },
};
```

## Testing

### Manual Testing Checklist

- [ ] Slash command opens dialog
- [ ] Can create new diagram
- [ ] Diagram saves and displays correctly
- [ ] Double-click opens editor with existing diagram
- [ ] Updates preserve XML and image
- [ ] Markdown export/import works
- [ ] Mobile responsiveness
- [ ] Dark/light theme compatibility

### Unit Tests

```typescript
describe("DrawioComponent", () => {
  it("renders diagram image", () => {
    // Add your tests
  });

  it("opens editor on double click", () => {
    // Add your tests
  });
});
```

## Troubleshooting

Common issues and solutions:


1. **Image Upload Fails**
   * Check Outline's upload permissions
   * Verify file size limits
   * Check network requests
2. **Dialog Not Opening**
   * Verify event listeners are registered
   * Check console for errors
   * Verify command registration
3. **XML Not Preserved**
   * Check base64 encoding/decoding
   * Verify markdown serialization
   * Check node attributes

## Security Considerations


1. **Image Upload**
   * Use Outline's existing upload validation
   * Implement size limits
   * Sanitize file names
2. **XML Storage**
   * Validate XML before storing
   * Consider size limits
   * Use proper encoding/decoding

## Performance


1. **Image Optimization**
   * Use Outline's image optimization
   * Consider lazy loading for large diagrams
   * Cache rendered images
2. **Dialog Loading**
   * Load [Draw.io](http://Draw.io) editor on demand
   * Consider code splitting
   * Optimize initial load time

## Maintenance

Keep track of:


1. react-drawio updates
2. Outline editor changes
3. Security patches
4. Browser compatibility

## Version History

* 1.0.0: Initial implementation
* 1.0.1: Add image optimization
* 1.0.2: Fix markdown serialization

## License

This integration follows Outline's licensing terms.


