import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";
import { createClient } from "redis";
import { Socket } from "net";
import { Readable } from "stream";
import { ServerOptions } from "@modelcontextprotocol/sdk/server/index.js";
import { maxDuration } from "@/app/sse/route";

interface SerializedRequest {
  requestId: string;
  url: string;
  method: string;
  body: string;
  headers: IncomingHttpHeaders;
}

/**
 * Initialize the MCP API handler.
 * @param initializeServer - A function that initializes the server.
 * @param serverOptions - Options to send to the MCP server.
 * @returns A function that handles the MCP API.
 */
export function initializeMcpApiHandler(
  initializeServer: (server: McpServer) => void,
  serverOptions: ServerOptions = {}
) {
  if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
    throw new Error("REDIS_HOST and REDIS_PORT must be set");
  }

  // Redis cannot simultaneously subscribe and publish.
  const redisSubscriber = createClient({
    username: process.env.REDIS_USERNAME || "default",
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    },
  });
  const redisPublisher = createClient({
    username: process.env.REDIS_USERNAME || "default",
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    },
  });

  redisSubscriber.on("error", (err) => {
    console.error("Redis Subscriber error:", err);
    if (err.code === "ECONNREFUSED") {
      console.error("Could not connect to Redis. Please check:");
      console.error("1. Redis host and port are correct");
      console.error("2. Redis server is running and accessible");
      console.error("3. Network/firewall settings allow the connection");
      console.error("Current Redis config:", {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        username: process.env.REDIS_USERNAME,
      });
    }
  });
  redisPublisher.on("error", (err) => {
    console.error("Redis Publisher error:", err);
    if (err.code === "ECONNREFUSED") {
      console.error("Could not connect to Redis. Please check:");
      console.error("1. Redis host and port are correct");
      console.error("2. Redis server is running and accessible");
      console.error("3. Network/firewall settings allow the connection");
      console.error("Current Redis config:", {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        username: process.env.REDIS_USERNAME,
      });
    }
  });
  const redisPromise = Promise.all([
    redisSubscriber.connect(),
    redisPublisher.connect(),
  ]).catch((err) => {
    console.error("Failed to connect to Redis:", err);
    // Return a dummy promise that resolves to null
    return [null, null];
  });

  let servers: McpServer[] = []; // Keep track of currently active server instances

  return async function mcpApiHandler(req: Request, res: ServerResponse) {
    await redisPromise; // Wait for Redis to connect
    const url = new URL(req.url || "", "https://example.com");
    const figmaPAT = req.headers.get("figma-pat");

    console.log("Got new request", url.pathname, figmaPAT);
    if (url.pathname === "/sse") {
      console.log("Got new SSE connection");

      const transport = new SSEServerTransport("/message", res); // So we can send messages back over HTTP
      const sessionId = transport.sessionId;
      const mcpServer = new McpServer(
        {
          name: "figma-mcp",
          version: "0.1.0",
          context: {
            figmaPAT,
          },
        },
        serverOptions
      );
      initializeServer(mcpServer); // This is what the caller passed in

      servers.push(mcpServer); // Keep track of the server instance

      mcpServer.server.onclose = () => {
        console.log("SSE connection closed");
        servers = servers.filter((s) => s !== mcpServer);
      };

      let logs: {
        type: "log" | "error";
        messages: string[];
      }[] = [];
      // This ensures that we logs in the context of the right invocation since the subscriber is not itself invoked in request context.
      function logInContext(severity: "log" | "error", ...messages: string[]) {
        logs.push({
          type: severity,
          messages,
        });
      }

      // Handles messages originally received via /message
      const handleMessage = async (message: string) => {
        console.log("Received message from Redis", message);
        logInContext("log", "Received message from Redis", message);
        const request = JSON.parse(message) as SerializedRequest;

        // Make in IncomingMessage object because that is what the SDK expects.
        const req = createFakeIncomingMessage({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.body,
        });
        const syntheticRes = new ServerResponse(req); // Fake response based on the request
        let status = 100;
        let body = "";
        syntheticRes.writeHead = (statusCode: number) => {
          status = statusCode;
          return syntheticRes;
        };
        syntheticRes.end = (b: unknown) => {
          body = b as string;
          return syntheticRes;
        };
        await transport.handlePostMessage(req, syntheticRes);

        await redisPublisher.publish(
          `responses:${sessionId}:${request.requestId}`,
          JSON.stringify({
            status,
            body,
          })
        );

        if (status >= 200 && status < 300) {
          logInContext(
            "log",
            `Request ${sessionId}:${request.requestId} succeeded: ${body}`
          );
        } else {
          logInContext(
            "error",
            `Message for ${sessionId}:${request.requestId} failed with status ${status}: ${body}`
          );
        }
      };

      const interval = setInterval(() => {
        for (const log of logs) {
          console[log.type].call(console, ...log.messages);
        }
        logs = [];
      }, 100);

      await redisSubscriber.subscribe(`requests:${sessionId}`, handleMessage);
      console.log(`Subscribed to requests:${sessionId}`);

      let timeout: NodeJS.Timeout;
      let resolveTimeout: (value: unknown) => void;
      const waitPromise = new Promise((resolve) => {
        resolveTimeout = resolve;
        timeout = setTimeout(() => {
          resolve("max duration reached");
        }, (maxDuration - 5) * 1000);
      });

      async function cleanup() {
        clearTimeout(timeout);
        clearInterval(interval);
        await redisSubscriber.unsubscribe(
          `requests:${sessionId}`,
          handleMessage
        );
        console.log("Done");
        res.statusCode = 200;
        res.end();
      }
      req.signal.addEventListener("abort", () =>
        resolveTimeout("client hang up")
      );

      await mcpServer.connect(transport);
      const closeReason = await waitPromise;
      console.log(closeReason);
      await cleanup();
    } else if (url.pathname === "/message") {
      console.log("Received message");

      const body = await req.text();

      const sessionId = url.searchParams.get("sessionId") || "";
      if (!sessionId) {
        res.statusCode = 400;
        res.end("No sessionId provided");
        return;
      }
      const requestId = crypto.randomUUID();
      const serializedRequest: SerializedRequest = {
        requestId,
        url: req.url || "",
        method: req.method || "",
        body: body,
        headers: Object.fromEntries(req.headers.entries()),
      };

      // Handles responses from the /sse endpoint.
      await redisSubscriber.subscribe(
        `responses:${sessionId}:${requestId}`,
        (message) => {
          clearTimeout(timeout);
          const response = JSON.parse(message) as {
            status: number;
            body: string;
          };
          res.statusCode = response.status;
          res.end(response.body);
        }
      );

      // Queue the request in Redis so that a subscriber can pick it up.
      // One queue per session.
      await redisPublisher.publish(
        `requests:${sessionId}`,
        JSON.stringify(serializedRequest)
      );
      console.log(`Published requests:${sessionId}`, serializedRequest);

      let timeout = setTimeout(async () => {
        await redisSubscriber.unsubscribe(
          `responses:${sessionId}:${requestId}`
        );
        res.statusCode = 408;
        res.end("Request timed out");
      }, 10 * 1000);

      res.on("close", async () => {
        clearTimeout(timeout);
        await redisSubscriber.unsubscribe(
          `responses:${sessionId}:${requestId}`
        );
      });
    } else {
      res.statusCode = 404;
      res.end("Not found");
    }
  };
}

// Define the options interface
interface FakeIncomingMessageOptions {
  method?: string;
  url?: string;
  headers?: IncomingHttpHeaders;
  body?: string | Buffer | Record<string, any> | null;
  socket?: Socket;
}

// Create a fake IncomingMessage
function createFakeIncomingMessage(
  options: FakeIncomingMessageOptions = {}
): IncomingMessage {
  const {
    method = "GET",
    url = "/",
    headers = {},
    body = null,
    socket = new Socket(),
  } = options;

  // Create a readable stream that will be used as the base for IncomingMessage
  const readable = new Readable();
  readable._read = (): void => {}; // Required implementation

  // Add the body content if provided
  if (body) {
    if (typeof body === "string") {
      readable.push(body);
    } else if (Buffer.isBuffer(body)) {
      readable.push(body);
    } else {
      readable.push(JSON.stringify(body));
    }
    readable.push(null); // Signal the end of the stream
  }

  // Create the IncomingMessage instance
  const req = new IncomingMessage(socket);

  // Set the properties
  req.method = method;
  req.url = url;
  req.headers = headers;

  // Copy over the stream methods
  req.push = readable.push.bind(readable);
  req.read = readable.read.bind(readable);
  // @ts-expect-error
  req.on = readable.on.bind(readable);
  req.pipe = readable.pipe.bind(readable);

  return req;
}
