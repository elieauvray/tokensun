export type Provider = 'openai' | 'fake' | 'anthropic' | 'gemini' | 'mistral';

export type CostMode = 'reported' | 'estimated';

export interface ConnectionConfig {
  baseUrl?: string;
  models?: string[];
  pricing?: PricingTable;
  openaiOrg?: string;
  openaiProject?: string;
  anthropicVersion?: string;
}

export interface ConnectionSecrets {
  apiKey: string;
}

export interface ConnectionRecord {
  id: string;
  provider: Provider;
  name: string;
  config: ConnectionConfig;
  secrets: ConnectionSecrets;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSession {
  upsunApiToken: string;
  upsunOrgId: string;
  upsunProjectId: string;
}

export interface UsageBucket {
  connectionId: string;
  provider: Provider;
  model: string;
  projectId?: string;
  userId?: string;
  apiKeyId?: string;
  batch?: boolean;
  bucketStart: string;
  bucketGranularity: 'hour' | 'week' | 'month' | 'year';
  inputTokens: number;
  inputCachedTokens: number;
  inputAudioTokens: number;
  outputTokens: number;
  outputAudioTokens: number;
  totalTokens: number;
  numModelRequests: number;
  costUsd: number;
  costMode: CostMode;
}

export interface SessionState {
  workspace?: WorkspaceSession;
  connections: ConnectionRecord[];
  usage: UsageBucket[];
}

export interface PricingEntry {
  inputUsdPer1k: number;
  outputUsdPer1k: number;
}

export type PricingTable = Record<string, PricingEntry>;
