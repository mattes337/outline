import Logger from "@server/logging/Logger";
import { Event } from "@server/models";

type Props = {
  /** The document ID to notify about */
  documentId: string;
  /** Whether to force an update to all clients */
  force?: boolean;
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
}: Props): Promise<void> {
  try {
    // Log the notification
    Logger.debug(
      "multiplayer",
      `Notifying collaboration service about update to ${documentId}`
    );

    // Create an event to notify clients about the API update
    // This will be picked up by the WebsocketProvider
    await Event.create({
      name: "documents.update",
      documentId,
      data: {
        isApiUpdate: true,
        force,
      },
    });
  } catch (error) {
    Logger.error(
      "multiplayer",
      `Error notifying collaboration service`,
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
