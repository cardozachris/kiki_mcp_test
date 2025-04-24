import { z } from "zod";
import { initializeMcpApiHandler } from "../lib/mcp-api-handler";
import { FigmaService } from "@/lib/figma";
import { FigmaFile } from "@/lib/figma/parser";
import yaml from "js-yaml";

export const mcpHandler = initializeMcpApiHandler(
  (server) => {
    // Add more tools, resources, and prompts here
    server.tool("echo", { message: z.string() }, async ({ message }) => ({
      content: [{ type: "text", text: `Tool echo: ${message}` }],
    }));

    server.tool(
      "get_figma_images_links",
      {
        fileKey: z.string(),
        nodes: z
          .object({
            nodeId: z
              .string()
              .describe(
                "The ID of the Figma image node to fetch, formatted as 1234:5678"
              ),
            imageRef: z
              .string()
              .nullish()
              .describe(
                "If a node has an imageRef fill, you must include this variable. Leave blank when downloading Vector SVG images."
              ),
            fileName: z
              .string()
              .describe("The local name for saving the fetched file"),
          })
          .array()
          .describe("The nodes to fetch as images"),
        figmaPAT: z.string(),
      },
      async ({ fileKey, nodes, figmaPAT }) => {
        try {
          const figmaService = new FigmaService(figmaPAT);
          const imageFills = nodes.filter(({ imageRef }) => !!imageRef) as {
            nodeId: string;
            imageRef: string;
            fileName: string;
          }[];
          const renderRequests = nodes
            .filter(({ imageRef }) => !imageRef)
            .map(({ nodeId, fileName }) => ({
              nodeId,
              fileType: fileName.endsWith(".svg")
                ? ("svg" as const)
                : ("png" as const),
            }));

          const fillImageUrls = await figmaService.getImageFillUrls(
            fileKey,
            imageFills
          );

          const renderDownloads = await figmaService.getImageUrls(
            fileKey,
            renderRequests
          );

          const urls = await Promise.all([fillImageUrls, renderDownloads]).then(
            ([f, r]) => [...f, ...r]
          );

          return {
            content: urls.map((url) => ({
              type: "image",
              data: url,
              mimeType: url.endsWith(".svg") ? "image/svg+xml" : "image/png",
            })),
          };
        } catch (error) {
          console.error(error);
          return {
            isError: true,
            content: [{ type: "text", text: "Error fetching images" }],
          };
        }
      }
    );

    server.tool(
      "get_figma_data",
      {
        fileKey: z
          .string()
          .describe(
            "The key of the Figma file to fetch, often found in a provided URL like figma.com/(file|design)/<fileKey>/..."
          ),
        nodeId: z
          .string()
          .optional()
          .describe(
            "The ID of the node to fetch, often found as URL parameter node-id=<nodeId>, always use if provided"
          ),
        depth: z
          .number()
          .optional()
          .describe(
            "How many levels deep to traverse the node tree, only use if explicitly requested by the user"
          ),
        figmaPAT: z
          .string()
          .describe(
            "The personal access token for Figma, used to fetch data from the file"
          ),
      },
      async ({ fileKey, nodeId, depth, figmaPAT }) => {
        const figmaService = new FigmaService(figmaPAT);
        let file: FigmaFile;
        if (nodeId) {
          file = await figmaService.getNode(fileKey, nodeId, depth);
        } else {
          file = await figmaService.getFile(fileKey, depth);
        }

        const { nodes, globalVars, ...metadata } = file;

        const result = {
          metadata,
          nodes,
          globalVars,
        };

        const yamlResult = yaml.dump(result);
        return {
          content: [
            {
              type: "text",
              text: yamlResult,
            },
          ],
        };
      }
    );
  },
  {
    capabilities: {
      tools: {
        echo: {
          description: "Echo a message",
        },
        get_figma_data: {
          description: "Get data from a Figma file",
        },
        get_figma_images_links: {
          description: "Get links to images from a Figma file",
        },
      },
    },
  }
);
