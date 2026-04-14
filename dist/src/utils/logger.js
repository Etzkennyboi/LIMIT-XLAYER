// src/utils/logger.ts
export const logger = {
    info: (message, context) => {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`, context ? JSON.stringify(context) : '');
    },
    warn: (message, context) => {
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, context ? JSON.stringify(context) : '');
    },
    error: (message, context) => {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, context ? JSON.stringify(context) : '');
    },
};
