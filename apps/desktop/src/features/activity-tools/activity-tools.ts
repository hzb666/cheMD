import {
  Bot,
  Files,
  GitGraph,
  Search,
} from "lucide-react";
import type { ActivityTool } from "../../types";

export const referenceActivityItems: {
  id: ActivityTool;
  label: string;
  icon: typeof Files;
}[] = [
  { id: "files", label: "Files", icon: Files },
  { id: "search", label: "RAG Search", icon: Search },
  { id: "graph", label: "Reaction Graph", icon: GitGraph },
  { id: "agent", label: "Agent Runs", icon: Bot },
];

export const getReferenceSidebarTitle = (tool: ActivityTool) => {
  const item = referenceActivityItems.find(({ id }) => id === tool);
  return item?.label ?? "Files";
};
