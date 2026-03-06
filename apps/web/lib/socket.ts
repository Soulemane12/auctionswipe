import { io } from "socket.io-client";

const SERVER_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";

export const socket = io(SERVER_URL, { autoConnect: true });
