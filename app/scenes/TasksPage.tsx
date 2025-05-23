import React, { useState, useEffect, useCallback } from "react";
import { observer } from "mobx-react";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import { Task }from "@shared/types/Tasks";
import useStores from "@hooks/useStores";
import CenteredContent from "@components/CenteredContent";
import PageTitle from "@components/PageTitle";
import Tabs from "@components/Tabs/Tabs"; // Corrected import path
import Tab from "@components/Tabs/Tab"; // Corrected import path
import TaskList from "@components/TaskList";
import LoadingIndicator from "@components/LoadingIndicator";
import Empty from "@components/Empty";
import Text from "@shared/components/Text";

const Container = styled(CenteredContent)`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const TasksLayout = styled(Flex)`
  width: 100%;
  flex-grow: 1; // Takes up remaining vertical space
`;

const TabContent = styled.div`
  width: 100%;
  padding-top: 16px; // Space below tabs
`;

type TabName = "my" | "open" | "done";

const TasksPage: React.FC = observer(() => {
  const { tasks: tasksStore, ui: uiStore } = useStores();
  const history = useHistory();
  const [activeTab, setActiveTab] = useState<TabName>("my");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);

  const fetchTasks = useCallback(
    async (tab: TabName) => {
      setLoading(true);
      setError(null);
      try {
        let fetchedTasks: Task[] = [];
        switch (tab) {
          case "my":
            fetchedTasks = await tasksStore.fetchMyTasks();
            setMyTasks(fetchedTasks);
            break;
          case "open":
            fetchedTasks = await tasksStore.fetchOpenTasks();
            setOpenTasks(fetchedTasks);
            break;
          case "done":
            fetchedTasks = await tasksStore.fetchDoneTasks();
            setDoneTasks(fetchedTasks);
            break;
        }
      } catch (err) {
        setError("Failed to load tasks. Please try again.");
        uiStore.showToast("Failed to load tasks", "error");
      } finally {
        setLoading(false);
      }
    },
    [tasksStore, uiStore]
  );

  useEffect(() => {
    fetchTasks(activeTab);
  }, [activeTab, fetchTasks]);

  const handleTaskClick = (task: Task) => {
    history.push(`/tasks/${task.guid}`);
  };

  const renderTabContent = () => {
    if (loading) {
      return <LoadingIndicator />;
    }
    if (error) {
      return <Text color="danger">{error}</Text>;
    }

    let tasksToDisplay: Task[] = [];
    let droppableId = "";
    let isReorderEnabled = false;

    switch (activeTab) {
      case "my":
        tasksToDisplay = myTasks;
        droppableId = "my-tasks";
        isReorderEnabled = true; // Enable DND for "My Tasks"
        break;
      case "open":
        tasksToDisplay = openTasks;
        droppableId = "open-tasks";
        isReorderEnabled = true; // Enable DND for "Open Tasks"
        break;
      case "done":
        tasksToDisplay = doneTasks;
        droppableId = "done-tasks";
        isReorderEnabled = false; // Disable DND for "Done Tasks"
        break;
    }

    if (!tasksToDisplay.length && !loading) {
      return <Empty>No tasks in this view.</Empty>;
    }
    
    const handleReorder = async (orderedGuids: string[]) => {
      try {
        await tasksStore.reorderTasks(orderedGuids, activeTab === "my" ? myTasks : openTasks);
        // Optimistic update: Re-fetch or update local state
        // For simplicity, let's re-fetch the current tab's tasks
        // Or, if the store updates the task list internally and notifies observers,
        // the list will re-render. Assuming the store handles this.
        // If not, manually update state:
        if (activeTab === "my") {
          const reordered = orderedGuids.map(guid => myTasks.find(t => t.guid === guid)).filter(Boolean) as Task[];
          setMyTasks(reordered);
        } else if (activeTab === "open") {
          const reordered = orderedGuids.map(guid => openTasks.find(t => t.guid === guid)).filter(Boolean) as Task[];
          setOpenTasks(reordered);
        }

      } catch (reorderError) {
        uiStore.showToast("Failed to reorder tasks.", "error");
        // Optionally revert UI or re-fetch to ensure consistency
        fetchTasks(activeTab); 
      }
    };

    return (
      <TaskList
        tasks={tasksToDisplay}
        onTaskClick={handleTaskClick}
        onReorder={isReorderEnabled ? handleReorder : undefined}
        droppableId={droppableId}
        isReorderEnabled={isReorderEnabled}
      />
    );
  };

  // Assuming Tabs and Tab components are available and work like this:
  // <Tabs value={activeTab} onChange={setActiveTab}>
  //   <Tab value="my" label="My Open Tasks" />
  //   ...
  // </Tabs>
  // If not, I'll need to implement a simple tab switcher or find one in the codebase.
  // For now, I'll mock the tab switching logic and focus on data fetching.

  return (
    <Container>
      <PageTitle title="Tasks" />
      <TasksLayout column>
        <Tabs
          value={activeTab}
          onChange={(newTab) => setActiveTab(newTab as TabName)}
          fitted // Or other props as needed by your Tabs component
        >
          <Tab value="my" label="My Open Tasks" />
          <Tab value="open" label="All Open Tasks" />
          <Tab value="done" label="Done Tasks" />
        </Tabs>
        <TabContent>{renderTabContent()}</TabContent>
      </TasksLayout>
    </Container>
  );
});

export default TasksPage;
