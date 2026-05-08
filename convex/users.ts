import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAppSecret } from "./auth";

function publicUser(user: {
  _id: string;
  _creationTime: number;
  email: string;
  password: string;
  full_name: string;
}) {
  return {
    id: user._id,
    created_at: new Date(user._creationTime).toISOString(),
    email: user.email,
    password: user.password,
    full_name: user.full_name,
  };
}

export const getByEmail = query({
  args: {
    appSecret: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    requireAppSecret(args.appSecret);

    const user = await ctx.db
      .query("login")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    return user ? publicUser(user) : null;
  },
});

export const createUser = mutation({
  args: {
    appSecret: v.string(),
    email: v.string(),
    password: v.string(),
    fullName: v.string(),
  },
  handler: async (ctx, args) => {
    requireAppSecret(args.appSecret);

    const existing = await ctx.db
      .query("login")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existing) {
      throw new ConvexError("Email already registered");
    }

    const id = await ctx.db.insert("login", {
      email: args.email,
      password: args.password,
      full_name: args.fullName,
    });
    const user = await ctx.db.get(id);
    if (!user) {
      throw new ConvexError("User creation failed");
    }

    return publicUser(user);
  },
});
