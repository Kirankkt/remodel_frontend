import { decodeTaskString, encodeTaskString } from './js/state.js';

const initialStr = JSON.stringify({ name: 'Task 1', role: 'Plumbing', w: 1, h: 2, p: 65, done: false });
const decoded = decodeTaskString(initialStr);
console.log("Decoded:", decoded);

const encoded = encodeTaskString(decoded);
console.log("Encoded:", encoded);

if (decoded.progress === 65 && typeof encoded === 'string') {
  console.log("SUCCESS!");
} else {
  console.log("FAILED");
}
