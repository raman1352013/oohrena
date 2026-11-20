import mongoose from "mongoose";

mongoose.set("strictQuery", true);

export async function connectDb(uri: string) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  // Build declared indexes (unique email/mobile/PAN, TTL on sessions, audit indexes).
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return mongoose.connection;
}

export const disconnectDb = () => mongoose.disconnect();
