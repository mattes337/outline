import { Server } from "@hocuspocus/server";
import env from "@server/env";
import Logger from "@server/logging/Logger";

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
    // The collaboration service is running in the same process in development
    // and testing environments, so we can just emit an event directly
    if (env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test") {
      Logger.debug(
        "multiplayer",
        `Notifying collaboration service about update to ${documentId}`
      );
      
      // This is a placeholder for actual implementation
      // In a real implementation, we would need to get access to the Hocuspocus server
      // instance and emit an event to it
      return;
    }

    // In production, we need to make an API call to the collaboration service
    // This would typically be done via a REST API or a message queue
    Logger.debug(
      "multiplayer",
      `Notifying collaboration service about update to ${documentId}`
    );

    // This is where you would implement the actual notification
    // For example, using a REST API call to the collaboration service
    // or publishing a message to a queue that the collaboration service consumes
    
    // Example implementation (commented out as it's not actually implemented):
    // await fetch(`${env.COLLABORATION_URL}/api/documents/${documentId}/notify`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${env.COLLABORATION_SECRET}`,
    //   },
    //   body: JSON.stringify({ force }),
    // });
  } catch (error) {
    Logger.error(
      "multiplayer",
      `Error notifying collaboration service: ${error.message}`,
      error
    );
  }
}
