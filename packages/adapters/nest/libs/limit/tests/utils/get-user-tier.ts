export async function getUserTier(userId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (userId <= 100) return resolve("enterprise");
    if (userId <= 1000) return resolve("pro");
    return resolve("basic");
  });
}
