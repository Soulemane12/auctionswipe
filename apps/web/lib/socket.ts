import { io } from "socket.io-client";
import { getServerUrl } from "./serverUrl";

const SERVER_URL = getServerUrl();

export const socket = io(SERVER_URL, { autoConnect: true });
