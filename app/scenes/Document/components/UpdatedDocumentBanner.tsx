import { m, AnimatePresence } from "framer-motion";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { depths } from "@shared/styles";
import Button from "~/components/Button";
import useStores from "~/hooks/useStores";
import { useDocumentContext } from "~/components/DocumentContext";
import { draggableOnDesktop } from "~/styles";

const transition = {
  type: "spring",
  stiffness: 500,
  damping: 30,
};

function UpdatedDocumentBanner() {
  const { documents, ui } = useStores();
  const { t } = useTranslation();
  const { editor } = useDocumentContext();

  const document = ui.activeDocumentId
    ? documents.get(ui.activeDocumentId)
    : undefined;
  const isVisible =
    document?.hasRecentApiUpdate && editor && !editor.props.readOnly;

  const handleRevertAndUpdate = React.useCallback(() => {
    if (document) {
      // Force reload the document content
      document.fetch({ force: true });
    }
  }, [document]);

  return (
    <Positioner>
      <AnimatePresence>
        {isVisible && (
          <Banner
            transition={transition}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: -5 }}
            exit={{ opacity: 0, y: -30 }}
          >
            <BannerContent>
              {t("This document has been updated")}
              <Button onClick={handleRevertAndUpdate} neutral small>
                {t("Revert changes and load newest version")}
              </Button>
            </BannerContent>
          </Banner>
        )}
      </AnimatePresence>
    </Positioner>
  );
}

const Positioner = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: ${depths.header + 1};
  display: flex;
  justify-content: center;
`;

const Banner = styled(m.div)`
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => props.theme.white};
  background: ${(props) => props.theme.warning};
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  ${draggableOnDesktop()}
`;

const BannerContent = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

export default observer(UpdatedDocumentBanner);
