export const aiActions = ["explain", "refactor", "fix", "tests", "optimize"] as const;

export type AiAction = (typeof aiActions)[number];

export type AiAssistRequest = {
  action: AiAction;
  code: string;
  fileName?: string;
  language?: string;
  surroundingCode?: string;
};

export type AiAssistResponse = {
  action: AiAction;
  result: string;
};

export type AzureAiConfig = {
  apiKey: string;
  deployment: string;
  endpoint: string;
};

export type AiClient = {
  createResponse: (input: string, signal?: AbortSignal) => Promise<string>;
};

export class AiServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}
