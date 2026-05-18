export const SEARCH_CONFIG = {
  // Auto-detect if content is current/timely
  autoDetectCurrentTopics: true,
  
  // Force search for these keywords
  alwaysSearch: ["latest", "breaking", "live", "2026", "real-time"],
  
  // Never search for these (too general)
  neverSearch: ["how to", "explain", "what is"],
  
  // Cache duration in milliseconds
  cacheTTL: 3600000, // 1 hour
  
  // Max results to return
  maxResults: 10,
  
  // Search timeout
  timeout: 8000,
};