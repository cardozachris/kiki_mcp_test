import {
  type GetFileResponse,
  type GetFileNodesResponse,
  GetImageFillsResponse,
  GetImagesResponse,
} from "@figma/rest-api-spec";
import { FigmaFile } from "./parser";
import { parseFigmaResponse } from "./parser";

export interface FigmaError {
  status: number;
  err: string;
}

type FetchImageParams = {
  /**
   * The Node in Figma that will either be rendered or have its background image downloaded
   */
  nodeId: string;
  /**
   * The file mimetype for the image
   */
  fileType: "png" | "svg";
};

type FetchImageFillParams = Omit<FetchImageParams, "fileType"> & {
  /**
   * Required to grab the background image when an image is used as a fill
   */
  imageRef: string;
};

export class FigmaService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.figma.com/v1";
  private readonly isOAuthToken: boolean;

  constructor(apiKey: string, isOAuthToken: boolean = false) {
    this.apiKey = apiKey;
    this.isOAuthToken = isOAuthToken;
  }

  private async request<T>(endpoint: string): Promise<T> {
    if (typeof fetch !== "function") {
      throw new Error(
        "The MCP server is being run in a Node.js environment where `fetch` is not available. You won't be able to access any data related to the Figma file.\n\nAs the coding AI assistant, PLEASE ABORT THE CURRENT REQUEST. No alternate approaches will work. Help the user fix this issue so you can proceed by letting them know that they need to run the MCP server with Node.js version 18 or higher."
      );
    }
    try {
      const headers: Record<string, string> = this.isOAuthToken
        ? { Authorization: `Bearer ${this.apiKey}` }
        : { "X-Figma-Token": this.apiKey };

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers,
      });

      if (!response.ok) {
        throw {
          status: response.status,
          err: response.statusText || "Unknown error",
        } as FigmaError;
      }

      return await response.json();
    } catch (error) {
      if ((error as FigmaError).status) {
        throw error;
      }
      if (error instanceof Error) {
        throw new Error(
          `Failed to make request to Figma API: ${error.message}`
        );
      }
      throw new Error(`Failed to make request to Figma API: ${error}`);
    }
  }

  async getFile(fileKey: string, depth?: number): Promise<FigmaFile> {
    try {
      const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ""}`;
      const response = await this.request<GetFileResponse>(endpoint);
      const simplifiedResponse = parseFigmaResponse(response);
      return simplifiedResponse;
    } catch (e) {
      console.error("Failed to get file:", e);
      throw e;
    }
  }

  async getNode(
    fileKey: string,
    nodeId: string,
    depth?: number
  ): Promise<FigmaFile> {
    const endpoint = `/files/${fileKey}/nodes?ids=${nodeId}${
      depth ? `&depth=${depth}` : ""
    }`;
    const response = await this.request<GetFileNodesResponse>(endpoint);
    const simplifiedResponse = parseFigmaResponse(response);
    return simplifiedResponse;
  }

  async getImageFillUrls(
    fileKey: string,
    nodes: FetchImageFillParams[]
  ): Promise<string[]> {
    if (nodes.length === 0) return [];

    let promises: Promise<string>[] = [];
    const endpoint = `/files/${fileKey}/images`;

    const file = await this.request<GetImageFillsResponse>(endpoint);
    const { images = {} } = file.meta;

    promises = nodes.map(async ({ imageRef }) => {
      const imageUrl = images[imageRef];
      if (!imageUrl) return "";
      return imageUrl;
    });
    return Promise.all(promises);
  }

  async getImageUrls(
    fileKey: string,
    nodes: FetchImageParams[]
  ): Promise<string[]> {
    const pngIds = nodes
      .filter(({ fileType }) => fileType === "png")
      .map(({ nodeId }) => nodeId);
    const pngFiles =
      pngIds.length > 0
        ? this.request<GetImagesResponse>(
            `/images/${fileKey}?ids=${pngIds.join(",")}&scale=2&format=png`
          ).then(({ images = {} }) => images)
        : ({} as GetImagesResponse["images"]);

    const svgIds = nodes
      .filter(({ fileType }) => fileType === "svg")
      .map(({ nodeId }) => nodeId);
    const svgFiles =
      svgIds.length > 0
        ? this.request<GetImagesResponse>(
            `/images/${fileKey}?ids=${svgIds.join(",")}&format=svg`
          ).then(({ images = {} }) => images)
        : ({} as GetImagesResponse["images"]);

    const files = await Promise.all([pngFiles, svgFiles]).then(([f, l]) => ({
      ...f,
      ...l,
    }));

    const downloads = nodes
      .map(({ nodeId }) => {
        const imageUrl = files[nodeId];
        if (imageUrl) {
          return imageUrl;
        }
        return false;
      })
      .filter((url): url is string => typeof url === "string");

    return Promise.all(downloads);
  }
}

export default FigmaService;
