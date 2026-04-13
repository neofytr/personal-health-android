/**
 * Backend Constants
 * Uses localhost — adb reverse tunnels USB to computer.
 * Works regardless of wifi network.
 */

const BACKEND_HOST = 'localhost';
const BACKEND_PORT = 8082;

export { BACKEND_HOST };
export const FASTAPI_PORT = BACKEND_PORT;
export const PROXY_PORT = 8083;
export const API_BASE = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
export const WS_BASE = `ws://${BACKEND_HOST}:${BACKEND_PORT}`;
export const API_TIMEOUT = 15000;
