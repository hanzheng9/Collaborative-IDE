export type LatencySummary = {
  average: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
};

export function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }

  if (percentileValue <= 0) {
    return Math.min(...values);
  }

  if (percentileValue >= 100) {
    return Math.max(...values);
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;

  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

export function summarizeLatencies(latencies: number[]): LatencySummary {
  return {
    average: Math.round(average(latencies)),
    max: latencies.length > 0 ? Math.max(...latencies) : 0,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99)
  };
}
