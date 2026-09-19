import 'dotenv/config';
import { readConfig } from '../src/config/env';
import { prepareDatabase } from '../src/storage/database';

const config = readConfig();
await prepareDatabase(config.DATABASE_URL);
await prepareDatabase(config.APP_DATABASE_URL);
