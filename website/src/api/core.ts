const protocol = window.location.protocol;
const socketHost = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_SOCKET
  : import.meta.env.VITE_PROD_SOCKET;

// raw server
export const apiUrl = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_API
  : import.meta.env.VITE_PROD_API;
// derivative server
export const derivativeUrl =
  (import.meta.env.DEV
    ? import.meta.env.VITE_DERIVATIVE_DEV_API
    : import.meta.env.VITE_DERIVATIVE_PROD_API) + "/api/v1/models";
// property server
export const propertyUrl =
  (import.meta.env.DEV
    ? import.meta.env.VITE_PROPERTY_DEV_API
    : import.meta.env.VITE_PROPERTY_PROD_API) + "/api/v1/models";

// socket server
export const socketUrl = (protocol === "http:" ? "ws" : "wss") + socketHost;
// peer server
export const peerHost = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_PEER_HOST
  : import.meta.env.VITE_PROD_PEER_HOST;
export const peerPORT = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_PEER_PORT
  : import.meta.env.VITE_PROD_PEER_PORT;
