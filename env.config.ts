import { str, num, secret, bool, url } from 'envforge';

export default {
  dbHost: str().default('localhost'),
  dbPort: num().default(5432),
  apiKey: secret(str()),
  debug: bool().default(false),
  apiUrl: url().required()
};
