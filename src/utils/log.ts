/** @file Provides wrapper functions for printing out debug messages. */

import {getPref} from './settings.js';

/**
 * Log a message with a [Soft Corners] prefix, but only
 * when debug mode is enabled.
 */
export function logDebug(...args: unknown[]) {
    if (getPref('debug-mode')) {
        console.log(`[Soft Corners] ${args}`);
    }
}

/**
 * Log an error with a [Soft Corners] prefix.
 */
export function logError(...args: unknown[]) {
    console.error(`[Soft Corners] ${args}`);
}
