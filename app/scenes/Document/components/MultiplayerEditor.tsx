import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import throttle from "lodash/throttle";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangleIcon } from "outline-icons";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import {
  AuthenticationFailed,
  DocumentTooLarge,
  EditorUpdateError,
} from "@shared/collaboration/CloseEvents";
import EDITOR_VERSION from "@shared/editor/version";
import { supportsPassiveListener } from "@shared/utils/browser";
import Editor, { Props as EditorProps } from "~/components/Editor";
import MultiplayerExtension from "~/editor/extensions/Multiplayer";
import env from "~/env";
import useCurrentUser from "~/hooks/useCurrentUser";
import useIdle from "~/hooks/useIdle";
import useIsMounted from "~/hooks/useIsMounted";
import usePageVisibility from "~/hooks/usePageVisibility";
import useStores from "~/hooks/useStores";
import { AwarenessChangeEvent } from "~/types";
import Logger from "~/utils/Logger";
import { homePath } from "~/utils/routeHelpers";
import Document from "~/models/Document";

// Extend HocuspocusProvider with our custom method
declare module "@hocuspocus/provider" {
  interface HocuspocusProvider {
    resetDocument?: () => boolean;
  }
}

type Props = EditorProps & {
  id: string;
  document?: Document;
  onSynced?: () => Promise<void>;
};

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | void;

type ConnectionStatusEvent = { status: ConnectionStatus };

type MessageEvent = {
  message: string;
  event: Event & {
    code?: number;
  };
};

function MultiplayerEditor({ onSynced, ...props }: Props, ref: any) {
  const documentId = props.id;
  const history = useHistory();
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const { presence, auth, ui } = useStores();
  const [showCursorNames, setShowCursorNames] = React.useState(false);
  const [remoteProvider, setRemoteProvider] =
    React.useState<HocuspocusProvider | null>(null);
  const [isLocalSynced, setLocalSynced] = React.useState(false);
  const [isRemoteSynced, setRemoteSynced] = React.useState(false);
  const [ydoc] = React.useState(() => new Y.Doc());
  const token = auth.collaborationToken;
  const isIdle = useIdle();
  const isVisible = usePageVisibility();
  const isMounted = useIsMounted();

  // Provider initialization must be within useLayoutEffect rather than useState
  // or useMemo as both of these are ran twice in React StrictMode resulting in
  // an orphaned websocket connection.
  // see: https://github.com/facebook/react/issues/20090#issuecomment-715926549
  React.useLayoutEffect(() => {
    const debug = env.ENVIRONMENT === "development";
    const name = `document.${documentId}`;
    const localProvider = new IndexeddbPersistence(name, ydoc);
    const provider = new HocuspocusProvider({
      parameters: {
        editorVersion: EDITOR_VERSION,
      },
      url: `${env.COLLABORATION_URL}/collaboration`,
      name,
      document: ydoc,
      token,
    });

    const syncScrollPosition = throttle(() => {
      provider.setAwarenessField(
        "scrollY",
        window.scrollY / window.innerHeight
      );
    }, 250);

    const finishObserving = () => {
      if (ui.observingUserId) {
        ui.setObservingUser(undefined);
      }
    };

    window.addEventListener("click", finishObserving);
    window.addEventListener("wheel", finishObserving);
    window.addEventListener(
      "scroll",
      syncScrollPosition,
      supportsPassiveListener ? { passive: true } : false
    );

    provider.on("authenticationFailed", () => {
      void auth.fetchAuth().catch(() => {
        history.replace(homePath());
      });
    });

    provider.on("awarenessChange", (event: AwarenessChangeEvent) => {
      presence.updateFromAwarenessChangeEvent(
        documentId,
        provider.awareness.clientID,
        event
      );

      event.states.forEach(({ user, scrollY }) => {
        if (user) {
          if (scrollY !== undefined && user.id === ui.observingUserId) {
            window.scrollTo({
              top: scrollY * window.innerHeight,
              behavior: "smooth",
            });
          }
        }
      });
    });

    const showCursorNames = () => {
      setShowCursorNames(true);
      setTimeout(() => {
        if (isMounted()) {
          setShowCursorNames(false);
        }
      }, 2000);
      provider.off("awarenessChange", showCursorNames);
    };

    provider.on("awarenessChange", showCursorNames);
    localProvider.on("synced", () =>
      // only set local storage to "synced" if it's loaded a non-empty doc
      setLocalSynced(!!ydoc.get("default")._start)
    );
    provider.on("synced", () => {
      presence.touch(documentId, currentUser.id, false);
      setRemoteSynced(true);
    });

    // Add a method to reset the YJS document with new content from the server
    provider.resetDocument = () => {
      console.log("[TRACE] Resetting YJS document with server content", {
        documentId,
      });

      try {
        // Disconnect the provider to stop receiving updates temporarily
        provider.disconnect();

        // Clear the local document state
        ydoc.destroy();

        // Create a new Y.Doc instance
        const newYDoc = new Y.Doc();
        provider.document = newYDoc;

        // Force a reconnection to get the latest state from the server
        provider.connect();

        console.log(
          "[TRACE] YJS document reset initiated, reconnecting to server",
          {
            documentId,
          }
        );

        // Set a flag to indicate we're waiting for a sync
        setRemoteSynced(false);
        setLocalSynced(false);

        return true;
      } catch (error) {
        console.error("[ERROR] Failed to reset YJS document", error);

        // If the reset fails, fall back to a page reload
        window.location.reload();
        return false;
      }
    };

    provider.on("update", (update: any) => {
      console.log("[DEBUG] YJS provider received update event", {
        update,
        documentId,
        isForced: update.isForced,
        hasEditor: !!props.document?.editor,
        readOnly: props.readOnly,
      });

      // Check if this update is a forced update from the server (API update)
      if (update.isForced) {
        const document = props.document;
        const isEditing = !props.readOnly;

        if (!isEditing) {
          console.log(
            "[DEBUG] Document in view mode, attempting refresh",
            {
              documentId,
              title: document?.title,
              hasEditor: !!document?.editor,
              hasProvider: !!document?.editor?.provider,
              hasResetDocument: !!document?.editor?.provider?.resetDocument,
            }
          );

          // Use the provider to reset the document content
          if (provider.resetDocument) {
            console.log("[DEBUG] Using provider.resetDocument", { documentId });
            const success = provider.resetDocument();
            console.log("[DEBUG] resetDocument result", { success, documentId });
          } else {
            console.log("[DEBUG] Falling back to document fetch", { documentId });
            // Fallback to fetching the document and updating the editor content
            document.fetch({ force: true }).then(() => {
              console.log("[DEBUG] Document fetch completed", {
                documentId,
                hasData: !!document.data,
                hasEditor: !!document.editor,
                hasOnContentChange: !!props.onContentChange,
              });

              // Force editor to update with new content
              if (props.onContentChange) {
                console.log("[DEBUG] Calling onContentChange with new data", {
                  documentId,
                  dataLength: document.data?.content?.length,
                });
                props.onContentChange(document.data);
              } else {
                console.warn("[DEBUG] No onContentChange handler available", {
                  documentId,
                });
              }
            }).catch(error => {
              console.error("[DEBUG] Error fetching document", {
                documentId,
                error,
              });
            });
          }
        } else {
          // In edit mode, show warning
          console.log("[DEBUG] Document in edit mode, showing warning", {
            documentId,
            title: document?.title,
          });
          toast.warning(t("This document has been updated via API"), {
            duration: 6000,
            description: t("Your changes may conflict with the API changes."),
            icon: <AlertTriangleIcon />,
          });
        }
      }
    });

    provider.on("close", (ev: MessageEvent) => {
      if ("code" in ev.event) {
        provider.shouldConnect =
          ev.event.code !== DocumentTooLarge.code &&
          ev.event.code !== AuthenticationFailed.code &&
          ev.event.code !== EditorUpdateError.code;
        ui.setMultiplayerStatus("disconnected", ev.event.code);

        if (ev.event.code === EditorUpdateError.code) {
          window.location.reload();
        }
      }
    });

    if (debug) {
      provider.on("close", (ev: MessageEvent) =>
        Logger.debug("collaboration", "close", ev)
      );
      provider.on("message", (ev: MessageEvent) =>
        Logger.debug("collaboration", "incoming", {
          message: ev.message,
        })
      );
      provider.on("outgoingMessage", (ev: MessageEvent) =>
        Logger.debug("collaboration", "outgoing", {
          message: ev.message,
        })
      );
      localProvider.on("synced", () =>
        Logger.debug("collaboration", "local synced")
      );
    }

    provider.on("status", (ev: ConnectionStatusEvent) => {
      if (ui.multiplayerStatus !== ev.status) {
        ui.setMultiplayerStatus(ev.status, undefined);
      }
    });

    setRemoteProvider(provider);

    return () => {
      window.removeEventListener("click", finishObserving);
      window.removeEventListener("wheel", finishObserving);
      window.removeEventListener("scroll", syncScrollPosition);
      provider?.destroy();
      void localProvider?.destroy();
      setRemoteProvider(null);
      ui.setMultiplayerStatus(undefined, undefined);
    };
  }, [
    history,
    t,
    documentId,
    ui,
    presence,
    ydoc,
    token,
    currentUser.id,
    isMounted,
    auth,
  ]);

  const user = React.useMemo(
    () => ({
      id: currentUser.id,
      name: currentUser.name,
      color: currentUser.color,
    }),
    [currentUser.id, currentUser.color, currentUser.name]
  );

  const extensions = React.useMemo(() => {
    if (!remoteProvider) {
      return props.extensions;
    }

    return [
      ...(props.extensions || []),
      new MultiplayerExtension({
        user,
        provider: remoteProvider,
        document: ydoc,
      }),
    ];
  }, [remoteProvider, user, ydoc, props.extensions]);

  React.useEffect(() => {
    if (isLocalSynced && isRemoteSynced) {
      void onSynced?.();
    }
  }, [onSynced, isLocalSynced, isRemoteSynced]);

  // Disconnect the realtime connection while idle. `isIdle` also checks for
  // page visibility and will immediately disconnect when a tab is hidden.
  React.useEffect(() => {
    if (!remoteProvider) {
      return;
    }

    if (
      isIdle &&
      !isVisible &&
      remoteProvider.status === WebSocketStatus.Connected
    ) {
      void remoteProvider.disconnect();
    }

    if (
      (!isIdle || isVisible) &&
      remoteProvider.status === WebSocketStatus.Disconnected
    ) {
      void remoteProvider.connect();
    }
  }, [remoteProvider, isIdle, isVisible]);

  // Certain emoji combinations trigger this error in YJS, while waiting for a fix
  // we must prevent the user from continuing to edit as their changes will not
  // be persisted. See: https://github.com/yjs/yjs/issues/303
  React.useEffect(() => {
    function onUnhandledError(event: ErrorEvent) {
      if (event.message.includes("URIError: URI malformed")) {
        toast.error(
          t(
            "Sorry, the last change could not be persisted – please reload the page"
          )
        );
      }
    }

    window.addEventListener("error", onUnhandledError);
    return () => window.removeEventListener("error", onUnhandledError);
  }, [t]);

  if (!remoteProvider) {
    return null;
  }

  // while the collaborative document is loading, we render a version of the
  // document from the last text cache in read-only mode if we have it.
  const showCache = !isLocalSynced && !isRemoteSynced;

  return (
    <>
      {showCache && (
        <Editor
          editorStyle={props.editorStyle}
          embedsDisabled={props.embedsDisabled}
          defaultValue={props.defaultValue}
          extensions={props.extensions}
          scrollTo={props.scrollTo}
          readOnly
          ref={ref}
        />
      )}
      <Editor
        {...props}
        value={undefined}
        defaultValue={undefined}
        extensions={extensions}
        ref={showCache ? undefined : ref}
        style={
          showCache
            ? {
              height: 0,
              opacity: 0,
            }
            : undefined
        }
        className={showCursorNames ? "show-cursor-names" : undefined}
      />
    </>
  );
}

export default React.forwardRef<typeof MultiplayerEditor, Props>(
  MultiplayerEditor
);
