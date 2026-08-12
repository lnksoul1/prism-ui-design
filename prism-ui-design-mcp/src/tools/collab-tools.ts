/**
 * Collaboration annotations (improvement plan C5 subset).
 *
 * Comment on any component on the canvas so users and agents can leave
 * review feedback without changing the design itself.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";

export function registerCollabTools(server: McpServer): void {
  server.registerTool(
    "design_add_comment",
    {
      title: "Add Comment",
      description: `Attach a review comment to a component.

Args:
  - component_id (string): Component to comment on
  - text (string): Comment text
  - author (string, optional): Author name (default 'user')`,
      inputSchema: {
        component_id: z.string().describe("Component ID"),
        text: z.string().min(1).max(1000).describe("Comment text"),
        author: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const comment = stateStore.addComment(params.component_id, params.text, params.author || "user", "user");
        return {
          content: [
            {
              type: "text" as const,
              text: `Comment added: ${comment.id} (${comment.author} on ${params.component_id}).`,
            },
          ],
          structuredContent: { success: true, comment },
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );

  server.registerTool(
    "design_list_comments",
    {
      title: "List Comments",
      description: "List all review comments, optionally filtered by component.",
      inputSchema: {
        component_id: z.string().optional().describe("Only comments on this component"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const all = stateStore.getState().comments;
        const comments = params.component_id ? all.filter((c) => c.component_id === params.component_id) : all;
        const text =
          comments.length === 0
            ? "No comments."
            : comments
                .map((c, i) => `${i + 1}. [${c.author} @ ${c.createdAt}] ${c.text} — on ${c.component_id}`)
                .join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { success: true, count: comments.length, comments },
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );

  server.registerTool(
    "design_remove_comment",
    {
      title: "Remove Comment",
      description: "Remove a review comment by id.",
      inputSchema: {
        comment_id: z.string().describe("Comment ID to remove"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const ok = stateStore.removeComment(params.comment_id, "user");
        return {
          content: [
            {
              type: "text" as const,
              text: ok ? `Removed comment ${params.comment_id}.` : `Comment ${params.comment_id} not found.`,
            },
          ],
          structuredContent: { success: ok, comment_id: params.comment_id },
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
}
