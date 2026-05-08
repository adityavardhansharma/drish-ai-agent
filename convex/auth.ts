import { ConvexError } from "convex/values";

export function requireAppSecret(appSecret: string) {
  if (!process.env.CONVEX_APP_SECRET) {
    throw new ConvexError("CONVEX_APP_SECRET is not configured in Convex");
  }
  if (appSecret !== process.env.CONVEX_APP_SECRET) {
    throw new ConvexError("Unauthorized");
  }
}
