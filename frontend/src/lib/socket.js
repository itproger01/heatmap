import { io } from 'socket.io-client';

export const socket = io('/', {
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity,
});
