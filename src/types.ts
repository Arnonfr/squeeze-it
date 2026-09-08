export interface MvpBrief {
  scannedUrl: string;
  siteName: string;
  siteSummary: string;
  coreValue: string;
  targetUser: string;
  observedFeatures: string[];
  featureRequests: string[];
  mvp: {
    oneLine: string;
    mustHave: string[];
    cut: string[];
    buildOrder: string[];
    successMetric: string;
  };
  assumptions: string[];
  model: string;
}

export interface ApiError {
  error: string;
}
