export function analyzeResponse(response: string): {
  hasNumbers: boolean;
  usesList: boolean;
  length: number;
  earlyEntity: string;
} {
  return {
    hasNumbers: /\d/.test(response),
    usesList: response.includes("-"),
    length: response.length,
    earlyEntity: response.split(" ").slice(0, 10).join(" "),
  };
}
