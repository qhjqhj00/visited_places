import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the repo-root .env (MINIMAX_API_KEY, MINIMAX_MODEL_NAME). Must be
// imported before any module that reads process.env.
const dir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(dir, '../../../.env') });
