import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { experimental_createMCPClient, streamText, tool } from "ai";
import { FIGMA_SYSTEM_PROMPT } from "./system-prompt";

export async function POST(req: Request) {
  const { messages } = await req.json();
  console.log(messages);
  const headers: Record<string, string> = Object.fromEntries(
    req.headers.entries()
  );

  try {
    // Alternatively, you can connect to a Server-Sent Events (SSE) MCP server:
    const sseClient = await experimental_createMCPClient({
      name: "figma-mcp",
      transport: {
        type: "sse",
        url: "http://localhost:3001/sse",
      },
    });

    const mcpTools = await sseClient.tools();

    const result = streamText({
      model: anthropic("claude-3-7-sonnet-20250219"),
      system: FIGMA_SYSTEM_PROMPT,
      messages,
      toolCallStreaming: true,
      maxSteps: 5,
      onFinish: async () => {
        await sseClient.close();
      },
      tools: {
        ...mcpTools,
        getFigmaPAT: tool({
          description: "get the figma pat",
          parameters: z.object({}),
          execute: async () => {
            if (process.env.FIGMA_PAT) {
              return {
                content: [{ type: "text", text: process.env.FIGMA_PAT }],
              };
            }
            return {
              isError: true,
              content: [{ type: "text", text: "No PAT found" }],
            };
          },
        }),
        getWeatherInformation: tool({
          description: "show the weather in a given city to the user",
          parameters: z.object({ city: z.string() }),
          execute: async ({}: { city: string }) => {
            // Add artificial delay of 2 seconds
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const weatherOptions = [
              "sunny",
              "cloudy",
              "rainy",
              "snowy",
              "windy",
            ];
            return weatherOptions[
              Math.floor(Math.random() * weatherOptions.length)
            ];
          },
        }),
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
