/** Types shared across the document-tree feature. */

export interface DocumentNode {
  id: string;
  label: string;
  kind: "document" | "section" | "block";
  blockType?: string;
  children?: DocumentNode[];
}
