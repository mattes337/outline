import invariant from "invariant";
import find from "lodash/find";
import { action, observable } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { withTranslation, WithTranslation } from "react-i18next";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import debounce from "lodash/debounce";
import {
  FileOperationState,
  FileOperationType,
  ImportState,
} from "@shared/types";
import {
  WebsocketDocumentUpdateEvent,
  WebsocketDocumentProgressEvent,
} from "~/types";
import RootStore from "~/stores/RootStore";
import Collection from "~/models/Collection";
import Comment from "~/models/Comment";
import Document from "~/models/Document";
import FileOperation from "~/models/FileOperation";
import Group from "~/models/Group";
import GroupMembership from "~/models/GroupMembership";
import GroupUser from "~/models/GroupUser";
import Import from "~/models/Import";
import Membership from "~/models/Membership";
import Notification from "~/models/Notification";
import Pin from "~/models/Pin";
import Star from "~/models/Star";
import Subscription from "~/models/Subscription";
import Team from "~/models/Team";
import User from "~/models/User";
import UserMembership from "~/models/UserMembership";
import withStores from "~/components/withStores";
import {
  PartialExcept,
  WebsocketCollectionUpdateIndexEvent,
  WebsocketCommentReactionEvent,
  WebsocketEntitiesEvent,
  WebsocketEntityDeletedEvent,
} from "~/types";
import { AuthorizationError, NotFoundError } from "~/utils/errors";
import { getVisibilityListener, getPageVisible } from "~/utils/pageVisibility";

// Custom warning triangle icon
const AlertTriangleIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ color: "orange" }}
  >
    <path
      d="M12 9V13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 17.0195V17"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.2427 3.75736C11.0243 2.97579 12.2757 2.97579 13.0573 3.75736L20.2427 10.9427C21.0243 11.7243 21.0243 12.9757 20.2427 13.7573L13.0573 20.9427C12.2757 21.7242 11.0243 21.7242 10.2427 20.9427L3.05736 13.7573C2.27579 12.9757 2.27579 11.7243 3.05736 10.9427L10.2427 3.75736Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type SocketWithAuthentication = Socket & {
  authenticated?: boolean;
};

export const WebsocketContext =
  React.createContext<SocketWithAuthentication | null>(null);

type Props = WithTranslation & RootStore;

@observer
class WebsocketProvider extends React.Component<Props> {
  @observable
  socket: SocketWithAuthentication | null;

  // Add debounced handlers as class properties
  debouncedShowUpdateToast = debounce((message: string) => {
    toast.info(message, {
      duration: 3000,
    });
  }, 1000, { leading: true, trailing: false });

  debouncedRefreshDocument = debounce((document: any) => {
    console.log("[TRACE] Fetching updated document content", {
      documentId: document.id,
      force: true,
    });
    document.fetch({ force: true });
  }, 1000, { leading: true, trailing: false });

  componentDidMount() {
    this.createConnection();
    document.addEventListener(getVisibilityListener(), this.checkConnection);
  }

  componentWillUnmount() {
    if (this.socket) {
      this.socket.authenticated = false;
      this.socket.disconnect();
    }

    document.removeEventListener(getVisibilityListener(), this.checkConnection);

    // Cancel any pending debounced operations
    this.debouncedShowUpdateToast.cancel();
    this.debouncedRefreshDocument.cancel();
  }

  checkConnection = () => {
    if (this.socket?.disconnected && getPageVisible()) {
      // null-ifying this reference is important, do not remove. Without it
      // references to old sockets are potentially held in context
      this.socket.close();
      this.socket = null;
      this.createConnection();
    }
  };

  createConnection = () => {
    this.socket = io(window.location.origin, {
      path: "/realtime",
      transports: ["websocket"],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      withCredentials: true,
    });
    invariant(this.socket, "Socket should be defined");

    this.socket.authenticated = false;
    const {
      auth,
      documents,
      collections,
      groups,
      groupUsers,
      groupMemberships,
      pins,
      stars,
      memberships,
      users,
      userMemberships,
      policies,
      comments,
      subscriptions,
      fileOperations,
      notifications,
      imports,
    } = this.props;

    const currentUserId = auth?.user?.id;

    // on reconnection, reset the transports option, as the Websocket
    // connection may have failed (caused by proxy, firewall, browser, ...)
    this.socket.io.on("reconnect_attempt", () => {
      if (this.socket) {
        this.socket.io.opts.transports = auth?.team?.domain
          ? ["websocket"]
          : ["websocket", "polling"];
      }
    });

    this.socket.on("authenticated", () => {
      if (this.socket) {
        this.socket.authenticated = true;
      }
    });

    this.socket.on("unauthorized", (err: Error) => {
      if (this.socket) {
        this.socket.authenticated = false;
      }
      toast.error(err.message);
      throw err;
    });

    this.socket.on(
      "entities",
      action(async (event: WebsocketEntitiesEvent) => {
        if (event.documentIds) {
          for (const documentDescriptor of event.documentIds) {
            const documentId = documentDescriptor.id;
            let document = documents.get(documentId);
            const previousTitle = document?.title;

            // if we already have the latest version (it was us that performed
            // the change) then we don't need to update anything either.
            if (document?.updatedAt === documentDescriptor.updatedAt) {
              continue;
            }
            if (!document && !event.fetchIfMissing) {
              continue;
            }

            // otherwise, grab the latest version of the document
            try {
              document = await documents.fetch(documentId, {
                force: true,
              });
            } catch (err) {
              if (
                err instanceof AuthorizationError ||
                err instanceof NotFoundError
              ) {
                documents.remove(documentId);
                return;
              }
            }

            // if the title changed then we need to update the collection also
            if (document && previousTitle !== document.title) {
              if (!event.collectionIds) {
                event.collectionIds = [];
              }

              const existing = find(event.collectionIds, {
                id: document.collectionId,
              });

              if (!existing && document.collectionId) {
                event.collectionIds.push({
                  id: document.collectionId,
                });
              }
            }
          }
        }

        if (event.collectionIds) {
          for (const collectionDescriptor of event.collectionIds) {
            const collectionId = collectionDescriptor.id;
            const collection = collections.get(collectionId);

            // if we already have the latest version (it was us that performed
            // the change) then we don't need to update anything either.
            if (collection?.updatedAt === collectionDescriptor.updatedAt) {
              continue;
            }
            if (!collection?.documents && !event.fetchIfMissing) {
              continue;
            }

            try {
              await collection?.fetchDocuments({
                force: true,
              });
            } catch (err) {
              if (
                err instanceof AuthorizationError ||
                err instanceof NotFoundError
              ) {
                memberships.removeAll({ collectionId });
                collections.remove(collectionId);
                return;
              }
            }
          }
        }
      })
    );

    this.socket.on(
      "documents.update",
      action(async (event: WebsocketDocumentUpdateEvent) => {
        documents.add(event);

        if (event.collectionId) {
          const collection = collections.get(event.collectionId);
          collection?.updateDocument(event);
        }

        // Handle document updates (both API and user-originated)
        if (event.id) {
          const documentId = event.id;
          const document = documents.get(documentId);

          if (document) {
            // Reset the progress state when an update is received
            document.aiProgressInfo = null;

            // If this is not an API update, reset the lastApiUpdate flag
            if (!event.data?.isApiUpdate) {
              document.lastApiUpdate = null;
            }

            // Log detailed information about the update for debugging
            console.debug("[YJS] Received update event", {
              documentId,
              isApiUpdate: event.data?.isApiUpdate || false,
              revisionCount: event.data?.revisionCount,
              currentRevisionCount: document.revisionCount,
              force: event.data?.force || false,
            });

            // Version check for synchronization
            const serverRevisionCount = event.data?.revisionCount;
            if (serverRevisionCount && document.revisionCount < serverRevisionCount) {
              console.info("[YJS] Document is out of sync, needs refresh", {
                documentId,
                localRevision: document.revisionCount,
                serverRevision: serverRevisionCount,
              });

              // Update the client's revisionCount
              document.revisionCount = serverRevisionCount;
            }

            // Check if this document is currently active
            if (this.props.ui.activeDocumentId === documentId) {
              console.log("[TRACE] Received update for document", {
                documentId,
                title: document?.title,
                isApiUpdate: event.data?.isApiUpdate || false,
              });

              // Get the current document from the editor context to check if it's in edit mode
              const editor = document?.editor;
              const isEditing = editor && !editor.props.readOnly;

              if (isEditing) {
                console.log("[TRACE] Document is in edit mode, showing warning", {
                  documentId,
                  title: document?.title,
                  isEditing: true,
                });

                // In edit mode: show a toast notification with a warning
                toast.warning(
                  this.props.t(
                    event.data?.isApiUpdate
                      ? "This document has been updated by API"
                      : "This document has been updated"
                  ),
                  {
                    duration: 6000,
                    description: this.props.t(
                      event.data?.isApiUpdate
                        ? "Your changes may conflict with the API changes."
                        : "Your changes may conflict with the recent updates."
                    ),
                    icon: <AlertTriangleIcon />,
                  }
                );

                // Set a flag on the document to show a warning icon in the editor
                document.lastApiUpdate = new Date().toISOString();
              } else {
                console.log("[TRACE] Document is in view mode, auto-refreshing", {
                  documentId,
                  title: document?.title,
                  isEditing: false,
                });

                // In view mode: use debounced toast and refresh
                this.debouncedShowUpdateToast(
                  this.props.t(
                    event.data?.isApiUpdate
                      ? "Document updated by API"
                      : "Document updated"
                  )
                );

                this.debouncedRefreshDocument(document);
              }
            }
          }
        }
      })
    );

    // Add error handling for YJS provider connections
    this.socket.on("error", (error) => {
      console.error("[YJS] Socket connection error:", error);

      toast.error(this.props.t("Connection error"), {
        description: this.props.t("Attempting to reconnect..."),
        duration: 5000,
      });

      // The socket.io client will automatically try to reconnect
    });

    this.socket.on(
      "documents.progress",
      action((event: WebsocketDocumentProgressEvent) => {
        const { documentId, progressInfo } = event;
        const document = documents.get(documentId);

        if (document) {
          // Update document with progress info
          document.aiProgressInfo = progressInfo;

          // If the document is currently open, show a toast notification
          if (this.props.ui.activeDocumentId === documentId) {
            // Use the global toast function from sonner library
            toast.info(`AI Agent: ${progressInfo}`, {
              duration: 5000,
            });
          }
        }
      })
    );

    this.socket.on(
      "documents.unpublish",
      action(
        (event: {
          document: PartialExcept<Document, "id">;
          collectionId: string;
        }) => {
          const document = event.document;

          // When document is detached as part of unpublishing, only the owner should be able to view it.
          if (
            !document.collectionId &&
            document.createdBy?.id !== currentUserId
          ) {
            documents.remove(document.id);
          } else {
            documents.add(document);
          }
          policies.remove(document.id);

          const collection = collections.get(event.collectionId);
          collection?.removeDocument(document.id);
        }
      )
    );

    this.socket.on(
      "documents.archive",
      action((event: PartialExcept<Document, "id">) => {
        documents.addToArchive(event as Document);

        if (event.collectionId) {
          const collection = collections.get(event.collectionId);
          collection?.removeDocument(event.id);
        }
      })
    );

    this.socket.on(
      "documents.delete",
      action((event: PartialExcept<Document, "id">) => {
        documents.add(event);
        policies.remove(event.id);

        if (event.collectionId) {
          const collection = collections.get(event.collectionId);
          collection?.removeDocument(event.id);
        }

        userMemberships.orderedData
          .filter((m) => m.documentId === event.id)
          .forEach((m) => userMemberships.remove(m.id));
      })
    );

    this.socket.on(
      "documents.permanent_delete",
      (event: WebsocketEntityDeletedEvent) => {
        documents.remove(event.modelId);
      }
    );

    this.socket.on(
      "documents.add_user",
      async (event: PartialExcept<UserMembership, "id">) => {
        userMemberships.add(event);

        // Any existing child policies are now invalid
        if (event.userId === currentUserId) {
          const document = documents.get(event.documentId!);
          if (document) {
            document.childDocuments.forEach((childDocument) => {
              policies.remove(childDocument.id);
            });
          }
        }

        await documents.fetch(event.documentId!, {
          force: event.userId === currentUserId,
        });
      }
    );

    this.socket.on(
      "documents.remove_user",
      (event: PartialExcept<UserMembership, "id">) => {
        userMemberships.remove(event.id);

        // Any existing child policies are now invalid
        if (event.userId === currentUserId) {
          const document = documents.get(event.documentId!);
          if (document) {
            document.childDocuments.forEach((childDocument) => {
              policies.remove(childDocument.id);
            });
          }
        }

        const policy = policies.get(event.documentId!);
        if (policy && policy.abilities.read === false) {
          documents.remove(event.documentId!);
        }
      }
    );

    this.socket.on(
      "documents.add_group",
      (event: PartialExcept<GroupMembership, "id">) => {
        groupMemberships.add(event);

        const group = groups.get(event.groupId!);

        // Any existing child policies are now invalid
        if (
          currentUserId &&
          group?.users.map((u) => u.id).includes(currentUserId)
        ) {
          const document = documents.get(event.documentId!);
          if (document) {
            document.childDocuments.forEach((childDocument) => {
              policies.remove(childDocument.id);
            });
          }
        }
      }
    );

    this.socket.on(
      "documents.remove_group",
      (event: PartialExcept<GroupMembership, "id">) => {
        groupMemberships.remove(event.id);
      }
    );

    this.socket.on("comments.create", (event: PartialExcept<Comment, "id">) => {
      comments.add(event);
    });

    this.socket.on("comments.update", (event: PartialExcept<Comment, "id">) => {
      const comment = comments.get(event.id);

      // Existing policy becomes invalid when the resolution status has changed and we don't have the latest version.
      if (comment?.resolvedAt !== event.resolvedAt) {
        policies.remove(event.id);
      }

      comments.add(event);
    });

    this.socket.on("comments.delete", (event: WebsocketEntityDeletedEvent) => {
      comments.remove(event.modelId);
    });

    this.socket.on(
      "comments.add_reaction",
      (event: WebsocketCommentReactionEvent) => {
        const comment = comments.get(event.commentId);
        comment?.updateReaction({
          type: "add",
          emoji: event.emoji,
          user: event.user,
        });
      }
    );

    this.socket.on(
      "comments.remove_reaction",
      (event: WebsocketCommentReactionEvent) => {
        const comment = comments.get(event.commentId);
        comment?.updateReaction({
          type: "remove",
          emoji: event.emoji,
          user: event.user,
        });
      }
    );

    this.socket.on("groups.create", (event: PartialExcept<Group, "id">) => {
      groups.add(event);
    });

    this.socket.on("groups.update", (event: PartialExcept<Group, "id">) => {
      groups.add(event);
    });

    this.socket.on("groups.delete", (event: WebsocketEntityDeletedEvent) => {
      groups.remove(event.modelId);
    });

    this.socket.on(
      "groups.add_user",
      (event: PartialExcept<GroupUser, "id">) => {
        groupUsers.add(event);
      }
    );

    this.socket.on(
      "groups.remove_user",
      (event: PartialExcept<GroupUser, "id">) => {
        groupUsers.removeAll({
          groupId: event.groupId,
          userId: event.userId,
        });
      }
    );

    this.socket.on(
      "collections.create",
      (event: PartialExcept<Collection, "id">) => {
        collections.add(event);
      }
    );

    this.socket.on(
      "collections.update",
      (event: PartialExcept<Collection, "id">) => {
        collections.add(event);
      }
    );

    this.socket.on(
      "collections.delete",
      action((event: WebsocketEntityDeletedEvent) => {
        const collectionId = event.modelId;
        const deletedAt = new Date().toISOString();
        const deletedDocuments = documents.inCollection(collectionId);
        deletedDocuments.forEach((doc) => {
          if (!doc.publishedAt) {
            // draft is to be detached from collection, not deleted
            doc.collectionId = null;
          } else {
            doc.deletedAt = deletedAt;
          }
          policies.remove(doc.id);
        });
        memberships.removeAll({ collectionId });
        collections.remove(collectionId);
      })
    );

    this.socket.on(
      "collections.archive",
      async (event: PartialExcept<Collection, "id">) => {
        const collectionId = event.id;

        // Fetch collection to update policies
        await collections.fetch(collectionId, { force: true });

        documents.unarchivedInCollection(collectionId).forEach(
          action((doc) => {
            if (!doc.publishedAt) {
              // draft is to be detached from collection, not archived
              doc.collectionId = null;
            } else {
              doc.archivedAt = event.archivedAt as string;
            }
            policies.remove(doc.id);
          })
        );
      }
    );

    this.socket.on(
      "collections.restore",
      async (event: PartialExcept<Collection, "id">) => {
        const collectionId = event.id;
        documents
          .archivedInCollection(collectionId, {
            archivedAt: event.archivedAt as string,
          })
          .forEach(
            action((doc) => {
              doc.archivedAt = null;
              policies.remove(doc.id);
            })
          );

        // Fetch collection to update policies
        await collections.fetch(collectionId, { force: true });
      }
    );

    this.socket.on("teams.update", (event: PartialExcept<Team, "id">) => {
      if ("sharing" in event && event.sharing !== auth.team?.sharing) {
        documents.all.forEach((document) => {
          policies.remove(document.id);
        });
      }

      auth.team?.updateData(event);
    });

    this.socket.on(
      "notifications.create",
      (event: PartialExcept<Notification, "id">) => {
        notifications.add(event);
      }
    );

    this.socket.on(
      "notifications.update",
      (event: PartialExcept<Notification, "id">) => {
        notifications.add(event);
      }
    );

    this.socket.on("pins.create", (event: PartialExcept<Pin, "id">) => {
      pins.add(event);
    });

    this.socket.on("pins.update", (event: PartialExcept<Pin, "id">) => {
      pins.add(event);
    });

    this.socket.on("pins.delete", (event: WebsocketEntityDeletedEvent) => {
      pins.remove(event.modelId);
    });

    this.socket.on("stars.create", (event: PartialExcept<Star, "id">) => {
      stars.add(event);
    });

    this.socket.on("stars.update", (event: PartialExcept<Star, "id">) => {
      stars.add(event);
    });

    this.socket.on("stars.delete", (event: WebsocketEntityDeletedEvent) => {
      stars.remove(event.modelId);
    });

    this.socket.on("collections.add_user", async (event: Membership) => {
      memberships.add(event);
      await collections.fetch(event.collectionId, {
        force: event.userId === currentUserId,
      });
    });

    this.socket.on("collections.remove_user", (event: Membership) => {
      memberships.remove(event.id);

      const policy = policies.get(event.collectionId);
      if (policy && policy.abilities.read === false) {
        collections.remove(event.collectionId);
      }
    });

    this.socket.on("collections.add_group", async (event: GroupMembership) => {
      groupMemberships.add(event);
      await collections.fetch(event.collectionId!);
    });

    this.socket.on(
      "collections.remove_group",
      async (event: GroupMembership) => {
        groupMemberships.remove(event.id);

        const policy = policies.get(event.collectionId!);
        if (policy && policy.abilities.read === false) {
          collections.remove(event.collectionId!);
        }
      }
    );

    this.socket.on(
      "collections.update_index",
      action((event: WebsocketCollectionUpdateIndexEvent) => {
        const collection = collections.get(event.collectionId);
        collection?.updateIndex(event.index);
      })
    );

    this.socket.on(
      "fileOperations.create",
      (event: PartialExcept<FileOperation, "id">) => {
        fileOperations.add(event);
      }
    );

    this.socket.on(
      "fileOperations.update",
      (event: PartialExcept<FileOperation, "id">) => {
        fileOperations.add(event);

        if (
          event.state === FileOperationState.Complete &&
          event.type === FileOperationType.Import &&
          event.user?.id === auth.user?.id
        ) {
          toast.success(event.name, {
            description: this.props.t("Your import completed"),
          });
        }
      }
    );

    this.socket.on("imports.create", (event: PartialExcept<Import, "id">) => {
      imports.add(event);
    });

    this.socket.on("imports.update", (event: PartialExcept<Import, "id">) => {
      imports.add(event);

      if (
        event.state === ImportState.Completed &&
        event.createdBy?.id === auth.user?.id
      ) {
        toast.success(event.name, {
          description: this.props.t("Your import completed"),
        });
      }
    });

    this.socket.on(
      "subscriptions.create",
      (event: PartialExcept<Subscription, "id">) => {
        subscriptions.add(event);
      }
    );

    this.socket.on(
      "subscriptions.delete",
      (event: WebsocketEntityDeletedEvent) => {
        subscriptions.remove(event.modelId);
      }
    );

    this.socket.on("users.update", (event: PartialExcept<User, "id">) => {
      users.add(event);
    });

    this.socket.on("users.demote", async (event: PartialExcept<User, "id">) => {
      if (event.id === auth.user?.id) {
        documents.all.forEach((document) => policies.remove(document.id));
        await collections.fetchAll();
      }
    });

    this.socket.on("users.delete", (event: WebsocketEntityDeletedEvent) => {
      users.remove(event.modelId);
    });

    this.socket.on(
      "userMemberships.update",
      async (event: PartialExcept<UserMembership, "id">) => {
        userMemberships.add(event);
      }
    );

    // received a message from the API server that we should request
    // to join a specific room. Forward that to the ws server.
    this.socket.on("join", (event) => {
      this.socket?.emit("join", event);
    });

    // received a message from the API server that we should request
    // to leave a specific room. Forward that to the ws server.
    this.socket.on("leave", (event) => {
      this.socket?.emit("leave", event);
    });
  };

  render() {
    return (
      <WebsocketContext.Provider value={this.socket}>
        {this.props.children}
      </WebsocketContext.Provider>
    );
  }
}

export default withTranslation()(withStores(WebsocketProvider));
