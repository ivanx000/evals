export function extractJson(output: string): string {
  const jsonFence = output.match(/```json\s*\n([\s\S]*?)```/i);
  if (jsonFence) return jsonFence[1];
  const genericFence = output.match(/```(?:\w*\n)?([\s\S]*?)```/);
  if (genericFence) return genericFence[1];
  return output;
}
