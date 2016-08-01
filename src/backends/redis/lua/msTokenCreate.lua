-- we have a set of 4 keys, which operate on each other
local idKey = KEYS[1];
local uidKey = KEYS[2];
local secretKey = KEYS[3];
local throttleKey = KEYS[4];

-- id & action
local id = ARGV[1];
local action = ARGV[2];

-- optional, acts as alias to idKey if present
local uid = ARGV[3] or "";

-- optional, remove entry after ttl
local ttl = tonumber(ARGV[4]) or 0;

-- optional, do not allow #create action on #idKey more than once in #throttle
local throttle = tonumber(ARGV[5]) or 0;

-- optional, can be used to retrieve associated information
-- defaults to #idKey
local secret = ARGV[6] or "";

-- metadata associated with the challenge
-- encoded JSON, contains multi-field stringified JSON
local metadata = cjson.decode(ARGV[7]);

-- make sure that we own the "lock"
if throttle > 0 and redis.call("SET", throttleKey, "EX", throttle, "NX") == nil then
  -- return 429 as error code
  return redis.error_reply("429");
end

local function insertToken(key)
  redis.call("HMSET", key, "id", id, "action", action, "uid", uid, "secret", secret, unpack(metadata));
  if ttl > 0 then
    redis.call("EXPIRE", key, ttl);
  end
end

-- insert basic data
insertToken(idKey);

-- insert secret -> action/id access pattern
if secretKey ~= idKey then
  insertToken(secretKey);
end

-- insert uid -> action/id access pattern
if uidKey ~= idKey then
  insertToken(uidKey);
end

return redis.status_reply("200");
