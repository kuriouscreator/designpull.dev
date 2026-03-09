/**
 * Parse .env file content into an object
 * @param {string} content - Raw .env file content
 * @returns {Object<string, string>} Parsed environment variables
 * @example
 * parseEnv('KEY=value\n# Comment\nAPI_KEY=secret')
 * // => { KEY: 'value', API_KEY: 'secret' }
 */
export function parseEnv(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    result[key.trim()] = rest.join('=').trim();
  }
  return result;
}
