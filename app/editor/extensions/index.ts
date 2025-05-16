import Extension from "@shared/editor/lib/Extension";
import Mark from "@shared/editor/marks/Mark";
import Node from "@shared/editor/nodes/Node";
import BlockMenuExtension from "~/editor/extensions/BlockMenu";
import ClipboardTextSerializer from "~/editor/extensions/ClipboardTextSerializer";
import EmojiMenuExtension from "~/editor/extensions/EmojiMenu";
import FindAndReplaceExtension from "~/editor/extensions/FindAndReplace";
import HoverPreviewsExtension from "~/editor/extensions/HoverPreviews";
import Keys from "~/editor/extensions/Keys";
import MentionMenuExtension from "~/editor/extensions/MentionMenu";
import PasteHandler from "~/editor/extensions/PasteHandler";
import PreventTab from "~/editor/extensions/PreventTab";
import SmartText from "~/editor/extensions/SmartText";
import createDrawioPlugin from "../plugins/drawio";

type Nodes = (typeof Node | typeof Mark | typeof Extension)[];

// Create a proper Extension class for Draw.io
class DrawioExtension extends Extension {
  get name() {
    return "drawio";
  }

  get plugins() {
    return [createDrawioPlugin()];
  }
}

export const withUIExtensions = (nodes: Nodes) => [
  ...nodes,
  SmartText,
  PasteHandler,
  ClipboardTextSerializer,
  BlockMenuExtension,
  EmojiMenuExtension,
  MentionMenuExtension,
  FindAndReplaceExtension,
  HoverPreviewsExtension,
  // Order these default key handlers last
  PreventTab,
  Keys,
  // Register Drawio plugin as a proper extension
  DrawioExtension,
];
