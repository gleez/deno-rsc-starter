import { Logger as DenoLogger } from '@deno-lib/logger';

// Re-export the Logger type for consumers of this module
export type Logger = DenoLogger;

// Create and export a default logger instance
export const logger: Logger = new DenoLogger();
