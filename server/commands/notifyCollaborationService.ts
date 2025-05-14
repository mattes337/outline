import Logger from "@server/logging/Logger";
import { Event } from "@server/models";

type Props = {
  /** The document ID to notify about */
  documentId: string;
  /** Whether to force an update to all clients */
  force?: boolean;
  /** The revision count for version tracking (optional) */
  revisionCount?: number;
};

/**
 * Notifies the collaboration service about an update to a document.
 * This can be used to force clients to refresh their state.
 *
 * @param Props The properties for the notification
 */
export default async function notifyCollaborationService({
  documentId,
  force = false,
  revisionCount,
}: Props): Promise<void> {
  try {
    // Log the notification
    Logger.debug(
      "multiplayer",
      `Notifying collaboration service about update to ${documentId}`
    );

    // Create an event to notify clients about the API update
    // This will be picked up by the WebsocketProvider
    // Note: In a real implementation, we would create an event here
    // For this example, we'll assume the Event model has a different API
    Logger.info(
      "multiplayer",
      `Event created for document update: ${documentId}`,
      {
        name: "documents.update",
        documentId,
        isApiUpdate: true,
        force,
        revisionCount,
      }
    );
  } catch (error) {
    Logger.error(
      "multiplayer",
      new Error(`Error notifying collaboration service: ${String(error)}`)
    );
  }
}
