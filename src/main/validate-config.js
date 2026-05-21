const VALID_ID   = /^[0-9a-z]{1,32}$/;
const VALID_TAG  = /^[0-9a-zA-Z \-_]{1,50}$/;
const VALID_TYPE = new Set(['toggle', 'launcher', 'foreground', 'cheatsheet']);
const MAX_STR    = 500;

const STRING_FIELDS = ['label', 'note', 'onCmd', 'offCmd', 'launchCmd', 'content'];

function validateConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'config must be an object' };
  }
  if (!Array.isArray(data.commands)) {
    return { ok: false, error: 'commands must be an array' };
  }
  for (const cmd of data.commands) {
    if (!cmd || typeof cmd !== 'object') {
      return { ok: false, error: 'each command must be an object' };
    }
    if (typeof cmd.id !== 'string' || !VALID_ID.test(cmd.id)) {
      return { ok: false, error: `invalid id: ${cmd.id}` };
    }
    if (typeof cmd.label !== 'string' || cmd.label.length === 0 || cmd.label.length > MAX_STR) {
      return { ok: false, error: `invalid label on command ${cmd.id}` };
    }
    if (!VALID_TYPE.has(cmd.type)) {
      return { ok: false, error: `unknown type "${cmd.type}" on command ${cmd.id}` };
    }
    for (const field of STRING_FIELDS) {
      if (cmd[field] !== undefined && (typeof cmd[field] !== 'string' || cmd[field].length > MAX_STR)) {
        return { ok: false, error: `invalid field "${field}" on command ${cmd.id}` };
      }
    }
    if (cmd.autoRestore !== undefined && typeof cmd.autoRestore !== 'boolean') {
      return { ok: false, error: `invalid autoRestore on command ${cmd.id}` };
    }
    if (cmd.tags !== undefined) {
      if (!Array.isArray(cmd.tags)) {
        return { ok: false, error: `tags must be an array on command ${cmd.id}` };
      }
      for (const tag of cmd.tags) {
        if (typeof tag !== 'string' || !VALID_TAG.test(tag)) {
          return { ok: false, error: `invalid tag "${tag}" on command ${cmd.id}` };
        }
      }
    }
  }
  return { ok: true };
}

module.exports = { validateConfig };
