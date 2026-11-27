import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
const blocked=()=>{throw new Error('BENCHMARK_OFFLINE_NETWORK_BLOCKED');};
globalThis.fetch=blocked;
http.request=blocked;http.get=blocked;https.request=blocked;https.get=blocked;
net.Socket.prototype.connect=blocked;
