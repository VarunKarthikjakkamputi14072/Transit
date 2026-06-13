export type ChatCompletionResponse = {
  model: string;
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  provider: string;
};

export type RequestRecord = {
  id: string;
  endpoint: string;
  status: number;
  latency_ms: number;
  timestamp: string;
};

export type HourlyPoint = { hour: string; requests: number };
export type EndpointPoint = { endpoint: string; requests: number };

export type UsageSummary = {
  today: number;
  week: number;
  hourly_limit: number;
  remaining: number;
  hourly: HourlyPoint[];
  by_endpoint: EndpointPoint[];
  recent: RequestRecord[];
  cache_hits: number;
  cache_hit_rate: number;
  tokens_saved: number;
};
