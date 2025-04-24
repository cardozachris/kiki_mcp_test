import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { experimental_createMCPClient, streamText, tool } from "ai";

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
        url: "http://localhost:3000/sse",
      },
    });

    const mcpTools = await sseClient.tools();

    const result = streamText({
      model: anthropic("claude-3-7-sonnet-20250219"),
      system: `You are an expert at converting Figma designs into HTML and CSS. The way to do it is to access the figma tool.
      1) Any messages related to figma should go for the figma pat tool first.
      2) Using the PAT, you can get information about the file or a give node.
      3) When you ask for a file or node, you will get a response with a YAML string.
      4) The YAML string is a list of nodes with information about the node and its children. 
      5) A node can be a frame, image, text, stroke, effect, layout. 
      7) Use the YAML to create the HTML structure and CSS styles.
      8) Most importantly, you can request for the thumbnail image of each node along the tree. 
      9) Its better to use thumbnail image if a node has too many vector/svg nodes. 
      10) If a node is an image node, use the image url.
      11) Using the assets and YAML, create the most accurate representation of the file or node in HTML and CSS.
      12) Sometimes if you get a frame, and it has icons that would be better off to be taken as svg, dont consider it to be a thumbnail, render out the individual elements as part of the html.
      13) Dont recreate svg's from scratch, always use the svg tags that you can get from the assets. 
      `,
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
            // put the figma pat here
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
