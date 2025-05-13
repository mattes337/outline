import * as Y from "yjs";
import { Event, Document } from "@server/models";
import { buildDocument, buildUser } from "@server/test/factories";
import { withAPIContext } from "@server/test/support";
import documentUpdater from "./documentUpdater";

describe("documentUpdater with API updates", () => {
  it("should update collaborative state when text is changed", async () => {
    const user = await buildUser();
    let document = await buildDocument({
      teamId: user.teamId,
      text: "Original content",
    });

    // Create initial state
    const initialYdoc = new Y.Doc();
    const initialType = initialYdoc.get("default", Y.XmlFragment);
    initialType.insert(0, "Original content");
    document.state = Buffer.from(Y.encodeStateAsUpdate(initialYdoc));
    await document.save();

    // Update document via API
    document = await withAPIContext(user, (ctx) =>
      documentUpdater(ctx, {
        text: "Changed content",
        document,
        user,
      })
    );

    // Verify text was updated
    expect(document.text).toEqual("Changed content");

    // Verify state was updated
    const updatedYdoc = new Y.Doc();
    Y.applyUpdate(updatedYdoc, document.state);
    const updatedType = updatedYdoc.get("default", Y.XmlFragment);
    expect(updatedType.toString()).toEqual("Changed content");

    // Verify event was created with isApiUpdate flag
    const event = await Event.findLatest({
      teamId: user.teamId,
    });
    expect(event!.name).toEqual("documents.update");
    expect(event!.documentId).toEqual(document.id);
    expect(event!.data.isApiUpdate).toEqual(true);
  });

  it("should not update state if document has no state", async () => {
    const user = await buildUser();
    let document = await buildDocument({
      teamId: user.teamId,
      text: "Original content",
    });

    // Ensure document has no state
    document.state = null;
    await document.save();

    // Update document via API
    document = await withAPIContext(user, (ctx) =>
      documentUpdater(ctx, {
        text: "Changed content",
        document,
        user,
      })
    );

    // Verify text was updated
    expect(document.text).toEqual("Changed content");

    // Verify state is still null
    expect(document.state).toBeNull();

    // Verify event was created with isApiUpdate flag
    const event = await Event.findLatest({
      teamId: user.teamId,
    });
    expect(event!.name).toEqual("documents.update");
    expect(event!.documentId).toEqual(document.id);
    expect(event!.data.isApiUpdate).toEqual(true);
  });
});
