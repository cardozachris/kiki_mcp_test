import { mcpHandler } from "@/app/mcp";
import { createServerResponseAdapter } from "@/lib/server-response-adapter";

export const maxDuration = 500;

export async function GET(req: Request) {
  console.log("SSE route called");
  console.log(req);
  return createServerResponseAdapter(req.signal, (res) => {
    mcpHandler(req, res);
  });
}
