-- we have a set of 4 keys, which operate on each other
local idKey = KEYS[1];
local uidKey = KEYS[2];
local secretKey = KEYS[3];
local throttleKey = KEYS[4];

-- id & action
local id = ARGV[1];
local action = ARGV[2];

-- optional, acts as alias to idKey if present
local uid = ARGV[3];

-- optional, remove entry after ttl
local ttl = tonumber(ARGV[4]) or 0;

-- optional, do not allow #create action on #idKey more than once in #throttle
local throttle = tonumber(ARGV[5]) or 0;

-- time when token was created
local created = ARGV[6];

-- optional, can be used to retrieve associated information
-- defaults to #idKey
local secret = ARGV[7];
local secretSettings = ARGV[8];

-- metadata associated with the challenge
local metadata = ARGV[9]

-- helper for empty vals
local function isempty(s)
  return s == false or s == nil or s == '';
end

-- we check if value exists before attempting to capture lock
-- because script execution is atomic, we do not need to make sure that we've captured the lock
if isempty(redis.call("GET", throttleKey)) ~= true then
  return redis.error_reply("429");
end

-- make sure that we own the "lock"
if throttle > 0 then
  redis.call("SET", throttleKey, "1", "EX", throttle, "NX");
end

local function insertToken(key, encoded)
  redis.call("HMSET", key, "id", id, "action", action, "uid", uid, "secret", secret, "created", created, "settings", secretSettings, "metadata", metadata, "related", encoded);
  -- put ttl if required
  if ttl > 0 then
    redis.call("EXPIRE", key, ttl);
  end
end

-- NOTICE:
-- On key recreation we will erase old notions of UID and Secret keys
local oldKeysJSON = redis.call("HGET", idKey, "related");
if isempty(oldKeysJSON) ~= true then
  redis.call("DEL", unpack(cjson.decode(oldKeysJSON)));
end

-- related keys
local related = {idKey};

-- gather keys
if secretKey ~= idKey then
  table.insert(related, secretKey);
end

-- gather keys
if uidKey ~= idKey then
  table.insert(related, uidKey);
end

local encoded = cjson.encode(related);
for i,key in ipairs(related) do
  insertToken(key, encoded);
end

return redis.status_reply("200");
