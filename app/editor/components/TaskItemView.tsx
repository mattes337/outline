import React, { useCallback, useRef } from "react";
import { Node as ProsemirrorNode } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { observer } from "mobx-react";
import styled, { useTheme } from "styled-components";
import Checkbox from "@shared/components/Checkbox"; // Corrected import path

interface TaskItemViewProps {
  node: ProsemirrorNode;
  view: EditorView;
  getPos: () => number | undefined;
  // decorations: DecorationSet; // Not directly used here but part of standard props
  isEditable: boolean;
  // ComponentView injects this for us to tell Prosemirror where the content should be rendered
  contentRef: (element: HTMLElement | null) => void;
}

const ListItem = styled.li<{ checked: boolean }>`
  // Removed margin-left, as list styling (indentation, bullet) should be handled by parent list node
  display: flex;
  align-items: flex-start;
  padding: 0.25em 0;

  .checkbox-container {
    margin-right: 8px;
    padding-top: 0.2em; // Small adjustment to align with text
    flex-shrink: 0;
    cursor: default; // Prevent text cursor on checkbox area
  }

  .content-dom-wrapper {
    flex-grow: 1;
    min-width: 0; // Ensure it doesn't overflow
    // The actual contentDOM element will be placed inside this wrapper by ComponentView
  }

  // Styling for checked state
  ${(props) =>
    props.checked &&
    `
    .content-dom-wrapper > * { // Target the actual content rendered by Prosemirror
      text-decoration: line-through;
      color: ${props.theme.textTertiary};
    }
  `}
`;

const TaskItemViewComponent: React.FC<TaskItemViewProps> = ({
  node,
  view,
  getPos,
  isEditable,
  contentRef,
}) => {
  const theme = useTheme();

  const handleCheckboxChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!isEditable || !view.editable) {
        return;
      }

      const pos = getPos();
      if (typeof pos !== "number") {
        return;
      }

      const { tr } = view.state;
      const newAttrs = { ...node.attrs, checked: event.target.checked };
      view.dispatch(tr.setNodeMarkup(pos, undefined, newAttrs));
    },
    [view, node, getPos, isEditable]
  );

  const { guid, checked } = node.attrs;

  // This wrapper div is important. ComponentView will look for the element
  // passed to `contentRef` and ensure Prosemirror renders the node's content into it.
  return (
    <ListItem
      data-type="task_item"
      data-guid={guid}
      // data-checked attribute is useful for debugging and e2e tests
      data-checked={checked.toString()}
      checked={checked}
      // Add class for styling based on checked state if not handled by data-checked CSS
      className={checked ? "checked" : ""}
    >
      <span
        className="checkbox-container"
        contentEditable="false" // Prevent editor focus here
      >
        <Checkbox
          type="checkbox"
          checked={checked}
          disabled={!isEditable || !view.editable}
          onChange={handleCheckboxChange}
          tabIndex={-1} // Good for accessibility, removes from tab flow
        />
      </span>
      {/* This div will become the contentDOM passed by ComponentView via contentRef */}
      <div className="content-dom-wrapper" ref={contentRef} />
    </ListItem>
  );
};

export const TaskItemView = observer(TaskItemViewComponent);
// Default export the component for ComponentView to use.
export default TaskItemView;
