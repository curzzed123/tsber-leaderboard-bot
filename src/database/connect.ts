import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

export async function connectDatabase(uri: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      mongoose.set('strictQuery', true);
      await mongoose.connect(uri);
      logger.info(`Connected to MongoDB (attempt ${attempt})`);
      return;
    } catch (error) {
      lastError = error;
      logger.error(`MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed:`, error);
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  logger.error('Failed to connect to MongoDB after all retries. Exiting.');
  throw lastError;
}
