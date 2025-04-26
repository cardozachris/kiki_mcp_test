import { mcpHandler } from "@/app/mcp";
import { createServerResponseAdapter } from "@/lib/server-response-adapter";

export const maxDuration = 60;

export async function POST(req: Request) {
  console.log("Message route called");
  console.log(req);
  return createServerResponseAdapter(req.signal, (res) => {
    mcpHandler(req, res);
  });
}
